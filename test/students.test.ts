import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { plans, roles } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { assignSubjectTeacher, getAcademicOverview, setupAcademics, updateClass } from "@/lib/services/academics";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import {
  createStudent,
  getStudent,
  listStudents,
  normalizePhone,
  setStudentStatus,
  studentInputSchema,
  guardianInputSchema,
  updateStudent,
} from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let overview: Awaited<ReturnType<typeof getAcademicOverview>>;

const classId = (name: string) => overview.levels.flatMap((l) => l.classes).find((c) => c.name === name)!.id;
const subjectId = (name: string) => overview.subjects.find((s) => s.name === name)!.id;

function student(firstName: string, lastName: string, cls: string, extra: Record<string, unknown> = {}) {
  return studentInputSchema.parse({ firstName, lastName, gender: "female", classId: classId(cls), ...extra });
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, {
    name: "Chief Okafor",
    email: "chief@royal.test",
    password: "RoyalSchool1",
    schoolName: "Royal Heights Academy",
  });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, {
    template: "nigerian",
    sections: ["junior_secondary", "senior_secondary"],
    arms: ["Gold", "Silver"],
    sessionName: "2026/2027",
  });
  overview = await getAcademicOverview(database.db, owner);
});

afterAll(async () => {
  await database.close();
});

describe("phone numbers", () => {
  it("normalises Nigerian formats to +234", () => {
    expect(normalizePhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalizePhone("234-803-123-4567")).toBe("+2348031234567");
    expect(normalizePhone("+234 803 123 4567")).toBe("+2348031234567");
    expect(normalizePhone("8031234567")).toBe("+2348031234567");
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("academic setup", () => {
  it("creates JSS 1 to SS 3 with arms, three terms, and subjects per section", () => {
    expect(overview.levels.map((l) => l.name)).toEqual(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);
    expect(overview.levels[0].classes.map((c) => c.name)).toEqual(["JSS 1 Gold", "JSS 1 Silver"]);
    expect(overview.currentSession?.name).toBe("2026/2027");
    expect(overview.sessions[0].terms.map((t) => t.name)).toEqual(["First Term", "Second Term", "Third Term"]);
    expect(overview.currentTerm?.number).toBe(1);
    const jss1 = overview.levels[0];
    const ss1 = overview.levels[3];
    const names = (ids: string[]) => overview.subjects.filter((s) => ids.includes(s.id)).map((s) => s.name);
    expect(names(jss1.subjectIds)).toContain("Basic Technology");
    expect(names(jss1.subjectIds)).not.toContain("Physics");
    expect(names(ss1.subjectIds)).toContain("Physics");
    expect(names(ss1.subjectIds)).toContain("English Language");
    expect(overview.levelSubjects.find((l) => l.levelId === ss1.id && l.subjectId === subjectId("Physics"))?.isElective).toBe(true);
  });

  it("refuses to run setup twice", async () => {
    await expect(
      setupAcademics(database.db, owner, { template: "nigerian", sections: ["primary"], arms: [], sessionName: "2026/2027" }),
    ).rejects.toThrow(/already set up/);
  });
});

describe("students", () => {
  let adaId: string;

  it("assigns sequential admission numbers and links guardians", async () => {
    const parent = guardianInputSchema.parse({ name: "Mrs Ngozi Eze", relationship: "Mother", phone: "0803 555 1234" });
    const ada = await createStudent(database.db, owner, student("Ada", "Eze", "JSS 1 Gold", { medicalNotes: "Asthmatic", genotype: "AS" }), [parent]);
    const obi = await createStudent(database.db, owner, student("Obi", "Eze", "SS 2 Silver"), [
      guardianInputSchema.parse({ name: "Mrs Ngozi Eze", relationship: "Mother", phone: "+2348035551234" }),
    ]);
    adaId = ada.id;
    expect(ada.admissionNo).toMatch(/^RHA\/\d{4}\/0001$/);
    expect(obi.admissionNo).toMatch(/\/0002$/);

    const profile = await getStudent(database.db, owner, ada.id);
    expect(profile?.guardians).toHaveLength(1);
    expect(profile?.siblings.map((s) => s.firstName)).toEqual(["Obi"]);
    expect(profile?.history[0]).toMatchObject({ className: "JSS 1 Gold", sessionName: "2026/2027", outcome: "current" });
  });

  it("rejects a reused admission number", async () => {
    await expect(createStudent(database.db, owner, student("Dup", "Licate", "JSS 1 Gold", { admissionNo: "RHA/2026/0001" }), [])).rejects.toThrow(
      /already used/,
    );
  });

  it("keeps class history when a student moves class", async () => {
    const profile = await getStudent(database.db, owner, adaId);
    const s = profile!.student;
    await updateStudent(database.db, owner, adaId, { ...studentInputSchema.parse({ ...s, middleName: s.middleName ?? undefined }), classId: classId("JSS 1 Silver") });
    const after = await getStudent(database.db, owner, adaId);
    expect(after?.student.className).toBe("JSS 1 Silver");
    expect(after?.history.map((h) => `${h.className}:${h.outcome}`)).toEqual(["JSS 1 Silver:current", "JSS 1 Gold:transferred"]);
  });

  it("searches by name and admission number, and filters by status", async () => {
    expect((await listStudents(database.db, owner, { q: "ada eze" })).total).toBe(1);
    expect((await listStudents(database.db, owner, { q: "0002" })).rows[0].firstName).toBe("Obi");
    expect((await listStudents(database.db, owner, { q: "100%_" })).total).toBe(0);
    const obi = (await listStudents(database.db, owner, { q: "Obi" })).rows[0];
    await setStudentStatus(database.db, owner, obi.id, "withdrawn");
    expect((await listStudents(database.db, owner)).total).toBe(1);
    expect((await listStudents(database.db, owner, { status: "withdrawn" })).total).toBe(1);
  });

  it("shows a subject teacher only their own classes, and hides medical notes", async () => {
    const [teacherRole] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "subject_teacher")));
    const { token } = await inviteStaff(database.db, owner, { name: "Mr Bayo", email: "bayo@royal.test", roleIds: [teacherRole.id] });
    const { userId } = await acceptInvitation(database.db, token, { name: "Mr Bayo", password: "Teacher123" });
    const teacher = (await loadAccess(database.db, userId, owner.school.slug))!;

    expect((await listStudents(database.db, teacher)).rows).toHaveLength(0);
    await assignSubjectTeacher(database.db, owner, { classId: classId("JSS 1 Silver"), subjectId: subjectId("Mathematics"), membershipId: teacher.membershipId });
    const visible = await listStudents(database.db, teacher);
    expect(visible.rows.map((r) => r.firstName)).toEqual(["Ada"]);
    const profile = await getStudent(database.db, teacher, adaId);
    expect(profile?.student.medicalNotes).toBeNull();
    expect(profile?.student.genotype).toBeNull();
    expect((await getStudent(database.db, owner, adaId))?.student.medicalNotes).toBe("Asthmatic");

    await expect(createStudent(database.db, teacher, student("No", "Access", "JSS 1 Gold"), [])).rejects.toThrow(/permission/);
    await updateClass(database.db, owner, classId("SS 2 Silver"), { classTeacherId: teacher.membershipId, capacity: 40 });
    expect((await listStudents(database.db, teacher, { status: "all" })).rows.map((r) => r.firstName).sort()).toEqual(["Ada", "Obi"]);
  });

  it("enforces the plan's student limit", async () => {
    await database.db.update(plans).set({ limits: sql`jsonb_set(${plans.limits}, '{students}', '2')` }).where(eq(plans.key, "free"));
    const limited = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
    await createStudent(database.db, limited, student("Second", "Active", "SS 1 Gold"), []);
    await expect(createStudent(database.db, limited, student("Third", "Active", "SS 1 Gold"), [])).rejects.toThrow(/allows 2 students/);
    const obi = (await listStudents(database.db, limited, { q: "Obi", status: "all" })).rows[0];
    await expect(setStudentStatus(database.db, limited, obi.id, "active")).rejects.toThrow(/allows 2/);
  });
});
