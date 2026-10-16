import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { classLevels, lessonNotes, levelSubjects, memberships, schemeItems, subjects, terms, users, type LESSON_NOTE_STATUSES } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, type Access } from "./access";
import { getCurrentTerm } from "./academics";
import { recordAudit } from "./audit";
import { claimUploads, filesFor, removeFiles } from "./files";
import { taughtPairs } from "./teaching";

export const NOTE_PAGE_SIZE = 20;
export type NoteStatus = (typeof LESSON_NOTE_STATUSES)[number];

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireLessons(access: Access) {
  if (!hasFeature(access.plan, "assignments")) throw new AppError("Lesson notes are on the Standard plan.", "upgrade");
  if (!can(access, "teaching:lessons") && !can(access, "teaching:review")) throw new AppError("You don't have permission to do that.", "forbidden");
}

/** Weeks in a term from its dates, 13 when the dates aren't set. */
export function termWeeks(term: { startsOn: string | null; endsOn: string | null }) {
  if (!term.startsOn || !term.endsOn) return 13;
  const days = (Date.parse(term.endsOn) - Date.parse(term.startsOn)) / 86_400_000 + 1;
  return Math.min(16, Math.max(1, Math.ceil(days / 7)));
}

/** Week number of a date within a term (1-based), or null outside it. */
export function weekOf(term: { startsOn: string | null }, isoDate: string) {
  if (!term.startsOn) return null;
  const w = Math.floor((Date.parse(isoDate) - Date.parse(term.startsOn)) / (7 * 86_400_000)) + 1;
  return w >= 1 ? w : null;
}

/** Level + subject pairs this person plans for: what they teach, or every level subject for school-wide staff. */
async function plannable(tx: Tx, access: Access) {
  const pairs = await taughtPairs(tx, access);
  const all = await tx
    .select({ levelId: levelSubjects.levelId, levelName: classLevels.name, levelSort: classLevels.sort, subjectId: subjects.id, subjectName: subjects.name, subjectSort: subjects.sort })
    .from(levelSubjects)
    .innerJoin(classLevels, eq(classLevels.id, levelSubjects.levelId))
    .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
    .orderBy(asc(classLevels.sort), asc(subjects.sort), asc(subjects.name));
  if (pairs === "all") return all;
  return all.filter((r) => pairs.some((p) => p.levelId === r.levelId && p.subjectId === r.subjectId));
}

async function mayPlan(tx: Tx, access: Access, levelId: string, subjectId: string) {
  if (can(access, "teaching:review")) return true;
  if (!can(access, "teaching:lessons")) return false;
  return (await plannable(tx, access)).some((p) => p.levelId === levelId && p.subjectId === subjectId);
}

async function termFor(tx: Tx, termId?: string | null) {
  if (termId) {
    const [t] = await tx.select().from(terms).where(eq(terms.id, termId));
    if (!t) throw new AppError("That term wasn't found.", "not_found");
    return t;
  }
  const current = await getCurrentTerm(tx);
  if (!current) throw new AppError("Set a current term in Academics first.", "invalid");
  return current.term;
}

// ---------- Scheme of work ----------

export async function getScheme(db: DB, access: Access, input: { levelId?: string; subjectId?: string; termId?: string }) {
  requireLessons(access);
  return withTenant(db, access.school.id, async (tx) => {
    const term = await termFor(tx, input.termId);
    const options = await plannable(tx, access);
    const pick = options.find((o) => o.levelId === input.levelId && o.subjectId === input.subjectId) ?? options[0] ?? null;
    if (!pick) return { term, options, pick: null, weeks: [], editable: false };
    const [items, notes] = await Promise.all([
      tx
        .select()
        .from(schemeItems)
        .where(and(eq(schemeItems.termId, term.id), eq(schemeItems.levelId, pick.levelId), eq(schemeItems.subjectId, pick.subjectId))),
      tx
        .select({ week: lessonNotes.week, status: lessonNotes.status, id: lessonNotes.id })
        .from(lessonNotes)
        .where(and(eq(lessonNotes.termId, term.id), eq(lessonNotes.levelId, pick.levelId), eq(lessonNotes.subjectId, pick.subjectId))),
    ]);
    const n = Math.max(termWeeks(term), ...items.map((i) => i.week));
    return {
      term,
      options,
      pick,
      weeks: Array.from({ length: n }, (_, i) => ({
        week: i + 1,
        topic: items.find((x) => x.week === i + 1)?.topic ?? "",
        notes: notes.filter((x) => x.week === i + 1),
      })),
      editable: await mayPlan(tx, access, pick.levelId, pick.subjectId),
    };
  });
}

export const schemeSchema = z.object({
  termId: z.string().uuid(),
  levelId: z.string().uuid(),
  subjectId: z.string().uuid(),
  items: z.array(z.object({ week: z.number().int().min(1).max(20), topic: z.string().trim().max(300) })).max(20),
});

export async function saveScheme(db: DB, access: Access, input: z.infer<typeof schemeSchema>, ip?: string | null) {
  requireLessons(access);
  return withTenant(db, access.school.id, async (tx) => {
    if (!(await mayPlan(tx, access, input.levelId, input.subjectId))) throw new AppError("You can only plan the subjects you teach.", "forbidden");
    await termFor(tx, input.termId);
    await tx.delete(schemeItems).where(and(eq(schemeItems.termId, input.termId), eq(schemeItems.levelId, input.levelId), eq(schemeItems.subjectId, input.subjectId)));
    const rows = input.items.filter((i) => i.topic);
    if (rows.length) {
      await tx.insert(schemeItems).values(rows.map((i) => ({ schoolId: access.school.id, termId: input.termId, levelId: input.levelId, subjectId: input.subjectId, week: i.week, topic: i.topic })));
    }
    const [[level], [subject]] = await Promise.all([
      tx.select({ name: classLevels.name }).from(classLevels).where(eq(classLevels.id, input.levelId)),
      tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, input.subjectId)),
    ]);
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "scheme.saved", summary: `Saved the ${subject?.name} scheme of work for ${level?.name}` });
    return { weeks: rows.length };
  });
}

// ---------- Lesson notes ----------

export async function listLessonNotes(
  db: DB,
  access: Access,
  filter: { view?: "mine" | "review" | "all"; status?: string; levelId?: string; subjectId?: string; week?: number; page?: number } = {},
) {
  requireLessons(access);
  return withTenant(db, access.school.id, async (tx) => {
    const term = await termFor(tx);
    const reviewer = can(access, "teaching:review");
    const view = filter.view === "review" && reviewer ? "review" : filter.view === "all" && reviewer ? "all" : "mine";
    const scope: SQL[] = [eq(lessonNotes.termId, term.id)];
    if (view === "mine") scope.push(eq(lessonNotes.authorId, access.membershipId));
    else scope.push(inArray(lessonNotes.status, view === "review" ? ["submitted"] : ["submitted", "approved", "returned"]));
    const where = [...scope];
    if (filter.status && view !== "review") where.push(eq(lessonNotes.status, filter.status as NoteStatus));
    if (filter.levelId) where.push(eq(lessonNotes.levelId, filter.levelId));
    if (filter.subjectId) where.push(eq(lessonNotes.subjectId, filter.subjectId));
    if (filter.week) where.push(eq(lessonNotes.week, filter.week));
    const page = Math.max(1, filter.page ?? 1);

    const [[{ total }], rows, [mine], [queue], options] = await Promise.all([
      tx.select({ total: count() }).from(lessonNotes).where(and(...where)),
      tx
        .select({ n: lessonNotes, levelName: classLevels.name, subjectName: subjects.name, author: users.name })
        .from(lessonNotes)
        .innerJoin(classLevels, eq(classLevels.id, lessonNotes.levelId))
        .innerJoin(subjects, eq(subjects.id, lessonNotes.subjectId))
        .leftJoin(memberships, eq(memberships.id, lessonNotes.authorId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(...where))
        .orderBy(view === "review" ? asc(lessonNotes.submittedAt) : desc(lessonNotes.updatedAt))
        .limit(NOTE_PAGE_SIZE)
        .offset((page - 1) * NOTE_PAGE_SIZE),
      tx
        .select({
          drafts: sql<number>`count(*) filter (where ${lessonNotes.status} = 'draft')`.mapWith(Number),
          submitted: sql<number>`count(*) filter (where ${lessonNotes.status} = 'submitted')`.mapWith(Number),
          approved: sql<number>`count(*) filter (where ${lessonNotes.status} = 'approved')`.mapWith(Number),
          returned: sql<number>`count(*) filter (where ${lessonNotes.status} = 'returned')`.mapWith(Number),
        })
        .from(lessonNotes)
        .where(and(eq(lessonNotes.termId, term.id), eq(lessonNotes.authorId, access.membershipId))),
      tx
        .select({
          waiting: sql<number>`count(*) filter (where ${lessonNotes.status} = 'submitted')`.mapWith(Number),
          approved: sql<number>`count(*) filter (where ${lessonNotes.status} = 'approved')`.mapWith(Number),
          returned: sql<number>`count(*) filter (where ${lessonNotes.status} = 'returned')`.mapWith(Number),
          authors: sql<number>`count(distinct ${lessonNotes.authorId}) filter (where ${lessonNotes.status} <> 'draft')`.mapWith(Number),
        })
        .from(lessonNotes)
        .where(eq(lessonNotes.termId, term.id)),
      plannable(tx, access),
    ]);
    return {
      term,
      view,
      reviewer,
      rows,
      total,
      mine,
      queue: reviewer ? queue : null,
      currentWeek: weekOf(term, new Date().toISOString().slice(0, 10)),
      weeks: termWeeks(term),
      options,
      levels: [...new Map(options.map((o) => [o.levelId, { id: o.levelId, name: o.levelName }])).values()],
      subjects: [...new Map(options.map((o) => [o.subjectId, { id: o.subjectId, name: o.subjectName }])).values()],
    };
  });
}

export async function getLessonNote(db: DB, access: Access, id: string) {
  requireLessons(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ n: lessonNotes, levelName: classLevels.name, subjectName: subjects.name, author: users.name })
      .from(lessonNotes)
      .innerJoin(classLevels, eq(classLevels.id, lessonNotes.levelId))
      .innerJoin(subjects, eq(subjects.id, lessonNotes.subjectId))
      .leftJoin(memberships, eq(memberships.id, lessonNotes.authorId))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(eq(lessonNotes.id, id));
    if (!row) throw new AppError("That lesson note wasn't found.", "not_found");
    const mine = row.n.authorId === access.membershipId;
    const reviewer = can(access, "teaching:review");
    if (!mine && !(reviewer && row.n.status !== "draft")) throw new AppError("That lesson note wasn't found.", "not_found");
    const [reviewerRow] = row.n.reviewedBy
      ? await tx.select({ name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, row.n.reviewedBy))
      : [];
    const [planned] = await tx
      .select({ topic: schemeItems.topic })
      .from(schemeItems)
      .where(and(eq(schemeItems.termId, row.n.termId), eq(schemeItems.levelId, row.n.levelId), eq(schemeItems.subjectId, row.n.subjectId), eq(schemeItems.week, row.n.week)));
    return {
      ...row,
      reviewerName: reviewerRow?.name ?? null,
      plannedTopic: planned?.topic ?? null,
      files: (await filesFor(tx, "lesson_note", [id])).get(id) ?? [],
      canEdit: mine && (row.n.status === "draft" || row.n.status === "returned"),
      canWithdraw: mine && row.n.status === "submitted",
      canReview: reviewer && row.n.status === "submitted",
    };
  });
}

/** The planned topic for a week, to prefill a new note. */
export async function plannedTopic(db: DB, access: Access, input: { levelId: string; subjectId: string; week: number }) {
  return withTenant(db, access.school.id, async (tx) => {
    const term = await termFor(tx);
    const [row] = await tx
      .select({ topic: schemeItems.topic })
      .from(schemeItems)
      .where(and(eq(schemeItems.termId, term.id), eq(schemeItems.levelId, input.levelId), eq(schemeItems.subjectId, input.subjectId), eq(schemeItems.week, input.week)));
    return row?.topic ?? null;
  });
}

export const noteSchema = z.object({
  id: z.string().uuid().optional(),
  levelId: z.string().uuid("Choose a class level."),
  subjectId: z.string().uuid("Choose a subject."),
  week: z.coerce.number().int("Choose a week.").min(1, "Choose a week.").max(20),
  topic: z.string().trim().min(2, "What's the topic?").max(300),
  objectives: z.string().trim().max(5000).default(""),
  content: z.string().trim().max(50000).default(""),
  submit: z.boolean().default(false),
  fileIds: z.array(z.string().uuid()).max(5).default([]),
  removeFileIds: z.array(z.string().uuid()).default([]),
});
export type NoteInput = z.infer<typeof noteSchema>;

export async function saveLessonNote(db: DB, access: Access, input: NoteInput, ip?: string | null) {
  requireLessons(access);
  if (!can(access, "teaching:lessons")) throw new AppError("You don't have permission to write lesson notes.", "forbidden");
  return withTenant(db, access.school.id, async (tx) => {
    if (!(await mayPlan(tx, access, input.levelId, input.subjectId))) throw new AppError("You can only write notes for the subjects you teach.", "forbidden");
    const term = await termFor(tx);
    if (input.submit && !input.content && input.fileIds.length === 0) {
      const kept = input.id ? ((await filesFor(tx, "lesson_note", [input.id])).get(input.id) ?? []).filter((f) => !input.removeFileIds.includes(f.id)).length : 0;
      if (!kept) throw new AppError("Write the note or attach it before sending it for approval.", "invalid");
    }
    const status: NoteStatus = input.submit ? "submitted" : "draft";
    const values = {
      levelId: input.levelId,
      subjectId: input.subjectId,
      week: input.week,
      topic: input.topic,
      objectives: input.objectives,
      content: input.content,
      status,
      submittedAt: input.submit ? new Date() : null,
      updatedAt: new Date(),
    };
    let note: typeof lessonNotes.$inferSelect;
    if (input.id) {
      const [existing] = await tx.select().from(lessonNotes).where(eq(lessonNotes.id, input.id));
      if (!existing || existing.authorId !== access.membershipId) throw new AppError("That lesson note wasn't found.", "not_found");
      if (existing.status === "approved") throw new AppError("This note has been approved and can't be changed.", "conflict");
      if (existing.status === "submitted") throw new AppError("This note is waiting for approval. Withdraw it to make changes.", "conflict");
      [note] = await tx.update(lessonNotes).set(values).where(eq(lessonNotes.id, input.id)).returning();
      if (input.removeFileIds.length) await removeFiles(tx, { ownerType: "lesson_note", ownerId: note.id, ids: input.removeFileIds });
    } else {
      [note] = await tx.insert(lessonNotes).values({ ...values, schoolId: access.school.id, termId: term.id, authorId: access.membershipId }).returning();
    }
    await claimUploads(tx, { userId: access.user.id, ownerType: "lesson_note", ownerId: note.id, fileIds: input.fileIds });
    if (input.submit) {
      await recordAudit(tx, access.school.id, actor(access, ip), { action: "lesson_note.submitted", summary: `Sent week ${note.week} note "${note.topic}" for approval`, entityType: "lesson_note", entityId: note.id });
    }
    return note;
  });
}

export async function withdrawLessonNote(db: DB, access: Access, id: string) {
  await withTenant(db, access.school.id, async (tx) => {
    const [n] = await tx.select().from(lessonNotes).where(eq(lessonNotes.id, id));
    if (!n || n.authorId !== access.membershipId) throw new AppError("That lesson note wasn't found.", "not_found");
    if (n.status !== "submitted") throw new AppError("Only notes waiting for approval can be withdrawn.", "conflict");
    await tx.update(lessonNotes).set({ status: "draft", submittedAt: null, updatedAt: new Date() }).where(eq(lessonNotes.id, id));
  });
}

export async function deleteLessonNote(db: DB, access: Access, id: string) {
  await withTenant(db, access.school.id, async (tx) => {
    const [n] = await tx.select().from(lessonNotes).where(eq(lessonNotes.id, id));
    if (!n || n.authorId !== access.membershipId) throw new AppError("That lesson note wasn't found.", "not_found");
    if (n.status === "approved" || n.status === "submitted") throw new AppError("Only drafts and returned notes can be deleted.", "conflict");
    await removeFiles(tx, { ownerType: "lesson_note", ownerId: id });
    await tx.delete(lessonNotes).where(eq(lessonNotes.id, id));
  });
}

export const reviewSchema = z
  .object({ id: z.string().uuid(), decision: z.enum(["approved", "returned"]), comment: z.string().trim().max(2000).default("") })
  .refine((v) => v.decision === "approved" || v.comment.length > 0, { path: ["comment"], message: "Tell the teacher what to change." });

export async function reviewLessonNote(db: DB, access: Access, input: z.infer<typeof reviewSchema>, ip?: string | null) {
  if (!can(access, "teaching:review")) throw new AppError("Only the principal or head of department approves lesson notes.", "forbidden");
  return withTenant(db, access.school.id, async (tx) => {
    const [n] = await tx.select().from(lessonNotes).where(eq(lessonNotes.id, input.id));
    if (!n) throw new AppError("That lesson note wasn't found.", "not_found");
    if (n.status !== "submitted") throw new AppError("This note isn't waiting for approval any more.", "conflict");
    if (n.authorId === access.membershipId && access.roles.every((r) => r.key !== "owner" && r.key !== "principal")) {
      throw new AppError("Someone else has to approve your own notes.", "forbidden");
    }
    await tx
      .update(lessonNotes)
      .set({ status: input.decision, reviewComment: input.comment || null, reviewedBy: access.membershipId, reviewedAt: new Date() })
      .where(eq(lessonNotes.id, input.id));
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: `lesson_note.${input.decision}`,
      summary: `${input.decision === "approved" ? "Approved" : "Returned"} week ${n.week} note "${n.topic}"`,
      entityType: "lesson_note",
      entityId: n.id,
    });
  });
}

/** Notes waiting for this reviewer, for the sidebar badge. */
export async function notesAwaitingReview(tx: Tx) {
  const [{ n }] = await tx.select({ n: count() }).from(lessonNotes).where(eq(lessonNotes.status, "submitted"));
  return n;
}
