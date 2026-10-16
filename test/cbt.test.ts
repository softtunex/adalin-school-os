import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { examAttempts, roles, schools, scores } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { assignSubjectTeacher, getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { getAssessmentConfig } from "@/lib/services/assessment";
import {
  examSchema,
  getAttemptForMarking,
  getExam,
  getExamPaper,
  getStudentExam,
  getStudentExams,
  importQuestions,
  listQuestions,
  markTheory,
  parseQuestions,
  questionSchema,
  recordFocusLoss,
  saveAnswer,
  saveExam,
  saveQuestion,
  sendExamToCA,
  startExam,
  submitExam,
} from "@/lib/services/cbt";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { authenticateStudent, issueStudentLogins } from "@/lib/services/student-accounts";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { toLagosInput } from "@/lib/services/teaching";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let teacher: Access;
let gold: string;
let diamond: string;
let levelId: string;
let maths: string;
let english: string;
const kids: Record<string, { id: string; userId: string }> = {};

const PASTE = `1. What is 2 + 3?
A. 4
B. 5 *
C. 6
D. 7

2. Which of these is a prime number?
A) 9
B) 15
C) 11 *

3. Explain why 1 is not a prime number. [4 marks]`;

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Dr Ade", email: "ade@cbt.test", password: "Testing123", schoolName: "CBT College" });
  await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold", "Diamond"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  levelId = overview.levels[0].id;
  gold = overview.levels[0].classes.find((c) => c.name.endsWith("Gold"))!.id;
  diamond = overview.levels[0].classes.find((c) => c.name.endsWith("Diamond"))!.id;
  maths = overview.subjects.find((s) => s.name === "Mathematics")!.id;
  english = overview.subjects.find((s) => s.name === "English Studies")!.id;
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "subject_teacher")));
  const { token } = await inviteStaff(database.db, owner, { name: "Mr Maths", email: "maths@cbt.test", roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: "Mr Maths", password: "Teacher123" });
  teacher = (await loadAccess(database.db, userId, owner.school.slug))!;
  await assignSubjectTeacher(database.db, owner, { classId: gold, subjectId: maths, membershipId: teacher.membershipId });
  for (const [name, classId] of [
    ["Ada", gold],
    ["Bayo", gold],
    ["Chi", diamond],
  ] as const) {
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Eze", gender: "female", classId }), []);
    const [slip] = await issueStudentLogins(database.db, owner, { studentIds: [s.id] });
    const { userId: uid } = await authenticateStudent(database.db, { school: owner.school.slug, admissionNo: s.admissionNo, password: slip.password }, "2.2.2.2");
    kids[name] = { id: s.id, userId: uid };
  }
});

afterAll(async () => {
  await database.close();
});

describe("question bank", () => {
  it("reads questions pasted from a document", () => {
    const r = parseQuestions(PASTE);
    expect(r.errors).toEqual([]);
    expect(r.questions.map((q) => [q.kind, q.answer, q.marks])).toEqual([
      ["objective", 1, 1],
      ["objective", 2, 1],
      ["theory", null, 4],
    ]);
    expect(r.questions[0].body).toBe("What is 2 + 3?");
    expect(parseQuestions("1. Pick one\nA. x\nB. y").errors[0]).toMatch(/mark the correct option/);
  });

  it("keeps each teacher to their own subjects", async () => {
    expect((await importQuestions(database.db, teacher, { subjectId: maths, levelId, topic: "Numbers", text: PASTE })).added).toBe(3);
    await expect(importQuestions(database.db, teacher, { subjectId: english, levelId, topic: null, text: PASTE })).rejects.toThrow(/subjects you teach/);
    expect(questionSchema.safeParse({ subjectId: maths, kind: "objective", body: "Pick", options: ["a", ""], answer: 0, marks: 1 }).success).toBe(false);
    const list = await listQuestions(database.db, teacher);
    expect(list.stats).toMatchObject({ total: 3, objective: 2, theory: 1 });
  });
});

describe("exams", () => {
  let examId = "";
  const openNow = () => ({ opensAt: toLagosInput(new Date(Date.now() - 60_000)), closesAt: toLagosInput(new Date(Date.now() + 3 * 3_600_000)) });

  it("builds an exam for the teacher's own class", async () => {
    const qs = (await listQuestions(database.db, teacher)).rows.map((r) => r.q.id);
    const ca = (await getAssessmentConfig(database.db, owner)).components[0];
    await expect(saveExam(database.db, teacher, examSchema.parse({ subjectId: maths, classIds: [diamond], title: "Test 1", durationMins: 30, ...openNow(), questionIds: qs }))).rejects.toThrow(/classes you teach/);
    const exam = await saveExam(database.db, teacher, examSchema.parse({ subjectId: maths, classIds: [gold], title: "Test 1", durationMins: 30, ...openNow(), questionIds: qs, componentId: ca.id, publish: true }));
    examId = exam.id;
    expect(exam.status).toBe("published");
  });

  it("gives each student their own paper, without the answers", async () => {
    expect((await getStudentExams(database.db, kids.Chi.userId)).rows).toHaveLength(0);
    expect((await getStudentExams(database.db, kids.Ada.userId)).rows[0].status).toBe("open");
    const attempt = await startExam(database.db, kids.Ada.userId, examId);
    expect((await startExam(database.db, kids.Ada.userId, examId)).id).toBe(attempt.id);
    expect(attempt.deadline.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    const paper = (await getExamPaper(database.db, kids.Ada.userId, examId))!;
    expect(paper.questions).toHaveLength(3);
    expect(JSON.stringify(paper)).not.toMatch(/"answer"/);
    expect(paper.questions.find((q) => q.kind === "objective")!.options[0]).toHaveProperty("i");
  });

  it("autosaves answers, counts tab switches and marks objective questions on submit", async () => {
    const paper = (await getExamPaper(database.db, kids.Ada.userId, examId))!;
    const add = paper.questions.find((q) => q.body.startsWith("What is 2"))!;
    const prime = paper.questions.find((q) => q.body.startsWith("Which"))!;
    const essay = paper.questions.find((q) => q.kind === "theory")!;
    await saveAnswer(database.db, kids.Ada.userId, { examId, questionId: add.id, answer: 1 }); // right
    await saveAnswer(database.db, kids.Ada.userId, { examId, questionId: prime.id, answer: 0 }); // wrong
    await saveAnswer(database.db, kids.Ada.userId, { examId, questionId: essay.id, answer: "It has only one factor." });
    await expect(saveAnswer(database.db, kids.Ada.userId, { examId, questionId: add.id, answer: 5 })).rejects.toThrow(/isn't in this question/);
    expect(await recordFocusLoss(database.db, kids.Ada.userId, examId)).toBe(1);
    await submitExam(database.db, kids.Ada.userId, examId);
    await expect(saveAnswer(database.db, kids.Ada.userId, { examId, questionId: add.id, answer: 2 })).rejects.toThrow(/isn't open/);
    const mine = await getStudentExam(database.db, kids.Ada.userId, examId);
    expect(mine.status).toBe("done");
    expect(mine.result).toMatchObject({ objective: 1, theory: null, graded: false });
  });

  it("submits for a student whose time ran out", async () => {
    await startExam(database.db, kids.Bayo.userId, examId);
    const paper = (await getExamPaper(database.db, kids.Bayo.userId, examId))!;
    await saveAnswer(database.db, kids.Bayo.userId, { examId, questionId: paper.questions.find((q) => q.body.startsWith("Which"))!.id, answer: 2 });
    await withTenant(database.db, owner.school.id, (tx) =>
      tx.update(examAttempts).set({ deadline: new Date(Date.now() - 120_000) }).where(and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, kids.Bayo.id))),
    );
    await expect(saveAnswer(database.db, kids.Bayo.userId, { examId, questionId: paper.questions[0].id, answer: 0 })).rejects.toThrow(/Time is up/);
    const view = await getExam(database.db, teacher, examId);
    expect(view.attempts.find((a) => a.a.studentId === kids.Bayo.id)?.a).toMatchObject({ status: "submitted", objectiveScore: 1 });
    expect(view.attempts.find((a) => a.a.studentId === kids.Ada.id)?.a.focusLosses).toBe(1);
  });

  it("marks theory, then sends the percentage into CA", async () => {
    await expect(sendExamToCA(database.db, teacher, examId)).rejects.toThrow(/Mark every theory script/);
    const view = await getExam(database.db, teacher, examId);
    const essay = view.questions.find((q) => q.kind === "theory")!;
    for (const [name, mark] of [
      ["Ada", 3],
      ["Bayo", 0],
    ] as const) {
      const attempt = view.attempts.find((a) => a.a.studentId === kids[name].id)!;
      const script = await getAttemptForMarking(database.db, teacher, attempt.a.id);
      expect(script.questions).toHaveLength(3);
      await expect(markTheory(database.db, teacher, { attemptId: attempt.a.id, marks: { [essay.id]: 9 } })).rejects.toThrow(/4 marks at most/);
      await markTheory(database.db, teacher, { attemptId: attempt.a.id, marks: { [essay.id]: mark } });
    }
    expect((await getStudentExam(database.db, kids.Ada.userId, examId)).result).toMatchObject({ objective: 1, theory: 3, graded: true, total: 6 });
    const r = await sendExamToCA(database.db, teacher, examId);
    expect(r.saved).toBe(2);
    const ca = (await getAssessmentConfig(database.db, owner)).components[0];
    const [ada] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(scores).where(and(eq(scores.studentId, kids.Ada.id), eq(scores.componentId, ca.id))));
    expect(ada.score).toBeCloseTo((4 / 6) * ca.maxScore, 1);
  });

  it("locks questions students have answered", async () => {
    const q = (await listQuestions(database.db, teacher)).rows[0].q;
    await expect(saveQuestion(database.db, teacher, questionSchema.parse({ id: q.id, subjectId: maths, kind: q.kind, body: "Changed", options: q.options, answer: q.answer, marks: 1 }))).rejects.toThrow(/can't change/);
  });
});
