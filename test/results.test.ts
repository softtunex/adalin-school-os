import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { assignSubjectTeacher, getAcademicOverview, setupAcademics, updateClass } from "@/lib/services/academics";
import { getAssessmentConfig, saveComponents } from "@/lib/services/assessment";
import { getAttendanceSheet, lagosToday, listAttendanceClasses, saveAttendance } from "@/lib/services/attendance";
import { suggestComment } from "@/lib/services/ai-comments";
import { getClassResults, getScoreSheet, listMySheets, saveScores, saveTermReport, setClassResultStatus, setSheetStatus } from "@/lib/services/results";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let formTeacher: Access;
let mathsTeacher: Access;
let classId: string;
let maths: string;
let english: string;
const kids: Record<string, string> = {};

async function staff(name: string, email: string, key: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name, email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name, password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

function yesterday() {
  const d = new Date(`${lagosToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mr Adeleke", email: "adeleke@peak.test", password: "PeakSchool1", schoolName: "Peak College" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  classId = overview.levels[0].classes[0].id;
  maths = overview.subjects.find((s) => s.name === "Mathematics")!.id;
  english = overview.subjects.find((s) => s.name === "English Studies")!.id;
  for (const name of ["Ada", "Bayo", "Chi"]) {
    kids[name] = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Test", gender: "female", classId }), [])).id;
  }
  formTeacher = await staff("Mrs Form", "form@peak.test", "class_teacher");
  mathsTeacher = await staff("Mr Maths", "maths@peak.test", "subject_teacher");
  await updateClass(database.db, owner, classId, { classTeacherId: formTeacher.membershipId, capacity: null });
  await assignSubjectTeacher(database.db, owner, { classId, subjectId: maths, membershipId: mathsTeacher.membershipId });
});

afterAll(async () => {
  await database.close();
});

describe("attendance", () => {
  it("lets the form teacher take today's register, defaulting everyone to present", async () => {
    const classesForTeacher = await listAttendanceClasses(database.db, formTeacher, lagosToday());
    expect(classesForTeacher.map((c) => c.name)).toEqual(["JSS 1 Gold"]);
    const sheet = await getAttendanceSheet(database.db, formTeacher, classId, lagosToday());
    expect(sheet.taken).toBe(false);
    expect(sheet.students.every((s) => s.status === "present")).toBe(true);
    await saveAttendance(database.db, formTeacher, {
      classId,
      date: lagosToday(),
      records: [
        { studentId: kids.Ada, status: "present" },
        { studentId: kids.Bayo, status: "absent", note: "Sick" },
        { studentId: kids.Chi, status: "late" },
      ],
    });
    const after = await listAttendanceClasses(database.db, owner, lagosToday());
    expect(after[0]).toMatchObject({ taken: true, present: 1, absent: 1, late: 1, takenBy: "Mrs Form" });
  });

  it("keeps subject teachers, future dates and past edits in their lanes", async () => {
    expect(await listAttendanceClasses(database.db, mathsTeacher, lagosToday())).toEqual([]);
    await expect(getAttendanceSheet(database.db, mathsTeacher, classId, lagosToday())).rejects.toThrow(/can't take attendance/);
    await expect(saveAttendance(database.db, formTeacher, { classId, date: "2999-01-01", records: [] })).rejects.toThrow(/future/);
    await expect(saveAttendance(database.db, formTeacher, { classId, date: yesterday(), records: [] })).rejects.toThrow(/past days/);
    await saveAttendance(database.db, owner, { classId, date: yesterday(), records: [{ studentId: kids.Ada, status: "present" }, { studentId: kids.Bayo, status: "present" }, { studentId: kids.Chi, status: "excused" }] });
  });
});

describe("scores and results", () => {
  it("uses the default 20/20/60 assessment and lets the maths teacher see only maths", async () => {
    const config = await getAssessmentConfig(database.db, owner);
    expect(config.components.map((c) => `${c.name}:${c.maxScore}`)).toEqual(["1st CA:20", "2nd CA:20", "Exam:60"]);
    expect(config.bands[0].grade).toBe("A1");
    const mine = await listMySheets(database.db, mathsTeacher);
    expect(mine.sheets.map((s) => s.subjectName)).toEqual(["Mathematics"]);
    await expect(getScoreSheet(database.db, mathsTeacher, classId, english)).rejects.toThrow(/can't open/);
  });

  it("saves scores within limits and computes the class", async () => {
    const config = await getAssessmentConfig(database.db, owner);
    const [ca1, ca2, exam] = config.components.map((c) => c.id);
    const entries = (id: string, a: number, b: number, c: number) => [
      { studentId: id, componentId: ca1, score: a },
      { studentId: id, componentId: ca2, score: b },
      { studentId: id, componentId: exam, score: c },
    ];
    await saveScores(database.db, mathsTeacher, { classId, subjectId: maths, entries: [...entries(kids.Ada, 18, 17, 50), ...entries(kids.Bayo, 10, 12, 30), ...entries(kids.Chi, 18, 17, 50)] });
    await expect(saveScores(database.db, mathsTeacher, { classId, subjectId: maths, entries: [{ studentId: kids.Ada, componentId: ca1, score: 25 }] })).rejects.toThrow(/between 0 and 20/);
    await expect(saveScores(database.db, mathsTeacher, { classId, subjectId: english, entries: entries(kids.Ada, 10, 10, 10) })).rejects.toThrow(/can't enter/);

    const results = await getClassResults(database.db, owner, classId);
    const ada = results.students.find((s) => s.firstName === "Ada")!;
    const chi = results.students.find((s) => s.firstName === "Chi")!;
    expect(ada.result.subjects[maths]).toMatchObject({ total: 85, grade: "A1", position: 1 });
    expect(chi.result.position).toBe(1);
    expect(results.students.find((s) => s.firstName === "Bayo")!.result).toMatchObject({ average: 52, position: 3 });
    expect(results.subjects.map((s) => s.name)).toEqual(["Mathematics"]);
    expect(ada.attendance.present).toBe(2);
    expect(chi.attendance).toMatchObject({ late: 1, excused: 1 });
    expect(results.attendanceDays).toBe(2);
  });

  it("locks a submitted sheet until the class teacher reopens it", async () => {
    const config = await getAssessmentConfig(database.db, owner);
    await setSheetStatus(database.db, mathsTeacher, { classId, subjectId: maths, status: "submitted" });
    await expect(saveScores(database.db, mathsTeacher, { classId, subjectId: maths, entries: [{ studentId: kids.Ada, componentId: config.components[0].id, score: 19 }] })).rejects.toThrow(/already submitted/);
    await expect(setSheetStatus(database.db, mathsTeacher, { classId, subjectId: maths, status: "draft" })).rejects.toThrow(/class teacher or principal/);
    await setSheetStatus(database.db, formTeacher, { classId, subjectId: maths, status: "draft" });
    await saveScores(database.db, mathsTeacher, { classId, subjectId: maths, entries: [{ studentId: kids.Ada, componentId: config.components[0].id, score: 19 }] });
  });

  it("only lets the form teacher write the class comment and the principal the principal's", async () => {
    await saveTermReport(database.db, formTeacher, { studentId: kids.Ada, classTeacherComment: "A focused, kind student.", ratings: { Punctuality: 5, Neatness: 4, Nonsense: 3 } });
    await expect(saveTermReport(database.db, mathsTeacher, { studentId: kids.Ada, classTeacherComment: "x" })).rejects.toThrow(/class teacher/);
    await expect(saveTermReport(database.db, formTeacher, { studentId: kids.Ada, principalComment: "x" })).rejects.toThrow(/principal/);
    await saveTermReport(database.db, owner, { studentId: kids.Ada, principalComment: "Keep it up." });
    const ada = (await getClassResults(database.db, owner, classId)).students.find((s) => s.firstName === "Ada")!;
    expect(ada.report).toMatchObject({ classTeacherComment: "A focused, kind student.", principalComment: "Keep it up.", ratings: { Punctuality: 5, Neatness: 4 } });
  });

  it("drafts comments with AI for the same people who may write them", async () => {
    process.env.AI_PROVIDER = "fake";
    const withAi = (a: Access): Access => ({ ...a, plan: { ...a.plan, key: "standard", features: [...a.plan.features, "ai"] } });
    try {
      expect(await suggestComment(database.db, withAi(formTeacher), { studentId: kids.Ada, who: "teacher" })).toMatch(/hardworking/);
      await expect(suggestComment(database.db, withAi(mathsTeacher), { studentId: kids.Ada, who: "teacher" })).rejects.toThrow(/class teacher/);
      await expect(suggestComment(database.db, withAi(formTeacher), { studentId: kids.Ada, who: "principal" })).rejects.toThrow(/principal/);
      expect(await suggestComment(database.db, withAi(owner), { studentId: kids.Ada, who: "principal", teacherComment: "Good term." })).toBeTruthy();
      await expect(suggestComment(database.db, formTeacher, { studentId: kids.Ada, who: "teacher" })).rejects.toThrow(/Standard plan/);
    } finally {
      delete process.env.AI_PROVIDER;
    }
  });

  it("on Free, publishes straight from open and locks everything once published", async () => {
    await setClassResultStatus(database.db, owner, { classId, status: "published", nextTermBegins: "2027-01-06" });
    const config = await getAssessmentConfig(database.db, owner);
    await expect(saveScores(database.db, owner, { classId, subjectId: maths, entries: [{ studentId: kids.Ada, componentId: config.components[0].id, score: 1 }] })).rejects.toThrow(/locked/);
    await expect(saveTermReport(database.db, formTeacher, { studentId: kids.Ada, classTeacherComment: "change" })).rejects.toThrow(/locked/);
    await expect(setClassResultStatus(database.db, formTeacher, { classId, status: "open" })).rejects.toThrow(/permission/);
    await setClassResultStatus(database.db, owner, { classId, status: "open" });
  });

  it("on paid plans, requires review then approval before publishing", async () => {
    await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, owner.school.id));
    const paid = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
    const paidForm = (await loadAccess(database.db, formTeacher.user.id, owner.school.slug))!;
    await expect(setClassResultStatus(database.db, paid, { classId, status: "published" })).rejects.toThrow(/reviewed and approved/);
    await expect(setClassResultStatus(database.db, paidForm, { classId, status: "approved" })).rejects.toThrow(/open to approved/);
    await setClassResultStatus(database.db, paidForm, { classId, status: "reviewed" });
    await expect(setClassResultStatus(database.db, paidForm, { classId, status: "approved" })).rejects.toThrow(/permission/);
    await setClassResultStatus(database.db, paid, { classId, status: "approved" });
    await setClassResultStatus(database.db, paid, { classId, status: "published" });
    expect((await getClassResults(database.db, paid, classId)).status).toBe("published");
  });

  it("lets a school switch its split after scores exist, deleting dropped columns only on confirmation", async () => {
    const before = await getAssessmentConfig(database.db, owner);
    const [ca1, ca2, exam] = before.components.map((c) => c.id);
    expect(before.scoreCounts[ca2]).toBeGreaterThan(0);
    const fortySixty = [{ id: ca1, name: "Test", maxScore: 40 }, { id: exam, name: "Exam", maxScore: 60 }];
    await expect(saveComponents(database.db, owner, fortySixty)).rejects.toThrow(/would delete \d+ recorded scores/);
    await expect(saveComponents(database.db, owner, [{ id: ca1, name: "1st CA", maxScore: 10 }, { id: ca2, name: "2nd CA", maxScore: 30 }, { id: exam, name: "Exam", maxScore: 60 }])).rejects.toThrow(/above the new maximum/);

    await saveComponents(database.db, owner, fortySixty, { confirmDeleteScores: true });
    const after = await getAssessmentConfig(database.db, owner);
    expect(after.components.map((c) => `${c.name}:${c.maxScore}`)).toEqual(["Test:40", "Exam:60"]);
    expect(after.components[0].id).toBe(ca1);
    const results = await getClassResults(database.db, owner, classId);
    const ada = results.students.find((s) => s.firstName === "Ada")!.result.subjects[maths];
    expect(ada.total).toBe((ada.components[ca1] ?? 0) + (ada.components[exam] ?? 0));
    expect(ada.components[ca2]).toBeUndefined();

    // Swapping names in one save must not trip the unique name index, and new columns start empty.
    await saveComponents(database.db, owner, [{ id: exam, name: "Test", maxScore: 60 }, { id: ca1, name: "Exam", maxScore: 30 }, { name: "Project", maxScore: 10 }]);
    const swapped = await getAssessmentConfig(database.db, owner);
    expect(swapped.components.map((c) => `${c.name}:${c.maxScore}`)).toEqual(["Test:60", "Exam:30", "Project:10"]);
  });
});
