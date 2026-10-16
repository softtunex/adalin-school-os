import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { classLevels, levelSubjects, materials, memberships, subjects, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, type Access } from "./access";
import { recordAudit } from "./audit";
import { claimUploads, filesFor, removeFiles } from "./files";
import { requireStudent } from "./student-portal";
import { studentSubjectIds, taughtPairs } from "./teaching";

export const MATERIAL_PAGE_SIZE = 20;

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireLms(access: Access) {
  if (!hasFeature(access.plan, "lms")) throw new AppError("Learning materials are on the Premium plan.", "upgrade");
  if (!can(access, "teaching:lessons")) throw new AppError("You don't have permission to do that.", "forbidden");
}

/** A YouTube video id from a link, for an inline player. */
export function youtubeId(url: string | null) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Level + subject pairs this person can post for: what they teach, or every level subject. */
async function postable(tx: Tx, access: Access) {
  const pairs = await taughtPairs(tx, access);
  const all = await tx
    .select({ levelId: levelSubjects.levelId, levelName: classLevels.name, subjectId: subjects.id, subjectName: subjects.name })
    .from(levelSubjects)
    .innerJoin(classLevels, eq(classLevels.id, levelSubjects.levelId))
    .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
    .orderBy(asc(classLevels.sort), asc(subjects.sort), asc(subjects.name));
  return pairs === "all" ? { all: true, options: all } : { all: false, options: all.filter((r) => pairs.some((p) => p.levelId === r.levelId && p.subjectId === r.subjectId)) };
}

export const materialSchema = z
  .object({
    id: z.string().uuid().optional(),
    levelId: z.string().uuid("Choose a class level."),
    subjectId: z.string().uuid("Choose a subject."),
    title: z.string().trim().min(2, "Give it a title.").max(150),
    description: z.string().trim().max(1000).default(""),
    kind: z.enum(["file", "link", "note"]),
    url: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => v || null),
    body: z
      .string()
      .trim()
      .max(50000)
      .optional()
      .transform((v) => v || null),
    fileIds: z.array(z.string().uuid()).max(5).default([]),
    removeFileIds: z.array(z.string().uuid()).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "link") {
      if (!v.url) ctx.addIssue({ code: "custom", path: ["url"], message: "Paste the link." });
      else if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(v.url)) ctx.addIssue({ code: "custom", path: ["url"], message: "Use a full link starting with https://" });
    }
    if (v.kind === "note" && !v.body) ctx.addIssue({ code: "custom", path: ["body"], message: "Write the note." });
  });
export type MaterialInput = z.infer<typeof materialSchema>;

async function requirePair(tx: Tx, access: Access, levelId: string, subjectId: string) {
  const p = await postable(tx, access);
  if (!p.options.some((o) => o.levelId === levelId && o.subjectId === subjectId)) throw new AppError("You can only share materials for the subjects you teach.", "forbidden");
}

export async function saveMaterial(db: DB, access: Access, input: MaterialInput, ip?: string | null) {
  requireLms(access);
  return withTenant(db, access.school.id, async (tx) => {
    await requirePair(tx, access, input.levelId, input.subjectId);
    const values = {
      levelId: input.levelId,
      subjectId: input.subjectId,
      title: input.title,
      description: input.description,
      kind: input.kind,
      url: input.kind === "link" ? input.url : null,
      body: input.kind === "note" ? input.body : null,
    };
    let row: typeof materials.$inferSelect;
    if (input.id) {
      const [existing] = await tx.select().from(materials).where(eq(materials.id, input.id));
      if (!existing) throw new AppError("That material wasn't found.", "not_found");
      if (existing.levelId && existing.subjectId) await requirePair(tx, access, existing.levelId, existing.subjectId);
      [row] = await tx.update(materials).set(values).where(eq(materials.id, input.id)).returning();
      if (input.kind !== "file") await removeFiles(tx, { ownerType: "material", ownerId: row.id });
      else if (input.removeFileIds.length) await removeFiles(tx, { ownerType: "material", ownerId: row.id, ids: input.removeFileIds });
    } else {
      [row] = await tx.insert(materials).values({ ...values, schoolId: access.school.id, createdBy: access.membershipId }).returning();
    }
    if (input.kind === "file") {
      await claimUploads(tx, { userId: access.user.id, ownerType: "material", ownerId: row.id, fileIds: input.fileIds });
      const kept = (await filesFor(tx, "material", [row.id])).get(row.id) ?? [];
      if (kept.length === 0) throw new AppError("Attach at least one file.", "invalid");
    }
    if (!input.id) await recordAudit(tx, access.school.id, actor(access, ip), { action: "material.created", summary: `Shared "${row.title}"`, entityType: "material", entityId: row.id });
    return row;
  });
}

export async function deleteMaterial(db: DB, access: Access, id: string, ip?: string | null) {
  requireLms(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [m] = await tx.select().from(materials).where(eq(materials.id, id));
    if (!m) throw new AppError("That material wasn't found.", "not_found");
    if (m.levelId && m.subjectId) await requirePair(tx, access, m.levelId, m.subjectId);
    await removeFiles(tx, { ownerType: "material", ownerId: id });
    await tx.delete(materials).where(eq(materials.id, id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "material.deleted", summary: `Removed "${m.title}"`, entityType: "material", entityId: id });
  });
}

export async function listMaterials(db: DB, access: Access, filter: { levelId?: string; subjectId?: string; kind?: string; q?: string; page?: number } = {}) {
  requireLms(access);
  return withTenant(db, access.school.id, async (tx) => {
    const p = await postable(tx, access);
    const scope: SQL[] = [];
    if (!p.all) {
      scope.push(p.options.length ? or(...p.options.map((o) => and(eq(materials.levelId, o.levelId), eq(materials.subjectId, o.subjectId))))! : sql`false`);
    }
    const where = [...scope];
    if (filter.levelId) where.push(eq(materials.levelId, filter.levelId));
    if (filter.subjectId) where.push(eq(materials.subjectId, filter.subjectId));
    if (filter.kind === "file" || filter.kind === "link" || filter.kind === "note") where.push(eq(materials.kind, filter.kind));
    if (filter.q) where.push(or(ilike(materials.title, `%${filter.q}%`), ilike(materials.description, `%${filter.q}%`))!);
    const page = Math.max(1, filter.page ?? 1);
    const [[{ total }], rows, [stats]] = await Promise.all([
      tx.select({ total: count() }).from(materials).where(and(...where)),
      tx
        .select({ m: materials, levelName: classLevels.name, subjectName: subjects.name, author: users.name })
        .from(materials)
        .leftJoin(classLevels, eq(classLevels.id, materials.levelId))
        .leftJoin(subjects, eq(subjects.id, materials.subjectId))
        .leftJoin(memberships, eq(memberships.id, materials.createdBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(...where))
        .orderBy(desc(materials.createdAt))
        .limit(MATERIAL_PAGE_SIZE)
        .offset((page - 1) * MATERIAL_PAGE_SIZE),
      tx
        .select({
          total: count(),
          files: sql<number>`count(*) filter (where ${materials.kind} = 'file')`.mapWith(Number),
          links: sql<number>`count(*) filter (where ${materials.kind} = 'link')`.mapWith(Number),
          notes: sql<number>`count(*) filter (where ${materials.kind} = 'note')`.mapWith(Number),
          thisWeek: sql<number>`count(*) filter (where ${materials.createdAt} > now() - interval '7 days')`.mapWith(Number),
        })
        .from(materials)
        .where(and(...scope)),
    ]);
    const files = await filesFor(tx, "material", rows.map((r) => r.m.id));
    return {
      rows: rows.map((r) => ({ ...r, files: files.get(r.m.id) ?? [], youtube: youtubeId(r.m.url) })),
      total,
      stats,
      options: p.options,
      levels: [...new Map(p.options.map((o) => [o.levelId, { id: o.levelId, name: o.levelName }])).values()],
      subjects: [...new Map(p.options.map((o) => [o.subjectId, { id: o.subjectId, name: o.subjectName }])).values()],
    };
  });
}

// ---------- Students ----------

function studentWhere(levelId: string, subjectIds: string[]) {
  return and(eq(materials.levelId, levelId), or(isNull(materials.subjectId), subjectIds.length ? inArray(materials.subjectId, subjectIds) : sql`false`))!;
}

/** Materials for the student's level and the subjects they take, grouped by subject. */
export async function getStudentMaterials(db: DB, userId: string) {
  const me = await requireStudent(db, userId);
  if (!me.school.features.includes("lms") || !me.levelId) return { me, groups: [] };
  const levelId = me.levelId;
  return withTenant(db, me.schoolId, async (tx) => {
    const taken = [...(await studentSubjectIds(tx, me.studentId, levelId))];
    const rows = await tx
      .select({ m: materials, subjectName: subjects.name, subjectSort: subjects.sort })
      .from(materials)
      .leftJoin(subjects, eq(subjects.id, materials.subjectId))
      .where(studentWhere(levelId, taken))
      .orderBy(asc(subjects.sort), asc(subjects.name), desc(materials.createdAt));
    const files = await filesFor(tx, "material", rows.map((r) => r.m.id));
    const groups: { subject: string; items: { m: typeof materials.$inferSelect; files: { id: string; name: string; size: number; mime: string }[]; youtube: string | null }[] }[] = [];
    for (const r of rows) {
      const name = r.subjectName ?? "General";
      let g = groups.find((x) => x.subject === name);
      if (!g) groups.push((g = { subject: name, items: [] }));
      g.items.push({ m: r.m, files: files.get(r.m.id) ?? [], youtube: youtubeId(r.m.url) });
    }
    return { me, groups };
  });
}

export async function getStudentMaterial(db: DB, userId: string, id: string) {
  const me = await requireStudent(db, userId);
  if (!me.school.features.includes("lms") || !me.levelId) throw new AppError("That material wasn't found.", "not_found");
  const levelId = me.levelId;
  return withTenant(db, me.schoolId, async (tx) => {
    const taken = [...(await studentSubjectIds(tx, me.studentId, levelId))];
    const [row] = await tx
      .select({ m: materials, subjectName: subjects.name, author: users.name })
      .from(materials)
      .leftJoin(subjects, eq(subjects.id, materials.subjectId))
      .leftJoin(memberships, eq(memberships.id, materials.createdBy))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(materials.id, id), studentWhere(levelId, taken)));
    if (!row) throw new AppError("That material wasn't found.", "not_found");
    return { ...row, files: (await filesFor(tx, "material", [id])).get(id) ?? [], youtube: youtubeId(row.m.url) };
  });
}

