/*
 * CBT for the demo school: a JSS 1 Maths question bank, a test open now for JSS 1 Gold that
 * five classmates have finished (two marked, three waiting for theory marks), and one set for
 * next week. Oluwaseun Lawal (the demo student) hasn't started, so the Director can sit it.
 * Run with the dev server stopped, after db:seed-teaching.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { classes, examAttempts, exams, memberships, questions, students, subjects, teacherAssignments } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { getAssessmentConfig } from "../src/lib/services/assessment";
import { examSchema, importQuestions, saveExam } from "../src/lib/services/cbt";
import { toLagosInput } from "../src/lib/services/teaching";

const BANK = `1. What is the place value of 7 in 4,723,105?
A. Thousands
B. Ten thousands
C. Hundred thousands *
D. Millions

2. Write 1011 (base two) in base ten.
A. 9
B. 11 *
C. 13
D. 22

3. Which fraction is equivalent to 2/3?
A. 4/9
B. 6/9 *
C. 3/2
D. 2/6

4. What is 1/2 + 1/4?
A. 2/6
B. 1/6
C. 3/4 *
D. 2/4

5. Express 0.35 as a percentage.
A. 3.5%
B. 35% *
C. 0.35%
D. 350%

6. Round 4,867 to the nearest hundred.
A. 4,800
B. 4,870
C. 4,900 *
D. 5,000

7. Simplify 3a + 5a - 2a.
A. 6a *
B. 10a
C. 6
D. 8a - 2

8. Solve x + 7 = 12.
A. 19
B. 5 *
C. 7
D. 84

9. How many degrees are in a right angle?
A. 45
B. 90 *
C. 180
D. 360

10. A rectangle is 8 cm long and 5 cm wide. What is its perimeter?
A. 13 cm
B. 40 cm
C. 26 cm *
D. 21 cm

11. Mama Nkechi sells a tuber of yam for ₦1,500. How much are 4 tubers?
A. ₦5,000
B. ₦6,000 *
C. ₦4,500
D. ₦1,504

12. Which of these is a prime number?
A. 21
B. 27
C. 29 *
D. 33

13. Explain, with an example, how to add two fractions with different denominators. [5 marks]

14. A trader bought 12 crates of eggs at ₦4,500 each and sold them for ₦62,400 in all. Did she make a profit or a loss, and how much? Show your working. [5 marks]`;

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.adalinschoolhub.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const ctx = await withTenant(db, owner.school.id, async (tx) => {
    const [gold] = await tx.select().from(classes).where(eq(classes.name, "JSS 1 Gold"));
    const [maths] = await tx.select().from(subjects).where(eq(subjects.name, "Mathematics"));
    const [link] = await tx
      .select({ userId: memberships.userId })
      .from(teacherAssignments)
      .innerJoin(memberships, eq(memberships.id, teacherAssignments.membershipId))
      .where(and(eq(teacherAssignments.classId, gold.id), eq(teacherAssignments.subjectId, maths.id)));
    const existing = await tx.select({ id: exams.id }).from(exams).limit(1);
    return { gold, maths, link, seeded: existing.length > 0 };
  });
  if (ctx.seeded) {
    console.log("CBT demo data already there.");
    await database.close();
    return;
  }
  const teacher = (await loadAccess(db, ctx.link.userId, "adalin-college"))!;
  await importQuestions(db, teacher, { subjectId: ctx.maths.id, levelId: ctx.gold.levelId, topic: "First half of term", text: BANK });
  const qs = await withTenant(db, owner.school.id, (tx) => tx.select().from(questions).where(eq(questions.subjectId, ctx.maths.id)).orderBy(asc(questions.createdAt)));
  const objective = qs.filter((q) => q.kind === "objective");
  const theory = qs.filter((q) => q.kind === "theory");
  const ca = (await getAssessmentConfig(db, owner)).components[1] ?? (await getAssessmentConfig(db, owner)).components[0];
  const hour = 3_600_000;

  const test = await saveExam(
    db,
    teacher,
    examSchema.parse({
      subjectId: ctx.maths.id,
      classIds: [ctx.gold.id],
      title: "Second CA test",
      instructions: "Answer all 12 objective questions and both theory questions. Your answers save as you go.",
      durationMins: 40,
      opensAt: toLagosInput(new Date(Date.now() - 2 * hour)),
      closesAt: toLagosInput(new Date(Date.now() + 2 * 24 * hour)),
      componentId: ca.id,
      questionIds: [...objective, ...theory].map((q) => q.id),
      publish: true,
    }),
  );
  await saveExam(
    db,
    teacher,
    examSchema.parse({
      subjectId: ctx.maths.id,
      classIds: [ctx.gold.id],
      title: "Algebra quiz",
      durationMins: 15,
      opensAt: toLagosInput(new Date(Date.now() + 7 * 24 * hour)),
      closesAt: toLagosInput(new Date(Date.now() + 7 * 24 * hour + 6 * hour)),
      questionIds: objective.slice(6, 9).map((q) => q.id),
      publish: true,
    }),
  );

  // Five classmates have finished: the first two are marked.
  await withTenant(db, owner.school.id, async (tx) => {
    const roll = await tx
      .select()
      .from(students)
      .where(and(eq(students.classId, ctx.gold.id), eq(students.status, "active"), ne(students.admissionNo, "ADC/2026/0009")))
      .orderBy(asc(students.admissionNo))
      .limit(5);
    const accuracy = [0.92, 0.75, 0.6, 0.83, 0.5];
    const focus = [0, 0, 4, 1, 0];
    for (const [i, s] of roll.entries()) {
      const answers: Record<string, number | string> = {};
      let objScore = 0;
      objective.forEach((q, j) => {
        const right = (j * 7 + i * 3) % 12 < Math.round(accuracy[i] * 12);
        answers[q.id] = right ? q.answer! : (q.answer! + 1) % q.options.length;
        if (right) objScore += q.marks;
      });
      answers[theory[0].id] = "Find the LCM of the denominators, change both fractions to it, then add the numerators. 1/2 + 1/3 = 3/6 + 2/6 = 5/6.";
      answers[theory[1].id] = "Cost = 12 × 4,500 = ₦54,000. Sold for ₦62,400. Profit = ₦8,400.";
      const marked = i < 2;
      const theoryMarks = marked ? { [theory[0].id]: 4 + (i % 2), [theory[1].id]: 5 - i } : {};
      const started = new Date(Date.now() - (90 - i * 10) * 60_000);
      await tx.insert(examAttempts).values({
        schoolId: owner.school.id,
        examId: test.id,
        studentId: s.id,
        startedAt: started,
        deadline: new Date(started.getTime() + 40 * 60_000),
        submittedAt: new Date(started.getTime() + (28 + i * 2) * 60_000),
        order: [...objective, ...theory].map((q) => ({ q: q.id, o: q.options.map((_, k) => k) })),
        answers,
        objectiveScore: objScore,
        theoryScore: marked ? Object.values(theoryMarks).reduce((t, m) => t + m, 0) : null,
        theoryMarks,
        status: marked ? "graded" : "submitted",
        focusLosses: focus[i],
      });
    }
  });

  console.log(`CBT demo: ${qs.length} questions in the JSS 1 Maths bank, "Second CA test" open now (5 finished, 3 to mark), "Algebra quiz" next week.`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
