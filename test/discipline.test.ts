import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { notifications, outboundMessages, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { assignSubjectTeacher, getAcademicOverview, setupAcademics, updateClass } from "@/lib/services/academics";
import { behaviourSchema, disciplineSettingsSchema, getLeaderboard, listBehaviour, recordBehaviour, resolveIncident, saveDisciplineSettings, studentConduct } from "@/lib/services/discipline";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, guardianInputSchema, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let formTeacher: Access;
let subjectTeacher: Access;
const kids: Record<string, string> = {};
const today = new Date().toISOString().slice(0, 10);

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Order", email: "order@conduct.test", password: "Conduct123", schoolName: "Conduct College" });
  await database.db.update(schools).set({ planKey: "basic" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold", "Diamond"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  const gold = overview.levels[0].classes.find((c) => c.name.endsWith("Gold"))!.id;
  const diamond = overview.levels[0].classes.find((c) => c.name.endsWith("Diamond"))!.id;
  formTeacher = await staff("class_teacher", "form@conduct.test");
  subjectTeacher = await staff("subject_teacher", "subject@conduct.test");
  await updateClass(database.db, owner, gold, { classTeacherId: formTeacher.membershipId, capacity: null });
  await assignSubjectTeacher(database.db, owner, { classId: diamond, subjectId: overview.subjects[0].id, membershipId: subjectTeacher.membershipId });
  for (const [name, classId] of [
    ["Ada", gold],
    ["Bayo", gold],
    ["Chi", diamond],
  ] as const) {
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Ola", gender: "female", classId }), [
      guardianInputSchema.parse({ name: `Parent of ${name}`, phone: `0803000000${Object.keys(kids).length}`, email: `${name.toLowerCase()}.parent@conduct.test` }),
    ]);
    kids[name] = s.id;
  }
});

afterAll(async () => {
  await database.close();
});

describe("behaviour log", () => {
  it("lets teachers record only for students they teach", async () => {
    await recordBehaviour(database.db, formTeacher, behaviourSchema.parse({ studentId: kids.Ada, kind: "merit", category: "Kindness", description: "Helped a new student settle in.", occurredOn: today }));
    await recordBehaviour(database.db, subjectTeacher, behaviourSchema.parse({ studentId: kids.Chi, kind: "incident", category: "Lateness", severity: "minor", description: "Late to class twice.", occurredOn: today }));
    await expect(recordBehaviour(database.db, subjectTeacher, behaviourSchema.parse({ studentId: kids.Ada, kind: "merit", category: "Kindness", occurredOn: today }))).rejects.toThrow(/students you teach/);
    expect(behaviourSchema.safeParse({ studentId: kids.Ada, kind: "incident", category: "Fighting", description: "x", occurredOn: today }).success).toBe(false);
    expect((await listBehaviour(database.db, subjectTeacher)).rows.map((r) => r.firstName)).toEqual(["Chi"]);
  });

  it("tells parents by the school's rules", async () => {
    const minor = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(outboundMessages).where(eq(outboundMessages.to, "chi.parent@conduct.test")));
    expect(minor).toHaveLength(0); // minor incidents stay in school by default
    const merit = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(outboundMessages).where(eq(outboundMessages.to, "ada.parent@conduct.test")));
    expect(merit[0]?.subject).toMatch(/well done, Ada/);

    const { told } = await recordBehaviour(
      database.db,
      formTeacher,
      behaviourSchema.parse({ studentId: kids.Bayo, kind: "incident", category: "Fighting", severity: "serious", description: "Fought during break.", actionTaken: "Parents invited", occurredOn: today }),
    );
    expect(told).toBe(1);
    await saveDisciplineSettings(database.db, owner, disciplineSettingsSchema.parse({ meritCategories: ["Kindness"], incidentCategories: ["Lateness", "Fighting"], notifyIncidents: "none", notifyMerits: false }));
    owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
    const quiet = await recordBehaviour(database.db, owner, behaviourSchema.parse({ studentId: kids.Bayo, kind: "incident", category: "Fighting", severity: "serious", description: "Second fight this week.", occurredOn: today }));
    expect(quiet.told).toBe(0);
    expect(await withTenant(database.db, owner.school.id, (tx) => tx.select().from(notifications))).toBeDefined();
  });

  it("keeps serious cases open until someone with the permission closes them", async () => {
    const open = (await listBehaviour(database.db, owner, { status: "open" })).rows;
    expect(open).toHaveLength(2);
    await expect(resolveIncident(database.db, subjectTeacher, { id: open[0].r.id, actionTaken: "" })).rejects.toThrow(/permission/);
    await resolveIncident(database.db, formTeacher, { id: open[0].r.id, actionTaken: "Two days' suspension" });
    expect((await listBehaviour(database.db, owner, { status: "open" })).rows).toHaveLength(1);
  });

  it("ranks students and sums each student's conduct", async () => {
    const board = await getLeaderboard(database.db, owner);
    expect(board.stars[0]).toMatchObject({ firstName: "Ada", points: 1 });
    expect(board.watch[0]).toMatchObject({ firstName: "Bayo", incidents: 2, points: -10 });
    const c = await studentConduct(database.db, owner, kids.Bayo);
    expect(c).toMatchObject({ incidents: 2, merits: 0, points: -10 });
  });
});
