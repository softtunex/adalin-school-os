import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { files, roles, schools, scores } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { writeLocal } from "@/lib/documents";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { assignSubjectTeacher, getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import {
  assignmentSchema,
  getAssignment,
  getStudentAssignment,
  getStudentAssignments,
  gradeSubmissions,
  listAssignments,
  saveAssignment,
  sendToCA,
  submitAssignment,
  submissionSchema,
} from "@/lib/services/assignments";
import { getAssessmentConfig } from "@/lib/services/assessment";
import { createUpload, fileForUser } from "@/lib/services/files";
import { getLessonNote, getScheme, listLessonNotes, noteSchema, reviewLessonNote, reviewSchema, saveLessonNote, saveScheme, withdrawLessonNote } from "@/lib/services/lesson-notes";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { authenticateStudent, issueStudentLogins } from "@/lib/services/student-accounts";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { toLagosInput } from "@/lib/services/teaching";
import { createTestDatabase } from "./helpers";

process.env.FILES_DIR = mkdtempSync(path.join(tmpdir(), "sos-files-"));

let database: Database;
let owner: Access;
let teacher: Access;
let other: Access;
let gold: string;
let diamond: string;
let levelId: string;
let maths: string;
let english: string;
const kids: Record<string, { id: string; userId: string }> = {};

const PDF = new TextEncoder().encode("%PDF-1.4\n% homework\n");
const EXE = new TextEncoder().encode("MZ\x90\x00 not a pdf");

async function staffWith(roleKey: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, roleKey)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

async function upload(userId: string, name: string, bytes: Uint8Array, ownerType: "assignment" | "submission" | "lesson_note") {
  const { fileId } = await createUpload(database.db, { schoolId: owner.school.id, userId, ownerType, name, size: bytes.byteLength });
  const [f] = await database.db.select().from(files).where(eq(files.id, fileId));
  await writeLocal(f.storageKey, bytes);
  return fileId;
}

const inTwoDays = () => toLagosInput(new Date(Date.now() + 2 * 86_400_000));

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Bello", email: "bello@teach.test", password: "Teaching1", schoolName: "Teaching College" });
  await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold", "Diamond"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  levelId = overview.levels[0].id;
  gold = overview.levels[0].classes.find((c) => c.name.endsWith("Gold"))!.id;
  diamond = overview.levels[0].classes.find((c) => c.name.endsWith("Diamond"))!.id;
  maths = overview.subjects.find((s) => s.name === "Mathematics")!.id;
  english = overview.subjects.find((s) => s.name === "English Studies")!.id;
  teacher = await staffWith("subject_teacher", "maths@teach.test");
  other = await staffWith("subject_teacher", "english@teach.test");
  await assignSubjectTeacher(database.db, owner, { classId: gold, subjectId: maths, membershipId: teacher.membershipId });
  await assignSubjectTeacher(database.db, owner, { classId: gold, subjectId: english, membershipId: other.membershipId });
  for (const [name, classId] of [
    ["Ada", gold],
    ["Bayo", gold],
    ["Chi", diamond],
  ] as const) {
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Obi", gender: "female", classId }), []);
    const [slip] = await issueStudentLogins(database.db, owner, { studentIds: [s.id] });
    const { userId } = await authenticateStudent(database.db, { school: owner.school.slug, admissionNo: s.admissionNo, password: slip.password }, "1.1.1.1");
    kids[name] = { id: s.id, userId };
  }
});

afterAll(async () => {
  await database.close();
});

describe("assignments", () => {
  let assignmentId = "";

  it("lets a teacher set work only for the class and subject they teach", async () => {
    const ca = (await getAssessmentConfig(database.db, owner)).components[0];
    const brief = await upload(teacher.user.id, "Fractions worksheet.pdf", PDF, "assignment");
    const a = await saveAssignment(
      database.db,
      teacher,
      assignmentSchema.parse({ classId: gold, subjectId: maths, title: "Fractions", instructions: "Do 1 to 10.", dueAt: inTwoDays(), maxScore: "20", componentId: ca.id, publish: true, fileIds: [brief] }),
    );
    assignmentId = a.id;
    expect(a.status).toBe("published");
    await expect(
      saveAssignment(database.db, teacher, assignmentSchema.parse({ classId: gold, subjectId: english, title: "Essay", dueAt: inTwoDays() })),
    ).rejects.toThrow(/classes and subjects you teach/);
    await expect(saveAssignment(database.db, teacher, assignmentSchema.parse({ classId: diamond, subjectId: maths, title: "Fractions", dueAt: inTwoDays() }))).rejects.toThrow(/teach/);

    const list = await listAssignments(database.db, teacher);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ roll: 2, submitted: 0 });
    expect((await listAssignments(database.db, other)).rows).toHaveLength(0);
    expect(assignmentSchema.safeParse({ classId: gold, subjectId: maths, title: "X1", dueAt: inTwoDays(), componentId: ca.id }).success).toBe(false);
  });

  it("refuses an upload that isn't what its name claims", async () => {
    const fake = await upload(teacher.user.id, "answers.pdf", EXE, "assignment");
    await expect(
      saveAssignment(database.db, teacher, assignmentSchema.parse({ id: assignmentId, classId: gold, subjectId: maths, title: "Fractions", dueAt: inTwoDays(), maxScore: "20", fileIds: [fake] })),
    ).rejects.toThrow(/doesn't look like a real .pdf/);
    await expect(createUpload(database.db, { schoolId: owner.school.id, userId: teacher.user.id, ownerType: "assignment", name: "virus.exe", size: 10 })).rejects.toThrow(/isn't allowed/);
  });

  it("shows the work to students in the class and lets them hand in once marked work is locked", async () => {
    expect((await getStudentAssignments(database.db, kids.Ada.userId)).rows.map((r) => r.status)).toEqual(["to_do"]);
    expect((await getStudentAssignments(database.db, kids.Chi.userId)).rows).toHaveLength(0);
    await expect(getStudentAssignment(database.db, kids.Chi.userId, assignmentId)).rejects.toThrow(/wasn't found/);

    await expect(submitAssignment(database.db, kids.Ada.userId, submissionSchema.parse({ assignmentId }))).rejects.toThrow(/Write your answer or attach/);
    const work = await upload(kids.Ada.userId, "ada.pdf", PDF, "submission");
    await expect(submitAssignment(database.db, kids.Bayo.userId, submissionSchema.parse({ assignmentId, fileIds: [work] }))).rejects.toThrow(/didn't finish uploading/);
    expect(await submitAssignment(database.db, kids.Ada.userId, submissionSchema.parse({ assignmentId, text: "1/2 + 1/4 = 3/4", fileIds: [work] }))).toEqual({ late: false });
    const mine = await getStudentAssignment(database.db, kids.Ada.userId, assignmentId);
    expect(mine.status).toBe("handed_in");
    expect(mine.myFiles).toHaveLength(1);

    // Ada's file: Ada and her teacher, not Bayo or the English teacher.
    const fileId = mine.myFiles[0].id;
    expect(await fileForUser(database.db, kids.Ada.userId, fileId)).not.toBeNull();
    expect(await fileForUser(database.db, teacher.user.id, fileId)).not.toBeNull();
    expect(await fileForUser(database.db, kids.Bayo.userId, fileId)).toBeNull();
    expect(await fileForUser(database.db, other.user.id, fileId)).toBeNull();
    expect(await fileForUser(database.db, kids.Chi.userId, mine.files[0].id)).toBeNull();
    expect(await fileForUser(database.db, kids.Bayo.userId, mine.files[0].id)).not.toBeNull();
  });

  it("marks work and scales the marks into the CA column", async () => {
    const view = await getAssignment(database.db, teacher, assignmentId);
    expect(view.students.find((s) => s.id === kids.Ada.id)?.submission?.submittedAt).toBeTruthy();
    await expect(gradeSubmissions(database.db, teacher, { assignmentId, grades: [{ studentId: kids.Ada.id, score: 25, feedback: "" }] })).rejects.toThrow(/between 0 and 20/);
    await gradeSubmissions(database.db, teacher, {
      assignmentId,
      grades: [
        { studentId: kids.Ada.id, score: 15, feedback: "Good work." },
        { studentId: kids.Bayo.id, score: 8, feedback: "Handed in on paper." },
      ],
    });
    expect((await getStudentAssignment(database.db, kids.Ada.userId, assignmentId)).status).toBe("marked");
    await expect(submitAssignment(database.db, kids.Ada.userId, submissionSchema.parse({ assignmentId, text: "again" }))).rejects.toThrow(/already been marked/);

    const res = await sendToCA(database.db, teacher, assignmentId);
    expect(res.saved).toBe(2);
    const ca = (await getAssessmentConfig(database.db, owner)).components[0];
    const rows = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(scores).where(and(eq(scores.subjectId, maths), eq(scores.componentId, ca.id))));
    expect(rows.find((r) => r.studentId === kids.Ada.id)?.score).toBeCloseTo((15 / 20) * ca.maxScore, 1);
    await expect(sendToCA(database.db, other, assignmentId)).rejects.toThrow(/can't change/);
  });
});

describe("lesson notes", () => {
  let noteId = "";

  it("plans a scheme of work for the subjects a teacher teaches", async () => {
    const scheme = await getScheme(database.db, teacher, {});
    expect(scheme.options.map((o) => o.subjectName)).toEqual(["Mathematics"]);
    expect(scheme.weeks.length).toBeGreaterThan(0);
    await saveScheme(database.db, teacher, { termId: scheme.term.id, levelId, subjectId: maths, items: [{ week: 1, topic: "Whole numbers" }, { week: 2, topic: "Fractions" }] });
    expect((await getScheme(database.db, teacher, { levelId, subjectId: maths })).weeks.slice(0, 2).map((w) => w.topic)).toEqual(["Whole numbers", "Fractions"]);
    await expect(saveScheme(database.db, teacher, { termId: scheme.term.id, levelId, subjectId: english, items: [] })).rejects.toThrow(/subjects you teach/);
  });

  it("sends notes to the principal, who approves or returns them", async () => {
    const note = await saveLessonNote(database.db, teacher, noteSchema.parse({ levelId, subjectId: maths, week: 2, topic: "Fractions", content: "Introduce halves and quarters.", submit: true }));
    noteId = note.id;
    expect(note.status).toBe("submitted");
    expect((await getLessonNote(database.db, teacher, noteId)).plannedTopic).toBe("Fractions");
    await expect(getLessonNote(database.db, other, noteId)).rejects.toThrow(/wasn't found/);
    await expect(saveLessonNote(database.db, teacher, noteSchema.parse({ id: noteId, levelId, subjectId: maths, week: 2, topic: "Fractions" }))).rejects.toThrow(/Withdraw it/);

    await expect(reviewLessonNote(database.db, teacher, reviewSchema.parse({ id: noteId, decision: "approved" }))).rejects.toThrow(/principal/);
    expect(reviewSchema.safeParse({ id: noteId, decision: "returned", comment: "" }).success).toBe(false);
    expect((await listLessonNotes(database.db, owner, { view: "review" })).rows).toHaveLength(1);
    await reviewLessonNote(database.db, owner, reviewSchema.parse({ id: noteId, decision: "returned", comment: "Add an evaluation section." }));
    const back = await getLessonNote(database.db, teacher, noteId);
    expect(back).toMatchObject({ canEdit: true, n: { status: "returned", reviewComment: "Add an evaluation section." } });

    await saveLessonNote(database.db, teacher, noteSchema.parse({ id: noteId, levelId, subjectId: maths, week: 2, topic: "Fractions", content: "Halves, quarters. Evaluation: 5 questions.", submit: true }));
    await withdrawLessonNote(database.db, teacher, noteId);
    await saveLessonNote(database.db, teacher, noteSchema.parse({ id: noteId, levelId, subjectId: maths, week: 2, topic: "Fractions", content: "Halves, quarters. Evaluation: 5 questions.", submit: true }));
    await reviewLessonNote(database.db, owner, reviewSchema.parse({ id: noteId, decision: "approved" }));
    expect((await getLessonNote(database.db, teacher, noteId)).canEdit).toBe(false);
    const mine = await listLessonNotes(database.db, teacher);
    expect(mine.mine).toMatchObject({ approved: 1, submitted: 0 });
  });
});
