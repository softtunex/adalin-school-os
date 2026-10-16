import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { assessmentComponents, assignments, assignmentSubmissions, classes, classLevels, levelSubjects, memberships, students, subjects, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, type Access } from "./access";
import { getCurrentTerm } from "./academics";
import { recordAudit } from "./audit";
import { subjectRoster } from "./electives";
import { claimUploads, filesFor, removeFiles } from "./files";
import { saveScores } from "./results";
import { requireChild } from "./parent-portal";
import { myStudentRecord, requireStudent } from "./student-portal";
import { lagosDateTime, studentSubjectIds, taughtPairs, teaches } from "./teaching";

export const ASSIGNMENT_PAGE_SIZE = 20;

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireAssignments(access: Access) {
  if (!hasFeature(access.plan, "assignments")) throw new AppError("Assignments are on the Standard plan.", "upgrade");
}

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

export const assignmentSchema = z
  .object({
    id: z.string().uuid().optional(),
    classId: z.string().uuid("Choose a class."),
    subjectId: z.string().uuid("Choose a subject."),
    title: z.string().trim().min(3, "Give it a title.").max(150),
    instructions: z.string().trim().max(5000).default(""),
    dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose when it's due."),
    maxScore: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() ? Number(v) : null))
      .pipe(z.number().int("Use a whole number.").min(1, "At least 1.").max(1000).nullable()),
    componentId: optionalId,
    allowLate: z.boolean().default(true),
    publish: z.boolean().default(true),
    fileIds: z.array(z.string().uuid()).max(5).default([]),
    removeFileIds: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => !v.componentId || v.maxScore, { path: ["maxScore"], message: "Set a mark so scores can be scaled into the CA column." });
export type AssignmentInput = z.infer<typeof assignmentSchema>;

export async function saveAssignment(db: DB, access: Access, input: AssignmentInput, ip?: string | null) {
  requireAssignments(access);
  return withTenant(db, access.school.id, async (tx) => {
    if (!(await teaches(tx, access, input.classId, input.subjectId))) throw new AppError("You can only set work for the classes and subjects you teach.", "forbidden");
    const current = await getCurrentTerm(tx);
    if (!current) throw new AppError("Set a current term in Academics first.", "invalid");
    const dueAt = lagosDateTime(input.dueAt);
    if (input.componentId) {
      const [comp] = await tx.select().from(assessmentComponents).where(eq(assessmentComponents.id, input.componentId));
      if (!comp) throw new AppError("That CA column no longer exists.", "invalid");
    }
    const values = {
      classId: input.classId,
      subjectId: input.subjectId,
      title: input.title,
      instructions: input.instructions,
      dueAt,
      maxScore: input.maxScore,
      componentId: input.componentId,
      allowLate: input.allowLate,
    };

    let row: typeof assignments.$inferSelect;
    if (input.id) {
      const [existing] = await tx.select().from(assignments).where(eq(assignments.id, input.id));
      if (!existing) throw new AppError("That assignment wasn't found.", "not_found");
      if (!(await teaches(tx, access, existing.classId, existing.subjectId))) throw new AppError("You can't edit this assignment.", "forbidden");
      const status = existing.status === "draft" && input.publish ? "published" : existing.status;
      [row] = await tx.update(assignments).set({ ...values, status }).where(eq(assignments.id, input.id)).returning();
      if (input.removeFileIds.length) await removeFiles(tx, { ownerType: "assignment", ownerId: row.id, ids: input.removeFileIds });
    } else {
      if (dueAt.getTime() < Date.now()) throw new AppError("The due date has already passed.", "invalid");
      [row] = await tx
        .insert(assignments)
        .values({ ...values, schoolId: access.school.id, termId: current.term.id, status: input.publish ? "published" : "draft", createdBy: access.membershipId })
        .returning();
    }
    await claimUploads(tx, { userId: access.user.id, ownerType: "assignment", ownerId: row.id, fileIds: input.fileIds });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.id ? "assignment.updated" : "assignment.created",
      summary: `${input.id ? "Updated" : "Set"} "${row.title}"`,
      entityType: "assignment",
      entityId: row.id,
    });
    return row;
  });
}

async function loadOwn(tx: Tx, access: Access, id: string) {
  const [a] = await tx.select().from(assignments).where(eq(assignments.id, id));
  if (!a) throw new AppError("That assignment wasn't found.", "not_found");
  if (!(await teaches(tx, access, a.classId, a.subjectId))) throw new AppError("You can't change this assignment.", "forbidden");
  return a;
}

export async function setAssignmentStatus(db: DB, access: Access, id: string, status: "published" | "closed", ip?: string | null) {
  await withTenant(db, access.school.id, async (tx) => {
    const a = await loadOwn(tx, access, id);
    await tx.update(assignments).set({ status }).where(eq(assignments.id, id));
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: status === "closed" ? "assignment.closed" : "assignment.reopened",
      summary: `${status === "closed" ? "Closed" : "Reopened"} "${a.title}"`,
      entityType: "assignment",
      entityId: id,
    });
  });
}

export async function deleteAssignment(db: DB, access: Access, id: string, ip?: string | null) {
  await withTenant(db, access.school.id, async (tx) => {
    const a = await loadOwn(tx, access, id);
    const subs = await tx.select({ id: assignmentSubmissions.id }).from(assignmentSubmissions).where(eq(assignmentSubmissions.assignmentId, id));
    for (const s of subs) await removeFiles(tx, { ownerType: "submission", ownerId: s.id });
    await removeFiles(tx, { ownerType: "assignment", ownerId: id });
    await tx.delete(assignments).where(eq(assignments.id, id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "assignment.deleted", summary: `Deleted "${a.title}"`, entityType: "assignment", entityId: id });
  });
}

/** Assignments this person can see, with how many have handed in and been marked. */
export async function listAssignments(
  db: DB,
  access: Access,
  filter: { classId?: string; subjectId?: string; status?: string; q?: string; page?: number } = {},
) {
  requireAssignments(access);
  return withTenant(db, access.school.id, async (tx) => {
    const current = await getCurrentTerm(tx);
    const pairs = await taughtPairs(tx, access);
    const empty = { term: current, rows: [], total: 0, stats: { active: 0, dueThisWeek: 0, toMark: 0, onTime: null as number | null }, classes: [], subjects: [], components: [] };
    if (!current || (pairs !== "all" && pairs.length === 0)) return { ...empty, components: await tx.select().from(assessmentComponents).orderBy(asc(assessmentComponents.sort)) };

    const scope: SQL[] = [eq(assignments.termId, current.term.id)];
    if (pairs !== "all") scope.push(or(...pairs.map((p) => and(eq(assignments.classId, p.classId), eq(assignments.subjectId, p.subjectId))))!);
    const where: SQL[] = [...scope];
    if (filter.classId) where.push(eq(assignments.classId, filter.classId));
    if (filter.subjectId) where.push(eq(assignments.subjectId, filter.subjectId));
    const now = new Date();
    if (filter.status === "open") where.push(eq(assignments.status, "published"), gte(assignments.dueAt, now));
    if (filter.status === "past") where.push(eq(assignments.status, "published"), lt(assignments.dueAt, now));
    if (filter.status === "closed") where.push(eq(assignments.status, "closed"));
    if (filter.status === "draft") where.push(eq(assignments.status, "draft"));
    if (filter.q) where.push(ilike(assignments.title, `%${filter.q}%`));

    const page = Math.max(1, filter.page ?? 1);
    const [[{ total }], list, classRows, subjectRows, components] = await Promise.all([
      tx.select({ total: count() }).from(assignments).where(and(...where)),
      tx
        .select({ a: assignments, className: classes.name, subjectName: subjects.name, teacher: users.name })
        .from(assignments)
        .innerJoin(classes, eq(classes.id, assignments.classId))
        .innerJoin(subjects, eq(subjects.id, assignments.subjectId))
        .leftJoin(memberships, eq(memberships.id, assignments.createdBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(...where))
        .orderBy(desc(assignments.dueAt))
        .limit(ASSIGNMENT_PAGE_SIZE)
        .offset((page - 1) * ASSIGNMENT_PAGE_SIZE),
      tx.select({ id: classes.id, name: classes.name, sort: classLevels.sort }).from(classes).innerJoin(classLevels, eq(classLevels.id, classes.levelId)).where(eq(classes.isActive, true)).orderBy(asc(classLevels.sort), asc(classes.name)),
      tx.select({ id: subjects.id, name: subjects.name }).from(subjects).orderBy(asc(subjects.sort), asc(subjects.name)),
      tx.select().from(assessmentComponents).orderBy(asc(assessmentComponents.sort)),
    ]);

    const ids = list.map((r) => r.a.id);
    const counts = ids.length
      ? await tx
          .select({
            id: assignmentSubmissions.assignmentId,
            submitted: sql<number>`count(*) filter (where ${assignmentSubmissions.submittedAt} is not null)`.mapWith(Number),
            marked: sql<number>`count(*) filter (where ${assignmentSubmissions.score} is not null)`.mapWith(Number),
          })
          .from(assignmentSubmissions)
          .where(inArray(assignmentSubmissions.assignmentId, ids))
          .groupBy(assignmentSubmissions.assignmentId)
      : [];
    const rows = [];
    for (const r of list) {
      const c = counts.find((x) => x.id === r.a.id);
      rows.push({ ...r, roll: (await subjectRoster(tx, r.a.classId, r.a.subjectId)).length, submitted: c?.submitted ?? 0, marked: c?.marked ?? 0 });
    }

    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
    const [[stats], [mark]] = await Promise.all([
      tx
        .select({
          active: sql<number>`count(*) filter (where ${assignments.status} = 'published' and ${assignments.dueAt} >= now())`.mapWith(Number),
          dueThisWeek: sql<number>`count(*) filter (where ${assignments.status} = 'published' and ${assignments.dueAt} >= now() and ${assignments.dueAt} < ${weekAhead})`.mapWith(Number),
        })
        .from(assignments)
        .where(and(...scope)),
      tx
        .select({
          toMark: sql<number>`count(*) filter (where ${assignmentSubmissions.submittedAt} is not null and ${assignmentSubmissions.score} is null and ${assignments.maxScore} is not null)`.mapWith(Number),
          submitted: sql<number>`count(*) filter (where ${assignmentSubmissions.submittedAt} is not null)`.mapWith(Number),
          late: sql<number>`count(*) filter (where ${assignmentSubmissions.late})`.mapWith(Number),
        })
        .from(assignmentSubmissions)
        .innerJoin(assignments, eq(assignments.id, assignmentSubmissions.assignmentId))
        .where(and(...scope)),
    ]);

    const taughtClasses = pairs === "all" ? null : new Set(pairs.map((p) => p.classId));
    const taughtSubjects = pairs === "all" ? null : new Set(pairs.map((p) => p.subjectId));
    return {
      term: current,
      rows,
      total,
      stats: { ...stats, toMark: mark.toMark, onTime: mark.submitted ? Math.round(((mark.submitted - mark.late) / mark.submitted) * 100) : null },
      classes: classRows.filter((c) => !taughtClasses || taughtClasses.has(c.id)),
      subjects: subjectRows.filter((s) => !taughtSubjects || taughtSubjects.has(s.id)),
      components,
      pairs: pairs === "all" ? null : pairs,
    };
  });
}

/** One assignment for its teacher: the brief, the files, and every student's work. */
export async function getAssignment(db: DB, access: Access, id: string) {
  requireAssignments(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ a: assignments, className: classes.name, subjectName: subjects.name, component: assessmentComponents })
      .from(assignments)
      .innerJoin(classes, eq(classes.id, assignments.classId))
      .innerJoin(subjects, eq(subjects.id, assignments.subjectId))
      .leftJoin(assessmentComponents, eq(assessmentComponents.id, assignments.componentId))
      .where(eq(assignments.id, id));
    if (!row) throw new AppError("That assignment wasn't found.", "not_found");
    if (!(await teaches(tx, access, row.a.classId, row.a.subjectId))) throw new AppError("You can't open this assignment.", "forbidden");
    const [roster, subs, current] = await Promise.all([
      subjectRoster(tx, row.a.classId, row.a.subjectId),
      tx.select().from(assignmentSubmissions).where(eq(assignmentSubmissions.assignmentId, id)),
      getCurrentTerm(tx),
    ]);
    const [briefFiles, subFiles] = await Promise.all([filesFor(tx, "assignment", [id]), filesFor(tx, "submission", subs.map((s) => s.id))]);
    return {
      ...row,
      files: briefFiles.get(id) ?? [],
      currentTerm: current?.term.id === row.a.termId,
      students: roster.map((s) => {
        const sub = subs.find((x) => x.studentId === s.id) ?? null;
        return { ...s, submission: sub, files: sub ? (subFiles.get(sub.id) ?? []) : [] };
      }),
    };
  });
}

export const gradesSchema = z.object({
  assignmentId: z.string().uuid(),
  grades: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        score: z.number().min(0).nullable(),
        feedback: z.string().trim().max(2000).default(""),
      }),
    )
    .max(300),
});

export async function gradeSubmissions(db: DB, access: Access, input: z.infer<typeof gradesSchema>, ip?: string | null) {
  return withTenant(db, access.school.id, async (tx) => {
    const a = await loadOwn(tx, access, input.assignmentId);
    const roster = new Set((await subjectRoster(tx, a.classId, a.subjectId)).map((s) => s.id));
    let marked = 0;
    for (const g of input.grades) {
      if (!roster.has(g.studentId)) throw new AppError("A student on this list has moved class. Reload the page.", "conflict");
      if (g.score !== null) {
        if (!a.maxScore) throw new AppError("Set a mark for this assignment before scoring it.", "invalid");
        if (g.score > a.maxScore) throw new AppError(`Scores must be between 0 and ${a.maxScore}.`, "invalid");
      }
      const graded = g.score !== null || g.feedback !== "";
      const score = g.score === null ? null : Math.round(g.score * 100) / 100;
      const [existing] = await tx
        .select()
        .from(assignmentSubmissions)
        .where(and(eq(assignmentSubmissions.assignmentId, a.id), eq(assignmentSubmissions.studentId, g.studentId)));
      if (!existing && !graded) continue;
      if (existing && existing.score === score && (existing.feedback ?? "") === g.feedback) continue;
      const set = { score, feedback: g.feedback || null, gradedBy: graded ? access.membershipId : null, gradedAt: graded ? new Date() : null };
      if (existing) await tx.update(assignmentSubmissions).set(set).where(eq(assignmentSubmissions.id, existing.id));
      else await tx.insert(assignmentSubmissions).values({ schoolId: access.school.id, assignmentId: a.id, studentId: g.studentId, ...set });
      marked++;
    }
    if (marked) {
      await recordAudit(tx, access.school.id, actor(access, ip), { action: "assignment.marked", summary: `Marked ${marked} on "${a.title}"`, entityType: "assignment", entityId: a.id });
    }
    return { marked };
  });
}

/** Copies marks into the linked CA column, scaled to its maximum, through the normal score sheet rules. */
export async function sendToCA(db: DB, access: Access, assignmentId: string) {
  const { a, comp, subs } = await withTenant(db, access.school.id, async (tx) => {
    const a = await loadOwn(tx, access, assignmentId);
    if (!a.componentId || !a.maxScore) throw new AppError("Link this assignment to a CA column and set its mark first.", "invalid");
    const current = await getCurrentTerm(tx);
    if (current?.term.id !== a.termId) throw new AppError("This assignment is from an earlier term, so its marks can't go into this term's scores.", "conflict");
    const [comp] = await tx.select().from(assessmentComponents).where(eq(assessmentComponents.id, a.componentId));
    if (!comp) throw new AppError("That CA column no longer exists.", "invalid");
    const subs = await tx
      .select({ studentId: assignmentSubmissions.studentId, score: assignmentSubmissions.score })
      .from(assignmentSubmissions)
      .where(and(eq(assignmentSubmissions.assignmentId, a.id), isNotNull(assignmentSubmissions.score)));
    return { a, comp, subs };
  });
  if (subs.length === 0) throw new AppError("Mark some work first.", "invalid");
  const entries = subs.map((s) => ({ studentId: s.studentId, componentId: comp.id, score: Math.round(((s.score ?? 0) / a.maxScore!) * comp.maxScore * 10) / 10 }));
  const { saved } = await saveScores(db, access, { classId: a.classId, subjectId: a.subjectId, entries });
  return { saved, column: comp.name, max: comp.maxScore };
}

// ---------- Students ----------

function studentStatus(a: typeof assignments.$inferSelect, sub: typeof assignmentSubmissions.$inferSelect | null, now = Date.now()) {
  if (sub?.score != null || (sub?.gradedAt && sub.feedback)) return "marked" as const;
  if (sub?.submittedAt) return "handed_in" as const;
  if (a.status === "closed" || (a.dueAt.getTime() < now && !a.allowLate)) return "missed" as const;
  if (a.dueAt.getTime() < now) return "overdue" as const;
  return "to_do" as const;
}
export type StudentAssignmentStatus = ReturnType<typeof studentStatus>;

async function assignmentsForStudent(tx: Tx, me: { studentId: string; classId: string | null; levelId: string | null }) {
  const current = await getCurrentTerm(tx);
  if (!current || !me.classId) return [];
  const taken = await studentSubjectIds(tx, me.studentId, me.levelId);
  const rows = await tx
    .select({ a: assignments, subjectName: subjects.name, sub: assignmentSubmissions })
    .from(assignments)
    .innerJoin(subjects, eq(subjects.id, assignments.subjectId))
    .leftJoin(assignmentSubmissions, and(eq(assignmentSubmissions.assignmentId, assignments.id), eq(assignmentSubmissions.studentId, me.studentId)))
    .where(and(eq(assignments.termId, current.term.id), eq(assignments.classId, me.classId), inArray(assignments.status, ["published", "closed"])))
    .orderBy(asc(assignments.dueAt));
  return rows.filter((r) => taken.has(r.a.subjectId)).map((r) => ({ ...r, status: studentStatus(r.a, r.sub) }));
}

export async function getStudentAssignments(db: DB, userId: string) {
  const me = await requireStudent(db, userId);
  if (!me.school.features.includes("assignments")) return { me, rows: [] };
  return { me, rows: await withTenant(db, me.schoolId, (tx) => assignmentsForStudent(tx, me)) };
}

export async function getStudentAssignment(db: DB, userId: string, id: string) {
  const me = await requireStudent(db, userId);
  return withTenant(db, me.schoolId, async (tx) => {
    const row = (await assignmentsForStudent(tx, me)).find((r) => r.a.id === id);
    if (!row) throw new AppError("That assignment wasn't found.", "not_found");
    const [brief, mine] = await Promise.all([filesFor(tx, "assignment", [id]), row.sub ? filesFor(tx, "submission", [row.sub.id]) : Promise.resolve(new Map())]);
    const canSubmit = row.a.status === "published" && row.sub?.score == null && (row.a.allowLate || row.a.dueAt.getTime() >= Date.now());
    return { me, ...row, files: brief.get(id) ?? [], myFiles: row.sub ? (mine.get(row.sub.id) ?? []) : [], canSubmit };
  });
}

export const submissionSchema = z.object({
  assignmentId: z.string().uuid(),
  text: z.string().trim().max(20000).default(""),
  fileIds: z.array(z.string().uuid()).max(5).default([]),
  removeFileIds: z.array(z.string().uuid()).default([]),
});

export async function submitAssignment(db: DB, userId: string, input: z.infer<typeof submissionSchema>) {
  const me = await requireStudent(db, userId);
  return withTenant(db, me.schoolId, async (tx) => {
    const row = (await assignmentsForStudent(tx, me)).find((r) => r.a.id === input.assignmentId);
    if (!row) throw new AppError("That assignment wasn't found.", "not_found");
    if (row.a.status !== "published") throw new AppError("Your teacher has closed this assignment.", "conflict");
    if (row.sub?.score != null) throw new AppError("This has already been marked.", "conflict");
    const now = new Date();
    const late = now.getTime() > row.a.dueAt.getTime();
    if (late && !row.a.allowLate) throw new AppError("The deadline has passed and late work isn't accepted.", "conflict");
    const keptFiles = row.sub ? ((await filesFor(tx, "submission", [row.sub.id])).get(row.sub.id) ?? []).filter((f) => !input.removeFileIds.includes(f.id)).length : 0;
    if (!input.text && input.fileIds.length + keptFiles === 0) throw new AppError("Write your answer or attach a file.", "invalid");

    const [sub] = row.sub
      ? await tx.update(assignmentSubmissions).set({ text: input.text, submittedAt: now, late }).where(eq(assignmentSubmissions.id, row.sub.id)).returning()
      : await tx.insert(assignmentSubmissions).values({ schoolId: me.schoolId, assignmentId: row.a.id, studentId: me.studentId, text: input.text, submittedAt: now, late }).returning();
    if (input.removeFileIds.length) await removeFiles(tx, { ownerType: "submission", ownerId: sub.id, ids: input.removeFileIds });
    await claimUploads(tx, { userId, ownerType: "submission", ownerId: sub.id, fileIds: input.fileIds });
    return { late };
  });
}

/** Whether a signed-in student may upload into their school (used before a submission exists). */
export async function studentUploadSchool(db: DB, userId: string) {
  const me = await myStudentRecord(db, userId);
  return me?.school.features.includes("assignments") ? me.schoolId : null;
}

// ---------- Parents ----------

/** A child's homework this term, for the parent app. */
export async function childAssignments(tx: Tx, child: { studentId: string; classId: string | null }) {
  const [s] = await tx.select({ levelId: classes.levelId }).from(students).leftJoin(classes, eq(classes.id, students.classId)).where(eq(students.id, child.studentId));
  return assignmentsForStudent(tx, { studentId: child.studentId, classId: child.classId, levelId: s?.levelId ?? null });
}

export function canSetWork(access: Access) {
  return can(access, "teaching:lessons") && hasFeature(access.plan, "assignments");
}

/** Classes this person can set work for, each with the subjects they can set it in. */
export async function assignmentTargets(db: DB, access: Access) {
  return withTenant(db, access.school.id, async (tx) => {
    const pairs = await taughtPairs(tx, access);
    const rows = await tx
      .select({ classId: classes.id, className: classes.name, subjectId: subjects.id, subjectName: subjects.name })
      .from(classes)
      .innerJoin(classLevels, eq(classLevels.id, classes.levelId))
      .innerJoin(levelSubjects, eq(levelSubjects.levelId, classes.levelId))
      .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
      .where(eq(classes.isActive, true))
      .orderBy(asc(classLevels.sort), asc(classes.name), asc(subjects.sort), asc(subjects.name));
    const out: { classId: string; className: string; subjects: { id: string; name: string }[] }[] = [];
    for (const r of rows) {
      if (pairs !== "all" && !pairs.some((p) => p.classId === r.classId && p.subjectId === r.subjectId)) continue;
      let c = out.find((x) => x.classId === r.classId);
      if (!c) out.push((c = { classId: r.classId, className: r.className, subjects: [] }));
      c.subjects.push({ id: r.subjectId, name: r.subjectName });
    }
    return out;
  });
}

/** A child's homework this term for their parent, when the school has assignments. */
export async function getChildHomework(db: DB, userId: string, studentId: string) {
  const child = await requireChild(db, userId, studentId);
  if (!child.school.features.includes("assignments")) return null;
  const rows = await withTenant(db, child.schoolId, (tx) => childAssignments(tx, child));
  const files = await withTenant(db, child.schoolId, (tx) => filesFor(tx, "assignment", rows.map((r) => r.a.id)));
  return rows.map((r) => ({ ...r, files: files.get(r.a.id) ?? [] }));
}
