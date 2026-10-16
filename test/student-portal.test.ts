import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { roles, schools, users } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics, updateClass } from "@/lib/services/academics";
import { createAnnouncement } from "@/lib/services/announcements";
import { saveCommsSettings } from "@/lib/services/credits";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { authenticateStudent, issueStudentLogins, setOwnPassword, studentLoginStatus } from "@/lib/services/student-accounts";
import { getStudentHome, getStudentResults, myStudentRecord } from "@/lib/services/student-portal";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let formTeacher: Access;
let gold: string;
let diamond: string;
const kids: Record<string, { id: string; admissionNo: string }> = {};

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Okon", email: "okon@learn.test", password: "Learning1", schoolName: "Learning Academy" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, owner.school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold", "Diamond"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  const level = overview.levels[0].classes;
  gold = level.find((c) => c.name.endsWith("Gold"))!.id;
  diamond = level.find((c) => c.name.endsWith("Diamond"))!.id;
  for (const [name, classId] of [
    ["Tobi", gold],
    ["Uche", gold],
    ["Vera", diamond],
  ] as const) {
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Ade", gender: "female", classId }), []);
    kids[name] = { id: s.id, admissionNo: s.admissionNo };
  }
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "class_teacher")));
  const { token } = await inviteStaff(database.db, owner, { name: "Mr Form", email: "form@learn.test", roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: "Mr Form", password: "Teacher123" });
  formTeacher = (await loadAccess(database.db, userId, owner.school.slug))!;
  await updateClass(database.db, owner, gold, { classTeacherId: formTeacher.membershipId, capacity: null });
});

afterAll(async () => {
  await database.close();
});

describe("student logins", () => {
  let tobiPassword = "";

  it("issues logins once and prints each temporary password once", async () => {
    const slips = await issueStudentLogins(database.db, owner, { studentIds: [kids.Tobi.id, kids.Uche.id] });
    expect(slips).toHaveLength(2);
    expect(slips[0].password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    tobiPassword = slips.find((s) => s.studentId === kids.Tobi.id)!.password;
    expect(await issueStudentLogins(database.db, owner, { studentIds: [kids.Tobi.id] })).toHaveLength(0);
    const status = await studentLoginStatus(database.db, owner);
    expect(status.filter((s) => s.hasLogin)).toHaveLength(2);
    // Only a hash is stored.
    const [u] = await database.db.select().from(users).where(eq(users.username, `${owner.school.slug}/${kids.Tobi.admissionNo}`.toLowerCase()));
    expect(u.passwordHash).not.toContain(tobiPassword);
  });

  it("lets a teacher issue logins only for their own class", async () => {
    await expect(issueStudentLogins(database.db, formTeacher, { studentIds: [kids.Vera.id] })).rejects.toThrow(/permission|only issue logins/);
  });

  it("signs a student in with school code, admission number and password, then makes them choose their own", async () => {
    await expect(authenticateStudent(database.db, { school: owner.school.slug, admissionNo: kids.Tobi.admissionNo, password: "wrong-pass" }, "9.9.9.9")).rejects.toThrow(/don't match/);
    const first = await authenticateStudent(database.db, { school: owner.school.slug.toUpperCase(), admissionNo: kids.Tobi.admissionNo.toLowerCase(), password: tobiPassword }, "9.9.9.9");
    expect(first.mustChangePassword).toBe(true);
    await setOwnPassword(database.db, first.userId, "mynewpass");
    const again = await authenticateStudent(database.db, { school: owner.school.slug, admissionNo: kids.Tobi.admissionNo, password: "mynewpass" }, "9.9.9.9");
    expect(again.mustChangePassword).toBe(false);
    await expect(authenticateStudent(database.db, { school: owner.school.slug, admissionNo: kids.Tobi.admissionNo, password: tobiPassword }, "9.9.9.9")).rejects.toThrow(/don't match/);

    const [reset] = await issueStudentLogins(database.db, owner, { studentIds: [kids.Tobi.id], reset: true });
    await expect(authenticateStudent(database.db, { school: owner.school.slug, admissionNo: kids.Tobi.admissionNo, password: "mynewpass" }, "9.9.9.9")).rejects.toThrow(/don't match/);
    expect((await authenticateStudent(database.db, { school: owner.school.slug, admissionNo: kids.Tobi.admissionNo, password: reset.password }, "9.9.9.9")).mustChangePassword).toBe(true);
  });

  it("shows a student their own school, class and announcements, and results only when allowed", async () => {
    const [slip] = await issueStudentLogins(database.db, owner, { studentIds: [kids.Vera.id] });
    const { userId } = await authenticateStudent(database.db, { school: owner.school.slug, admissionNo: kids.Vera.admissionNo, password: slip.password }, "8.8.8.8");
    const me = await myStudentRecord(database.db, userId);
    expect(me).toMatchObject({ firstName: "Vera", className: "JSS 1 Diamond" });

    await createAnnouncement(database.db, owner, { title: "Spelling bee", body: "Students: the spelling bee is on Friday.", audience: "students", classIds: [], pinned: false, email: false, sms: false });
    await createAnnouncement(database.db, owner, { title: "PTA levy", body: "Parents only.", audience: "parents", classIds: [], pinned: false, email: false, sms: false });
    await createAnnouncement(database.db, owner, { title: "Gold excursion", body: "JSS 1 Gold only.", audience: "classes", classIds: [gold], pinned: false, email: false, sms: false });
    const home = await getStudentHome(database.db, userId);
    expect(home.news.map((n) => n.a.title)).toEqual(["Spelling bee"]);

    expect((await getStudentResults(database.db, userId)).allowed).toBe(false);
    await saveCommsSettings(database.db, owner, { absenceAlerts: true, resultAlerts: true, paymentAlerts: true, smsAlerts: false, parentMessaging: true, studentResults: true, limitHours: false });
    expect((await getStudentResults(database.db, userId)).allowed).toBe(true);
  });
});
