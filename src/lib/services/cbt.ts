import { randomInt } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { assessmentComponents, classes, classLevels, examAttempts, examClasses, examQuestions, exams, levelSubjects, memberships, questions, students, subjects, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, type Access } from "./access";
import { getCurrentTerm } from "./academics";
import { recordAudit } from "./audit";
import { saveScores } from "./results";
import { requireStudent } from "./student-portal";
import { lagosDateTime, studentSubjectIds, taughtPairs } from "./teaching";

/*
 * Computer-based tests. Teachers keep a question bank per subject, build exams from it and
 * open them to classes for a window. Each student gets their own question and option order,
 * a server-side deadline, autosaved answers, instant marking for objective questions and
 * teacher marking for theory. Correct answers never leave the server during an attempt.
 */

export const QUESTION_PAGE_SIZE = 25;
export const EXAM_PAGE_SIZE = 20;
/** Network slack after the deadline before answers stop being accepted. */
const GRACE_MS = 30_000;

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireCbt(access: Access) {
  if (!hasFeature(access.plan, "cbt")) throw new AppError("CBT exams are on the Standard plan.", "upgrade");
  if (!can(access, "teaching:cbt")) throw new AppError("You don't have permission to do that.", "forbidden");
}

/** Subjects this person can write questions and exams for: what they teach, or all for school-wide staff. */
async function cbtSubjects(tx: Tx, access: Access): Promise<"all" | Set<string>> {
  const pairs = await taughtPairs(tx, access);
  return pairs === "all" ? "all" : new Set(pairs.map((p) => p.subjectId));
}

async function requireSubject(tx: Tx, access: Access, subjectId: string) {
  const allowed = await cbtSubjects(tx, access);
  if (allowed !== "all" && !allowed.has(subjectId)) throw new AppError("You can only set questions for the subjects you teach.", "forbidden");
}

/** Every option's original position, shuffled. */
function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Question bank ----------

export const questionSchema = z
  .object({
    id: z.string().uuid().optional(),
    subjectId: z.string().uuid("Choose a subject."),
    levelId: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.string().uuid().nullable()),
    topic: z
      .string()
      .trim()
      .max(150)
      .optional()
      .transform((v) => v || null),
    kind: z.enum(["objective", "theory"]),
    body: z.string().trim().min(3, "Write the question.").max(5000),
    options: z.array(z.string().trim().max(500)).max(6).default([]),
    answer: z.number().int().min(0).nullable().default(null),
    marks: z.number().min(0.5, "At least half a mark.").max(100),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "objective") return;
    const filled = v.options.filter(Boolean);
    if (filled.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Give at least two options." });
    if (filled.length !== v.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Fill in every option or remove the empty ones." });
    if (v.answer === null || v.answer >= v.options.length) ctx.addIssue({ code: "custom", path: ["answer"], message: "Mark the correct option." });
  });
export type QuestionInput = z.infer<typeof questionSchema>;

async function questionLocked(tx: Tx, questionId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(examQuestions)
    .innerJoin(examAttempts, eq(examAttempts.examId, examQuestions.examId))
    .where(eq(examQuestions.questionId, questionId));
  return row.n > 0;
}

export async function saveQuestion(db: DB, access: Access, input: QuestionInput) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    await requireSubject(tx, access, input.subjectId);
    const values = {
      subjectId: input.subjectId,
      levelId: input.levelId,
      topic: input.topic,
      kind: input.kind,
      body: input.body,
      options: input.kind === "objective" ? input.options : [],
      answer: input.kind === "objective" ? input.answer : null,
      marks: input.marks,
    };
    if (input.id) {
      const [existing] = await tx.select().from(questions).where(eq(questions.id, input.id));
      if (!existing) throw new AppError("That question wasn't found.", "not_found");
      await requireSubject(tx, access, existing.subjectId);
      if (await questionLocked(tx, input.id)) throw new AppError("Students have already answered this question in an exam, so it can't change. Add a new one instead.", "conflict");
      const [row] = await tx.update(questions).set(values).where(eq(questions.id, input.id)).returning();
      return row;
    }
    const [row] = await tx.insert(questions).values({ ...values, schoolId: access.school.id, createdBy: access.membershipId }).returning();
    return row;
  });
}

export async function deleteQuestion(db: DB, access: Access, id: string) {
  requireCbt(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [q] = await tx.select().from(questions).where(eq(questions.id, id));
    if (!q) throw new AppError("That question wasn't found.", "not_found");
    await requireSubject(tx, access, q.subjectId);
    if (await questionLocked(tx, id)) throw new AppError("Students have answered this question in an exam, so it's kept for their results.", "conflict");
    await tx.delete(questions).where(eq(questions.id, id));
  });
}

/**
 * Reads questions pasted from a document. Blocks are separated by a blank line; options start
 * with A. to F. (or A) ), and the correct one ends with * . A block without options is theory.
 * An optional "[2 marks]" sets the marks.
 */
export function parseQuestions(text: string): { questions: Omit<QuestionInput, "subjectId" | "levelId" | "topic">[]; errors: string[] } {
  const out: Omit<QuestionInput, "subjectId" | "levelId" | "topic">[] = [];
  const errors: string[] = [];
  const blocks = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  blocks.forEach((block, n) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const optRe = /^\(?([A-Fa-f])[.)]\s+(.*)$/;
    const firstOpt = lines.findIndex((l) => optRe.test(l));
    const stem = (firstOpt === -1 ? lines : lines.slice(0, firstOpt)).join("\n");
    let marks = 1;
    const body = stem
      .replace(/^\s*(?:Q(?:uestion)?\s*)?\d+\s*[.):-]\s*/i, "")
      .replace(/\[\s*(\d+(?:\.\d+)?)\s*marks?\s*\]/i, (_, m: string) => {
        marks = Number(m);
        return "";
      })
      .trim();
    if (!body) return errors.push(`Question ${n + 1}: no question text.`);
    if (firstOpt === -1) return out.push({ kind: "theory", body, options: [], answer: null, marks: marks === 1 ? 5 : marks });
    const options: string[] = [];
    let answer: number | null = null;
    for (const l of lines.slice(firstOpt)) {
      const m = l.match(optRe);
      if (!m) {
        if (options.length) options[options.length - 1] += ` ${l}`;
        continue;
      }
      let t = m[2].trim();
      if (/\*\s*$/.test(t)) {
        answer = options.length;
        t = t.replace(/\s*\*\s*$/, "");
      }
      options.push(t);
    }
    if (options.length < 2) return errors.push(`Question ${n + 1}: needs at least two options.`);
    if (options.length > 6) return errors.push(`Question ${n + 1}: has more than six options.`);
    if (answer === null) return errors.push(`Question ${n + 1}: mark the correct option with * at the end.`);
    out.push({ kind: "objective", body, options, answer, marks });
  });
  return { questions: out, errors };
}

export async function importQuestions(db: DB, access: Access, input: { subjectId: string; levelId: string | null; topic: string | null; text: string }) {
  requireCbt(access);
  const parsed = parseQuestions(input.text);
  if (parsed.errors.length) throw new AppError(parsed.errors.slice(0, 3).join(" "), "invalid");
  if (parsed.questions.length === 0) throw new AppError("Paste at least one question.", "invalid");
  if (parsed.questions.length > 200) throw new AppError("Import up to 200 questions at a time.", "invalid");
  return withTenant(db, access.school.id, async (tx) => {
    await requireSubject(tx, access, input.subjectId);
    await tx.insert(questions).values(
      parsed.questions.map((q) => ({ ...q, schoolId: access.school.id, subjectId: input.subjectId, levelId: input.levelId, topic: input.topic, createdBy: access.membershipId })),
    );
    return { added: parsed.questions.length };
  });
}

export async function listQuestions(db: DB, access: Access, filter: { subjectId?: string; levelId?: string; kind?: string; q?: string; page?: number } = {}) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    const allowed = await cbtSubjects(tx, access);
    const scope: SQL[] = [];
    if (allowed !== "all") scope.push(allowed.size ? inArray(questions.subjectId, [...allowed]) : sql`false`);
    const where = [...scope];
    if (filter.subjectId) where.push(eq(questions.subjectId, filter.subjectId));
    if (filter.levelId) where.push(eq(questions.levelId, filter.levelId));
    if (filter.kind === "objective" || filter.kind === "theory") where.push(eq(questions.kind, filter.kind));
    if (filter.q) where.push(ilike(questions.body, `%${filter.q}%`));
    const page = Math.max(1, filter.page ?? 1);
    const [[{ total }], rows, [stats], subjectRows, levels] = await Promise.all([
      tx.select({ total: count() }).from(questions).where(and(...where)),
      tx
        .select({ q: questions, subjectName: subjects.name, levelName: classLevels.name, used: sql<number>`(select count(*) from exam_questions eq where eq.question_id = ${questions.id})`.mapWith(Number) })
        .from(questions)
        .innerJoin(subjects, eq(subjects.id, questions.subjectId))
        .leftJoin(classLevels, eq(classLevels.id, questions.levelId))
        .where(and(...where))
        .orderBy(desc(questions.createdAt))
        .limit(QUESTION_PAGE_SIZE)
        .offset((page - 1) * QUESTION_PAGE_SIZE),
      tx
        .select({
          total: count(),
          objective: sql<number>`count(*) filter (where ${questions.kind} = 'objective')`.mapWith(Number),
          theory: sql<number>`count(*) filter (where ${questions.kind} = 'theory')`.mapWith(Number),
          subjects: sql<number>`count(distinct ${questions.subjectId})`.mapWith(Number),
        })
        .from(questions)
        .where(and(...scope)),
      tx.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(asc(subjects.sort), asc(subjects.name)),
      tx.select({ id: classLevels.id, name: classLevels.name }).from(classLevels).orderBy(asc(classLevels.sort)),
    ]);
    return { rows, total, stats, subjects: subjectRows.filter((s) => allowed === "all" || allowed.has(s.id)), levels };
  });
}

// ---------- Exams ----------

export const examSchema = z
  .object({
    id: z.string().uuid().optional(),
    subjectId: z.string().uuid("Choose a subject."),
    classIds: z.array(z.string().uuid()).min(1, "Choose at least one class."),
    title: z.string().trim().min(3, "Give the exam a title.").max(150),
    instructions: z.string().trim().max(3000).default(""),
    durationMins: z.number().int("Use whole minutes.").min(5, "At least 5 minutes.").max(300, "At most 5 hours."),
    opensAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose when it opens."),
    closesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose when it closes."),
    shuffle: z.boolean().default(true),
    showScore: z.boolean().default(true),
    componentId: z
      .string()
      .optional()
      .transform((v) => v || null)
      .pipe(z.string().uuid().nullable()),
    questionIds: z.array(z.string().uuid()).min(1, "Add at least one question.").max(200),
    publish: z.boolean().default(false),
  })
  .refine((v) => lagosDateTime(v.closesAt) > lagosDateTime(v.opensAt), { path: ["closesAt"], message: "It must close after it opens." });
export type ExamInput = z.infer<typeof examSchema>;

async function requireExamClasses(tx: Tx, access: Access, subjectId: string, classIds: string[]) {
  const pairs = await taughtPairs(tx, access);
  if (pairs !== "all" && !classIds.every((c) => pairs.some((p) => p.classId === c && p.subjectId === subjectId))) {
    throw new AppError("You can only set exams for the classes you teach this subject to.", "forbidden");
  }
}

async function loadExam(tx: Tx, access: Access, id: string) {
  const [exam] = await tx.select().from(exams).where(eq(exams.id, id));
  if (!exam) throw new AppError("That exam wasn't found.", "not_found");
  const classIds = (await tx.select({ id: examClasses.classId }).from(examClasses).where(eq(examClasses.examId, id))).map((c) => c.id);
  await requireExamClasses(tx, access, exam.subjectId, classIds);
  return { exam, classIds };
}

export async function saveExam(db: DB, access: Access, input: ExamInput, ip?: string | null) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    await requireSubject(tx, access, input.subjectId);
    await requireExamClasses(tx, access, input.subjectId, input.classIds);
    const current = await getCurrentTerm(tx);
    if (!current) throw new AppError("Set a current term in Academics first.", "invalid");
    const picked = await tx.select({ id: questions.id, subjectId: questions.subjectId }).from(questions).where(inArray(questions.id, input.questionIds));
    if (picked.length !== new Set(input.questionIds).size || picked.some((q) => q.subjectId !== input.subjectId)) {
      throw new AppError("Some questions aren't in this subject's bank any more. Reload and pick again.", "conflict");
    }
    const values = {
      subjectId: input.subjectId,
      title: input.title,
      instructions: input.instructions,
      durationMins: input.durationMins,
      opensAt: lagosDateTime(input.opensAt),
      closesAt: lagosDateTime(input.closesAt),
      shuffle: input.shuffle,
      showScore: input.showScore,
      componentId: input.componentId,
    };
    let exam: typeof exams.$inferSelect;
    if (input.id) {
      const { exam: existing } = await loadExam(tx, access, input.id);
      const [{ n }] = await tx.select({ n: count() }).from(examAttempts).where(eq(examAttempts.examId, input.id));
      if (n > 0) throw new AppError("Students have started this exam, so it can't be changed. You can still close it or change when it closes.", "conflict");
      [exam] = await tx
        .update(exams)
        .set({ ...values, status: input.publish ? "published" : existing.status })
        .where(eq(exams.id, input.id))
        .returning();
      await tx.delete(examClasses).where(eq(examClasses.examId, exam.id));
      await tx.delete(examQuestions).where(eq(examQuestions.examId, exam.id));
    } else {
      [exam] = await tx
        .insert(exams)
        .values({ ...values, schoolId: access.school.id, termId: current.term.id, status: input.publish ? "published" : "draft", createdBy: access.membershipId })
        .returning();
    }
    await tx.insert(examClasses).values([...new Set(input.classIds)].map((classId) => ({ schoolId: access.school.id, examId: exam.id, classId })));
    await tx.insert(examQuestions).values(input.questionIds.map((questionId, sort) => ({ schoolId: access.school.id, examId: exam.id, questionId, sort })));
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.id ? "exam.updated" : "exam.created",
      summary: `${input.id ? "Updated" : "Created"} CBT exam "${exam.title}"`,
      entityType: "exam",
      entityId: exam.id,
    });
    return exam;
  });
}

export async function setExamStatus(db: DB, access: Access, id: string, status: "published" | "closed" | "draft", ip?: string | null) {
  requireCbt(access);
  await withTenant(db, access.school.id, async (tx) => {
    const { exam } = await loadExam(tx, access, id);
    if (status === "draft") {
      const [{ n }] = await tx.select({ n: count() }).from(examAttempts).where(eq(examAttempts.examId, id));
      if (n > 0) throw new AppError("Students have started this exam.", "conflict");
    }
    await tx.update(exams).set({ status }).where(eq(exams.id, id));
    if (status === "closed") await finalizeExpired(tx, id, true);
    await recordAudit(tx, access.school.id, actor(access, ip), { action: `exam.${status}`, summary: `${status === "closed" ? "Closed" : status === "published" ? "Opened" : "Unpublished"} "${exam.title}"`, entityType: "exam", entityId: id });
  });
}

/** Lets an exam run longer (e.g. after a power cut), without touching anything else. */
export async function extendExam(db: DB, access: Access, id: string, closesAt: string) {
  requireCbt(access);
  await withTenant(db, access.school.id, async (tx) => {
    const { exam } = await loadExam(tx, access, id);
    const until = lagosDateTime(closesAt);
    if (until <= exam.opensAt) throw new AppError("It must close after it opens.", "invalid");
    await tx.update(exams).set({ closesAt: until, status: exam.status === "closed" ? "published" : exam.status }).where(eq(exams.id, id));
  });
}

export async function deleteExam(db: DB, access: Access, id: string, ip?: string | null) {
  requireCbt(access);
  await withTenant(db, access.school.id, async (tx) => {
    const { exam } = await loadExam(tx, access, id);
    await tx.delete(exams).where(eq(exams.id, id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "exam.deleted", summary: `Deleted CBT exam "${exam.title}"`, entityType: "exam", entityId: id });
  });
}

type QuestionRow = typeof questions.$inferSelect;

function objectiveScore(qs: QuestionRow[], answers: Record<string, number | string>) {
  let score = 0;
  for (const q of qs) if (q.kind === "objective" && answers[q.id] === q.answer) score += q.marks;
  return Math.round(score * 100) / 100;
}

async function examQuestionRows(tx: Tx, examId: string) {
  return tx
    .select({ q: questions })
    .from(examQuestions)
    .innerJoin(questions, eq(questions.id, examQuestions.questionId))
    .where(eq(examQuestions.examId, examId))
    .orderBy(asc(examQuestions.sort))
    .then((r) => r.map((x) => x.q));
}

/** Submits attempts whose time has run out (or every open one when the exam is closed). */
async function finalizeExpired(tx: Tx, examId: string, all = false) {
  const open = await tx.select().from(examAttempts).where(and(eq(examAttempts.examId, examId), eq(examAttempts.status, "in_progress")));
  const due = open.filter((a) => all || a.deadline.getTime() + GRACE_MS < Date.now());
  if (!due.length) return;
  const qs = await examQuestionRows(tx, examId);
  const hasTheory = qs.some((q) => q.kind === "theory");
  for (const a of due) {
    await tx
      .update(examAttempts)
      .set({ status: hasTheory ? "submitted" : "graded", submittedAt: a.deadline < new Date() ? a.deadline : new Date(), objectiveScore: objectiveScore(qs, a.answers), theoryScore: hasTheory ? null : 0 })
      .where(eq(examAttempts.id, a.id));
  }
}

function examState(e: typeof exams.$inferSelect, now = Date.now()) {
  if (e.status === "draft") return "draft" as const;
  if (e.status === "closed" || e.closesAt.getTime() < now) return "closed" as const;
  if (e.opensAt.getTime() > now) return "scheduled" as const;
  return "open" as const;
}
export type ExamState = ReturnType<typeof examState>;

export async function listExams(db: DB, access: Access, filter: { subjectId?: string; classId?: string; state?: string; q?: string; page?: number } = {}) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    const current = await getCurrentTerm(tx);
    const pairs = await taughtPairs(tx, access);
    const empty = { term: current, rows: [], total: 0, stats: { open: 0, scheduled: 0, toMark: 0, average: null as number | null }, subjects: [], classes: [] };
    if (!current || (pairs !== "all" && pairs.length === 0)) return empty;
    const scope: SQL[] = [eq(exams.termId, current.term.id)];
    if (pairs !== "all") {
      const subjectIds = [...new Set(pairs.map((p) => p.subjectId))];
      const classIds = [...new Set(pairs.map((p) => p.classId))];
      scope.push(inArray(exams.subjectId, subjectIds), sql`exists (select 1 from exam_classes ec where ec.exam_id = ${exams.id} and ec.class_id in (${sql.join(classIds.map((c) => sql`${c}`), sql`, `)}))`);
    }
    const where = [...scope];
    if (filter.subjectId) where.push(eq(exams.subjectId, filter.subjectId));
    if (filter.classId) where.push(sql`exists (select 1 from exam_classes ec where ec.exam_id = ${exams.id} and ec.class_id = ${filter.classId})`);
    if (filter.q) where.push(ilike(exams.title, `%${filter.q}%`));
    if (filter.state === "draft") where.push(eq(exams.status, "draft"));
    if (filter.state === "open") where.push(eq(exams.status, "published"), sql`${exams.opensAt} <= now() and ${exams.closesAt} >= now()`);
    if (filter.state === "scheduled") where.push(eq(exams.status, "published"), sql`${exams.opensAt} > now()`);
    if (filter.state === "closed") where.push(sql`(${exams.status} = 'closed' or (${exams.status} = 'published' and ${exams.closesAt} < now()))`);
    const page = Math.max(1, filter.page ?? 1);

    const [[{ total }], list, subjectRows, classRows, [stats], [agg]] = await Promise.all([
      tx.select({ total: count() }).from(exams).where(and(...where)),
      tx
        .select({ e: exams, subjectName: subjects.name, author: users.name })
        .from(exams)
        .innerJoin(subjects, eq(subjects.id, exams.subjectId))
        .leftJoin(memberships, eq(memberships.id, exams.createdBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(...where))
        .orderBy(desc(exams.opensAt))
        .limit(EXAM_PAGE_SIZE)
        .offset((page - 1) * EXAM_PAGE_SIZE),
      tx.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(asc(subjects.sort), asc(subjects.name)),
      tx.select({ id: classes.id, name: classes.name }).from(classes).innerJoin(classLevels, eq(classLevels.id, classes.levelId)).where(eq(classes.isActive, true)).orderBy(asc(classLevels.sort), asc(classes.name)),
      tx
        .select({
          open: sql<number>`count(*) filter (where ${exams.status} = 'published' and ${exams.opensAt} <= now() and ${exams.closesAt} >= now())`.mapWith(Number),
          scheduled: sql<number>`count(*) filter (where ${exams.status} = 'published' and ${exams.opensAt} > now())`.mapWith(Number),
        })
        .from(exams)
        .where(and(...scope)),
      tx
        .select({
          toMark: sql<number>`count(*) filter (where ${examAttempts.status} = 'submitted')`.mapWith(Number),
          average: sql<number | null>`avg(case when ${examAttempts.status} = 'graded' then (coalesce(${examAttempts.objectiveScore}, 0) + coalesce(${examAttempts.theoryScore}, 0)) / nullif((select sum(q.marks) from exam_questions eq join questions q on q.id = eq.question_id where eq.exam_id = ${exams.id}), 0) end)`,
        })
        .from(examAttempts)
        .innerJoin(exams, eq(exams.id, examAttempts.examId))
        .where(and(...scope)),
    ]);

    const ids = list.map((r) => r.e.id);
    const [classLinks, attemptCounts, qCounts] = ids.length
      ? await Promise.all([
          tx.select({ examId: examClasses.examId, classId: examClasses.classId, name: classes.name }).from(examClasses).innerJoin(classes, eq(classes.id, examClasses.classId)).where(inArray(examClasses.examId, ids)),
          tx
            .select({
              examId: examAttempts.examId,
              started: count(),
              done: sql<number>`count(*) filter (where ${examAttempts.status} <> 'in_progress')`.mapWith(Number),
              toMark: sql<number>`count(*) filter (where ${examAttempts.status} = 'submitted')`.mapWith(Number),
            })
            .from(examAttempts)
            .where(inArray(examAttempts.examId, ids))
            .groupBy(examAttempts.examId),
          tx.select({ examId: examQuestions.examId, n: count() }).from(examQuestions).where(inArray(examQuestions.examId, ids)).groupBy(examQuestions.examId),
        ])
      : [[], [], []];
    const rosterByClass = new Map<string, number>();
    const classIds = [...new Set(classLinks.map((c) => c.classId))];
    if (classIds.length) {
      for (const r of await tx.select({ classId: students.classId, n: count() }).from(students).where(and(inArray(students.classId, classIds), eq(students.status, "active"))).groupBy(students.classId)) {
        rosterByClass.set(r.classId!, r.n);
      }
    }
    const subjectIds = pairs === "all" ? null : new Set(pairs.map((p) => p.subjectId));
    const taughtClasses = pairs === "all" ? null : new Set(pairs.map((p) => p.classId));
    return {
      term: current,
      total,
      rows: list.map((r) => {
        const links = classLinks.filter((c) => c.examId === r.e.id);
        const a = attemptCounts.find((x) => x.examId === r.e.id);
        return {
          ...r,
          state: examState(r.e),
          classNames: links.map((l) => l.name),
          roll: links.reduce((t, l) => t + (rosterByClass.get(l.classId) ?? 0), 0),
          started: a?.started ?? 0,
          done: a?.done ?? 0,
          toMark: a?.toMark ?? 0,
          questions: qCounts.find((q) => q.examId === r.e.id)?.n ?? 0,
        };
      }),
      stats: { ...stats, toMark: agg.toMark, average: agg.average === null ? null : Math.round(Number(agg.average) * 100) },
      subjects: subjectRows.filter((s) => !subjectIds || subjectIds.has(s.id)),
      classes: classRows.filter((c) => !taughtClasses || taughtClasses.has(c.id)),
    };
  });
}

/** What the exam builder offers: classes per subject this person may set exams for, and the CA columns. */
export async function examBuilderOptions(db: DB, access: Access) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    const pairs = await taughtPairs(tx, access);
    const rows = await tx
      .select({ classId: classes.id, className: classes.name, levelId: classes.levelId, subjectId: subjects.id, subjectName: subjects.name })
      .from(classes)
      .innerJoin(classLevels, eq(classLevels.id, classes.levelId))
      .innerJoin(levelSubjects, eq(levelSubjects.levelId, classes.levelId))
      .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
      .where(eq(classes.isActive, true))
      .orderBy(asc(subjects.sort), asc(subjects.name), asc(classLevels.sort), asc(classes.name));
    const out: { subjectId: string; subjectName: string; classes: { id: string; name: string; levelId: string }[] }[] = [];
    for (const r of rows) {
      if (pairs !== "all" && !pairs.some((p) => p.classId === r.classId && p.subjectId === r.subjectId)) continue;
      let s = out.find((x) => x.subjectId === r.subjectId);
      if (!s) out.push((s = { subjectId: r.subjectId, subjectName: r.subjectName, classes: [] }));
      s.classes.push({ id: r.classId, name: r.className, levelId: r.levelId });
    }
    const components = await tx.select().from(assessmentComponents).orderBy(asc(assessmentComponents.sort));
    return { subjects: out, components };
  });
}

/** The bank for one subject, for picking questions into an exam. */
export async function bankForSubject(db: DB, access: Access, subjectId: string) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    await requireSubject(tx, access, subjectId);
    return tx
      .select({ id: questions.id, kind: questions.kind, body: questions.body, marks: questions.marks, topic: questions.topic, levelId: questions.levelId, options: questions.options, answer: questions.answer })
      .from(questions)
      .where(eq(questions.subjectId, subjectId))
      .orderBy(desc(questions.createdAt));
  });
}

/** One exam for its teacher: setup, results, and how each question did. */
export async function getExam(db: DB, access: Access, id: string) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    const { exam, classIds } = await loadExam(tx, access, id);
    await finalizeExpired(tx, id, examState(exam) === "closed");
    const [qs, attempts, classRows, [subject], component, roster] = await Promise.all([
      examQuestionRows(tx, id),
      tx
        .select({ a: examAttempts, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo, className: classes.name })
        .from(examAttempts)
        .innerJoin(students, eq(students.id, examAttempts.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(eq(examAttempts.examId, id)),
      tx.select({ id: classes.id, name: classes.name }).from(classes).where(inArray(classes.id, classIds)),
      tx.select().from(subjects).where(eq(subjects.id, exam.subjectId)),
      exam.componentId ? tx.select().from(assessmentComponents).where(eq(assessmentComponents.id, exam.componentId)).then((r) => r[0] ?? null) : Promise.resolve(null),
      tx
        .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo, className: classes.name })
        .from(students)
        .innerJoin(classes, eq(classes.id, students.classId))
        .where(and(inArray(students.classId, classIds), eq(students.status, "active")))
        .orderBy(asc(students.lastName), asc(students.firstName)),
    ]);
    const total = qs.reduce((t, q) => t + q.marks, 0);
    const finished = attempts.filter((x) => x.a.status !== "in_progress");
    const analysis = qs.map((q) => {
      if (q.kind !== "objective") return { id: q.id, correct: null as number | null, answered: finished.filter((x) => typeof x.a.answers[q.id] === "string" && x.a.answers[q.id]).length };
      const answered = finished.filter((x) => typeof x.a.answers[q.id] === "number");
      return { id: q.id, answered: answered.length, correct: answered.length ? Math.round((answered.filter((x) => x.a.answers[q.id] === q.answer).length / finished.length) * 100) : 0 };
    });
    const notStarted = roster.filter((s) => !attempts.some((x) => x.a.studentId === s.id));
    return {
      exam,
      state: examState(exam),
      subject,
      component,
      classes: classRows,
      classIds,
      questions: qs,
      total,
      hasTheory: qs.some((q) => q.kind === "theory"),
      attempts: attempts.sort((x, y) => x.lastName.localeCompare(y.lastName) || x.firstName.localeCompare(y.firstName)),
      notStarted,
      analysis,
      currentTerm: (await getCurrentTerm(tx))?.term.id === exam.termId,
    };
  });
}

/** One student's script, for marking theory answers. */
export async function getAttemptForMarking(db: DB, access: Access, attemptId: string) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ a: examAttempts, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo })
      .from(examAttempts)
      .innerJoin(students, eq(students.id, examAttempts.studentId))
      .where(eq(examAttempts.id, attemptId));
    if (!row) throw new AppError("That script wasn't found.", "not_found");
    const { exam } = await loadExam(tx, access, row.a.examId);
    await finalizeExpired(tx, exam.id, examState(exam) === "closed");
    const [fresh] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    const qs = await examQuestionRows(tx, exam.id);
    const others = await tx
      .select({ id: examAttempts.id, status: examAttempts.status, lastName: students.lastName, firstName: students.firstName })
      .from(examAttempts)
      .innerJoin(students, eq(students.id, examAttempts.studentId))
      .where(eq(examAttempts.examId, exam.id))
      .orderBy(asc(students.lastName), asc(students.firstName));
    const i = others.findIndex((o) => o.id === attemptId);
    const nextToMark = [...others.slice(i + 1), ...others.slice(0, i)].find((o) => o.status === "submitted")?.id ?? null;
    return { ...row, a: fresh, exam, questions: qs, total: qs.reduce((t, q) => t + q.marks, 0), nextToMark };
  });
}

export const theoryMarksSchema = z.object({ attemptId: z.string().uuid(), marks: z.record(z.string().uuid(), z.number().min(0)) });

export async function markTheory(db: DB, access: Access, input: z.infer<typeof theoryMarksSchema>, ip?: string | null) {
  requireCbt(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [a] = await tx.select().from(examAttempts).where(eq(examAttempts.id, input.attemptId));
    if (!a) throw new AppError("That script wasn't found.", "not_found");
    const { exam } = await loadExam(tx, access, a.examId);
    if (a.status === "in_progress") throw new AppError("This student is still writing the exam.", "conflict");
    const theory = (await examQuestionRows(tx, exam.id)).filter((q) => q.kind === "theory");
    const marks: Record<string, number> = {};
    for (const q of theory) {
      const m = input.marks[q.id];
      if (m === undefined) throw new AppError("Give a mark for every theory question.", "invalid");
      if (m > q.marks) throw new AppError(`A question is worth ${q.marks} marks at most.`, "invalid");
      marks[q.id] = Math.round(m * 100) / 100;
    }
    const theoryScore = Math.round(Object.values(marks).reduce((t, m) => t + m, 0) * 100) / 100;
    await tx.update(examAttempts).set({ theoryMarks: marks, theoryScore, status: "graded" }).where(eq(examAttempts.id, a.id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "exam.marked", summary: `Marked a "${exam.title}" script`, entityType: "exam", entityId: exam.id });
    return { theoryScore };
  });
}

/** Lets a student who was cut off (power, network) continue, with fresh time. */
export async function reopenAttempt(db: DB, access: Access, attemptId: string, minutes: number, ip?: string | null) {
  requireCbt(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [a] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    if (!a) throw new AppError("That script wasn't found.", "not_found");
    const { exam } = await loadExam(tx, access, a.examId);
    if (a.status === "graded" && Object.keys(a.theoryMarks).length) throw new AppError("This script has been marked.", "conflict");
    const deadline = new Date(Date.now() + Math.max(1, Math.min(300, minutes)) * 60_000);
    await tx.update(examAttempts).set({ status: "in_progress", submittedAt: null, deadline, objectiveScore: null, theoryScore: null }).where(eq(examAttempts.id, a.id));
    if (exam.closesAt < deadline) await tx.update(exams).set({ closesAt: deadline, status: "published" }).where(eq(exams.id, exam.id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "exam.attempt_reopened", summary: `Gave a student ${minutes} more minutes on "${exam.title}"`, entityType: "exam", entityId: exam.id });
  });
}

/** Writes every marked script's percentage into the linked CA column, through the score sheet rules. */
export async function sendExamToCA(db: DB, access: Access, examId: string) {
  requireCbt(access);
  const prep = await withTenant(db, access.school.id, async (tx) => {
    const { exam, classIds } = await loadExam(tx, access, examId);
    if (!exam.componentId) throw new AppError("Link this exam to a CA column first (edit the exam).", "invalid");
    const current = await getCurrentTerm(tx);
    if (current?.term.id !== exam.termId) throw new AppError("This exam is from an earlier term.", "conflict");
    await finalizeExpired(tx, examId, examState(exam) === "closed");
    const [comp] = await tx.select().from(assessmentComponents).where(eq(assessmentComponents.id, exam.componentId));
    if (!comp) throw new AppError("That CA column no longer exists.", "invalid");
    const qs = await examQuestionRows(tx, examId);
    const total = qs.reduce((t, q) => t + q.marks, 0);
    const attempts = await tx
      .select({ a: examAttempts, classId: students.classId })
      .from(examAttempts)
      .innerJoin(students, eq(students.id, examAttempts.studentId))
      .where(eq(examAttempts.examId, examId));
    if (attempts.some((x) => x.a.status === "submitted")) throw new AppError("Mark every theory script first.", "invalid");
    return { exam, comp, total, classIds, graded: attempts.filter((x) => x.a.status === "graded") };
  });
  if (prep.graded.length === 0) throw new AppError("No finished scripts yet.", "invalid");
  let saved = 0;
  for (const classId of prep.classIds) {
    const entries = prep.graded
      .filter((x) => x.classId === classId)
      .map((x) => ({ studentId: x.a.studentId, componentId: prep.comp.id, score: Math.round((((x.a.objectiveScore ?? 0) + (x.a.theoryScore ?? 0)) / prep.total) * prep.comp.maxScore * 10) / 10 }));
    if (entries.length) saved += (await saveScores(db, access, { classId, subjectId: prep.exam.subjectId, entries })).saved;
  }
  return { saved, column: prep.comp.name, max: prep.comp.maxScore };
}

// ---------- Students ----------

type StudentExamStatus = "upcoming" | "open" | "in_progress" | "done" | "missed";

async function examsForStudent(tx: Tx, me: { studentId: string; classId: string | null; levelId: string | null }) {
  const current = await getCurrentTerm(tx);
  if (!current || !me.classId) return [];
  const taken = await studentSubjectIds(tx, me.studentId, me.levelId);
  const rows = await tx
    .select({ e: exams, subjectName: subjects.name, attempt: examAttempts })
    .from(exams)
    .innerJoin(examClasses, and(eq(examClasses.examId, exams.id), eq(examClasses.classId, me.classId)))
    .innerJoin(subjects, eq(subjects.id, exams.subjectId))
    .leftJoin(examAttempts, and(eq(examAttempts.examId, exams.id), eq(examAttempts.studentId, me.studentId)))
    .where(and(eq(exams.termId, current.term.id), inArray(exams.status, ["published", "closed"])))
    .orderBy(asc(exams.opensAt));
  const now = Date.now();
  return rows
    .filter((r) => taken.has(r.e.subjectId))
    .map((r) => {
      const a = r.attempt;
      const expired = a?.status === "in_progress" && a.deadline.getTime() + GRACE_MS < now;
      const status: StudentExamStatus =
        a && (a.status !== "in_progress" || expired)
          ? "done"
          : a
            ? "in_progress"
            : examState(r.e, now) === "closed"
              ? "missed"
              : r.e.opensAt.getTime() > now
                ? "upcoming"
                : "open";
      return { ...r, status };
    });
}

export async function getStudentExams(db: DB, userId: string) {
  const me = await requireStudent(db, userId);
  if (!me.school.features.includes("cbt")) return { me, rows: [] };
  const rows = await withTenant(db, me.schoolId, async (tx) => {
    const list = await examsForStudent(tx, me);
    for (const r of list) if (r.attempt && r.status === "done" && r.attempt.status === "in_progress") await finalizeExpired(tx, r.e.id);
    return list;
  });
  return { me, rows };
}

async function studentExam(tx: Tx, me: Awaited<ReturnType<typeof requireStudent>>, examId: string) {
  const row = (await examsForStudent(tx, me)).find((r) => r.e.id === examId);
  if (!row) throw new AppError("That exam wasn't found.", "not_found");
  return row;
}

/** The exam's cover page: rules, window, and result once done. */
export async function getStudentExam(db: DB, userId: string, examId: string) {
  const me = await requireStudent(db, userId);
  return withTenant(db, me.schoolId, async (tx) => {
    let row = await studentExam(tx, me, examId);
    if (row.attempt?.status === "in_progress" && row.status === "done") {
      await finalizeExpired(tx, examId);
      row = await studentExam(tx, me, examId);
    }
    const qs = await examQuestionRows(tx, examId);
    const total = qs.reduce((t, q) => t + q.marks, 0);
    const a = row.attempt;
    const result =
      a && a.status !== "in_progress" && row.e.showScore
        ? { objective: a.objectiveScore ?? 0, theory: a.theoryScore, total, graded: a.status === "graded", objectiveTotal: qs.filter((q) => q.kind === "objective").reduce((t, q) => t + q.marks, 0) }
        : null;
    return { me, ...row, questionCount: qs.length, total, result };
  });
}

/** Starts (or resumes) an attempt. Order is fixed per student when they start. */
export async function startExam(db: DB, userId: string, examId: string) {
  const me = await requireStudent(db, userId);
  return withTenant(db, me.schoolId, async (tx) => {
    const row = await studentExam(tx, me, examId);
    if (row.attempt) {
      if (row.status === "done") throw new AppError("You've already finished this exam.", "conflict");
      return row.attempt;
    }
    if (row.status === "upcoming") throw new AppError("This exam hasn't opened yet.", "conflict");
    if (row.status !== "open") throw new AppError("This exam has closed.", "conflict");
    const qs = await examQuestionRows(tx, examId);
    const ordered = row.e.shuffle ? shuffled(qs.length).map((i) => qs[i]) : qs;
    const order = ordered.map((q) => ({ q: q.id, o: q.kind === "objective" ? (row.e.shuffle ? shuffled(q.options.length) : q.options.map((_, i) => i)) : [] }));
    const deadline = new Date(Math.min(Date.now() + row.e.durationMins * 60_000, row.e.closesAt.getTime()));
    const [attempt] = await tx
      .insert(examAttempts)
      .values({ schoolId: me.schoolId, examId, studentId: me.studentId, deadline, order })
      .onConflictDoNothing()
      .returning();
    if (!attempt) {
      const [existing] = await tx.select().from(examAttempts).where(and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, me.studentId)));
      return existing;
    }
    return attempt;
  });
}

/** The paper as this student sees it. Never includes the answers. */
export async function getExamPaper(db: DB, userId: string, examId: string) {
  const me = await requireStudent(db, userId);
  return withTenant(db, me.schoolId, async (tx) => {
    const row = await studentExam(tx, me, examId);
    const a = row.attempt;
    if (!a || row.status !== "in_progress") return null;
    const qs = new Map((await examQuestionRows(tx, examId)).map((q) => [q.id, q]));
    return {
      exam: { id: row.e.id, title: row.e.title, subjectName: row.subjectName, instructions: row.e.instructions },
      deadline: a.deadline.toISOString(),
      serverNow: new Date().toISOString(),
      focusLosses: a.focusLosses,
      answers: a.answers,
      questions: a.order
        .map(({ q, o }) => {
          const question = qs.get(q);
          if (!question) return null;
          return { id: q, kind: question.kind, body: question.body, marks: question.marks, options: o.map((i) => ({ i, text: question.options[i] })) };
        })
        .filter((q) => q !== null),
    };
  });
}

async function openAttempt(tx: Tx, me: Awaited<ReturnType<typeof requireStudent>>, examId: string) {
  const [a] = await tx.select().from(examAttempts).where(and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, me.studentId)));
  if (!a || a.status !== "in_progress") throw new AppError("This exam isn't open for you.", "conflict");
  if (a.deadline.getTime() + GRACE_MS < Date.now()) {
    await finalizeExpired(tx, examId);
    throw new AppError("Time is up. Your answers were submitted.", "conflict");
  }
  const [e] = await tx.select({ status: exams.status }).from(exams).where(eq(exams.id, examId));
  if (e?.status === "closed") throw new AppError("Your teacher has closed this exam.", "conflict");
  return a;
}

export const answerSchema = z.object({ examId: z.string().uuid(), questionId: z.string().uuid(), answer: z.union([z.number().int().min(0).max(5), z.string().max(20000), z.null()]) });

/** Autosaves one answer. Objective answers are the option's original position. */
export async function saveAnswer(db: DB, userId: string, input: z.infer<typeof answerSchema>) {
  const me = await requireStudent(db, userId);
  await withTenant(db, me.schoolId, async (tx) => {
    const a = await openAttempt(tx, me, input.examId);
    const slot = a.order.find((o) => o.q === input.questionId);
    if (!slot) throw new AppError("That question isn't in your paper.", "invalid");
    if (typeof input.answer === "number" && !slot.o.includes(input.answer)) throw new AppError("That option isn't in this question.", "invalid");
    const key = input.questionId;
    await tx
      .update(examAttempts)
      .set({
        answers: input.answer === null || input.answer === "" ? sql`${examAttempts.answers} - ${key}::text` : sql`${examAttempts.answers} || ${JSON.stringify({ [key]: input.answer })}::jsonb`,
      })
      .where(eq(examAttempts.id, a.id));
  });
}

export async function recordFocusLoss(db: DB, userId: string, examId: string) {
  const me = await requireStudent(db, userId);
  return withTenant(db, me.schoolId, async (tx) => {
    const [a] = await tx
      .update(examAttempts)
      .set({ focusLosses: sql`${examAttempts.focusLosses} + 1` })
      .where(and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, me.studentId), eq(examAttempts.status, "in_progress")))
      .returning({ n: examAttempts.focusLosses });
    return a?.n ?? 0;
  });
}

export async function submitExam(db: DB, userId: string, examId: string) {
  const me = await requireStudent(db, userId);
  return withTenant(db, me.schoolId, async (tx) => {
    const [a] = await tx.select().from(examAttempts).where(and(eq(examAttempts.examId, examId), eq(examAttempts.studentId, me.studentId)));
    if (!a) throw new AppError("You haven't started this exam.", "conflict");
    if (a.status !== "in_progress") return { already: true };
    const qs = await examQuestionRows(tx, examId);
    const hasTheory = qs.some((q) => q.kind === "theory");
    await tx
      .update(examAttempts)
      .set({ status: hasTheory ? "submitted" : "graded", submittedAt: new Date(), objectiveScore: objectiveScore(qs, a.answers), theoryScore: hasTheory ? null : 0 })
      .where(eq(examAttempts.id, a.id));
    return { already: false };
  });
}
