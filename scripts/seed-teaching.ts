/*
 * Homework and lesson notes for the demo school: three Maths assignments for JSS 1 Gold (one
 * marked, one open with work handed in, one due soon), a JSS 1 Maths scheme of work, and
 * the Maths teacher's lesson notes (two approved, one waiting for the Director).
 * Run with the dev server stopped, after db:seed-students.
 */
import { and, asc, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { assignments, assignmentSubmissions, classes, files, memberships, students, subjects, teacherAssignments } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { writeLocal } from "../src/lib/documents";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { getCurrentTerm } from "../src/lib/services/academics";
import { getAssessmentConfig } from "../src/lib/services/assessment";
import { assignmentSchema, gradeSubmissions, saveAssignment } from "../src/lib/services/assignments";
import { createUpload } from "../src/lib/services/files";
import { noteSchema, reviewLessonNote, reviewSchema, saveLessonNote, saveScheme } from "../src/lib/services/lesson-notes";
import { toLagosInput } from "../src/lib/services/teaching";
import { worksheet } from "./pdf-fixture";

const TOPICS = [
  "Whole numbers: place value up to billions",
  "Counting in base two",
  "Fractions: equivalent fractions",
  "Fractions: addition and subtraction",
  "Decimals and percentages",
  "Approximation and estimation",
  "Mid-term test and revision",
  "Algebraic expressions",
  "Simple equations",
  "Angles and lines",
  "Plane shapes: perimeter",
  "Data: tables and bar charts",
  "Revision and examination",
];


async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "greenfield-college"))!;

  const ctx = await withTenant(db, owner.school.id, async (tx) => {
    const [gold] = await tx.select().from(classes).where(eq(classes.name, "JSS 1 Gold"));
    const [maths] = await tx.select().from(subjects).where(eq(subjects.name, "Mathematics"));
    const [link] = await tx
      .select({ membershipId: teacherAssignments.membershipId, userId: memberships.userId })
      .from(teacherAssignments)
      .innerJoin(memberships, eq(memberships.id, teacherAssignments.membershipId))
      .where(and(eq(teacherAssignments.classId, gold.id), eq(teacherAssignments.subjectId, maths.id)));
    const roll = await tx.select().from(students).where(and(eq(students.classId, gold.id), eq(students.status, "active"))).orderBy(asc(students.admissionNo));
    const existing = await tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.classId, gold.id)).limit(1);
    return { gold, maths, link, roll, seeded: existing.length > 0, term: (await getCurrentTerm(tx))! };
  });
  if (ctx.seeded) {
    console.log("Teaching demo data already there.");
    await database.close();
    return;
  }
  if (!ctx.link) throw new Error("JSS 1 Gold Mathematics has no teacher.");
  const teacher = (await loadAccess(db, ctx.link.userId, "greenfield-college"))!;
  const ca = (await getAssessmentConfig(db, owner)).components[0];
  const day = 86_400_000;

  // 1. Marked: set two weeks ago, scores in.
  const marked = await withTenant(db, owner.school.id, async (tx) => {
    const [a] = await tx
      .insert(assignments)
      .values({
        schoolId: owner.school.id,
        termId: ctx.term.term.id,
        classId: ctx.gold.id,
        subjectId: ctx.maths.id,
        title: "Place value: exercise 1A",
        instructions: "Answer questions 1 to 10 on page 4 of your textbook. Show your working.",
        dueAt: new Date(Date.now() - 10 * day),
        maxScore: 10,
        componentId: ca.id,
        createdBy: teacher.membershipId,
      })
      .returning();
    const handed = ctx.roll.slice(0, ctx.roll.length - 2);
    for (const [i, s] of handed.entries()) {
      await tx.insert(assignmentSubmissions).values({
        schoolId: owner.school.id,
        assignmentId: a.id,
        studentId: s.id,
        text: "1. 4,000,000  2. 300,000  3. 50,000 …",
        submittedAt: new Date(Date.now() - (11 + (i % 3)) * day + (i === 3 ? 2 * day : 0)),
        late: i === 3,
      });
    }
    return { a, handed };
  });
  await gradeSubmissions(db, teacher, {
    assignmentId: marked.a.id,
    grades: marked.handed.map((s, i) => ({ studentId: s.id, score: [9, 7, 8, 6, 10, 5, 8, 7, 9, 6][i % 10], feedback: i % 4 === 0 ? "Neat working. Well done." : "" })),
  });

  // 2. Open, with a worksheet attached and some work handed in.
  const { fileId } = await createUpload(db, { schoolId: owner.school.id, userId: teacher.user.id, ownerType: "assignment", name: "Fractions worksheet.pdf", size: 900 });
  const [f] = await db.select().from(files).where(eq(files.id, fileId));
  await writeLocal(f.storageKey, worksheet("Fractions worksheet"));
  const open = await saveAssignment(
    db,
    teacher,
    assignmentSchema.parse({
      classId: ctx.gold.id,
      subjectId: ctx.maths.id,
      title: "Adding fractions",
      instructions: "Do all the questions on the worksheet. You can type your answers or upload a photo of your exercise book.",
      dueAt: toLagosInput(new Date(Date.now() + 2 * day)),
      maxScore: "20",
      componentId: ca.id,
      fileIds: [fileId],
    }),
  );
  await withTenant(db, owner.school.id, async (tx) => {
    for (const s of ctx.roll.slice(1, 6)) {
      await tx.insert(assignmentSubmissions).values({ schoolId: owner.school.id, assignmentId: open.id, studentId: s.id, text: "1. 3/4  2. 1/2  3. 7/10", submittedAt: new Date(Date.now() - day) });
    }
  });

  // 3. Due tomorrow, not marked.
  await saveAssignment(
    db,
    teacher,
    assignmentSchema.parse({
      classId: ctx.gold.id,
      subjectId: ctx.maths.id,
      title: "Decimals in everyday life",
      instructions: "Write five places you see decimals at home or in the market (prices, fuel, measurements) and one example of each.",
      dueAt: toLagosInput(new Date(Date.now() + day)),
    }),
  );

  // Scheme of work and lesson notes.
  await saveScheme(db, teacher, { termId: ctx.term.term.id, levelId: ctx.gold.levelId, subjectId: ctx.maths.id, items: TOPICS.map((topic, i) => ({ week: i + 1, topic })) });
  const notes = [
    { week: 1, objectives: "Read and write whole numbers up to billions.\nState the place value of a digit.", content: "Introduction: revise thousands and millions using the price of a car and the population of Lagos.\nPresentation: place value chart up to billions; read numbers aloud.\nEvaluation: write 3,450,210,000 in words.\nAssignment: exercise 1A." },
    { week: 2, objectives: "Convert between base ten and base two.", content: "Introduction: why computers count in twos.\nPresentation: repeated division by 2; reading the remainders upward.\nEvaluation: convert 13 and 26 to base two." },
    { week: 3, objectives: "Find equivalent fractions.\nReduce fractions to their lowest terms.", content: "Introduction: sharing an orange between 2, then 4 pupils.\nPresentation: multiply or divide top and bottom by the same number.\nEvaluation: five fractions to reduce." },
  ];
  for (const n of notes) {
    const note = await saveLessonNote(db, teacher, noteSchema.parse({ levelId: ctx.gold.levelId, subjectId: ctx.maths.id, week: n.week, topic: TOPICS[n.week - 1], objectives: n.objectives, content: n.content, submit: true }));
    if (n.week < 3) await reviewLessonNote(db, owner, reviewSchema.parse({ id: note.id, decision: "approved", comment: n.week === 1 ? "Good use of local examples." : "" }));
  }

  console.log(`Teaching demo: 3 assignments for JSS 1 Gold Maths, ${TOPICS.length}-week scheme, 3 lesson notes (1 waiting for approval). Teacher: ${teacher.user.email}`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
