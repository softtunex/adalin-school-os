import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { assignments, assignmentSubmissions, classes, files, lessonNotes, materials, schools } from "../db/schema";
import { withTenant } from "../db/tenant";
import { deleteStored, docExt, DOC_TYPES, inspectStored, MAX_FILE_BYTES, MAX_FILES, newStorageKey, sniffMatches, storageConfigured, uploadUrl } from "../documents";
import { AppError } from "../errors";
import { can, loadAccess } from "./access";
import { myChildren } from "./parent-portal";
import { myStudentRecord } from "./student-portal";
import { studentSubjectIds, teaches } from "./teaching";

export type FileOwner = (typeof files.$inferSelect)["ownerType"];
export type FileInfo = { id: string; name: string; size: number; mime: string };

/**
 * Step one of an upload: records a pending file (no owner yet) and returns where the browser
 * sends the bytes. Callers have already checked the uploader belongs to the school.
 */
export async function createUpload(db: DB, input: { schoolId: string; userId: string; ownerType: FileOwner; name: string; size: number }) {
  const name = input.name.trim().slice(0, 180) || "file";
  const ext = docExt(name);
  if (!ext) throw new AppError("That file type isn't allowed. Upload a PDF, Word, Excel, PowerPoint, image or text file.", "invalid");
  if (!Number.isFinite(input.size) || input.size <= 0) throw new AppError(`${name} is empty.`, "invalid");
  if (input.size > MAX_FILE_BYTES) throw new AppError(`${name} is too big. Files must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller.`, "invalid");
  if (!storageConfigured()) throw new AppError("File uploads aren't switched on yet.", "invalid");
  const mime = DOC_TYPES[ext].mime;
  const storageKey = newStorageKey(input.schoolId, ext);
  const [row] = await withTenant(db, input.schoolId, (tx) =>
    tx.insert(files).values({ schoolId: input.schoolId, name, mime, size: input.size, storageKey, ownerType: input.ownerType, ownerId: null, uploadedBy: input.userId }).returning(),
  );
  return { fileId: row.id, ...(await uploadUrl(row.id, storageKey, mime)) };
}

/**
 * Step two: attaches finished uploads to what they belong to. Only the uploader can claim a
 * file, only once, and only after the stored bytes check out.
 */
export async function claimUploads(tx: Tx, input: { userId: string; ownerType: FileOwner; ownerId: string; fileIds: string[] }) {
  const ids = [...new Set(input.fileIds.filter(Boolean))];
  if (ids.length === 0) return [];
  if (ids.length > MAX_FILES) throw new AppError(`Attach up to ${MAX_FILES} files.`, "invalid");
  const rows = await tx
    .select()
    .from(files)
    .where(and(inArray(files.id, ids), eq(files.uploadedBy, input.userId), eq(files.ownerType, input.ownerType), isNull(files.ownerId)));
  if (rows.length !== ids.length) throw new AppError("One of the files didn't finish uploading. Remove it and try again.", "invalid");
  for (const f of rows) {
    const stored = await inspectStored(f.storageKey);
    if (!stored) throw new AppError(`${f.name} didn't finish uploading. Remove it and try again.`, "invalid");
    if (stored.size > MAX_FILE_BYTES) throw new AppError(`${f.name} is too big.`, "invalid");
    const ext = docExt(f.name);
    if (!ext || !sniffMatches(ext, stored.head)) throw new AppError(`${f.name} doesn't look like a real .${ext ?? "?"} file.`, "invalid");
    await tx.update(files).set({ ownerId: input.ownerId, size: stored.size }).where(eq(files.id, f.id));
  }
  return rows.map((f) => f.id);
}

export async function filesFor(tx: Tx, ownerType: FileOwner, ownerIds: string[]): Promise<Map<string, FileInfo[]>> {
  const out = new Map<string, FileInfo[]>();
  if (ownerIds.length === 0) return out;
  const rows = await tx
    .select({ id: files.id, name: files.name, size: files.size, mime: files.mime, ownerId: files.ownerId })
    .from(files)
    .where(and(eq(files.ownerType, ownerType), inArray(files.ownerId, ownerIds)))
    .orderBy(asc(files.createdAt));
  for (const r of rows) out.set(r.ownerId!, [...(out.get(r.ownerId!) ?? []), { id: r.id, name: r.name, size: r.size, mime: r.mime }]);
  return out;
}

/** Removes attachments from storage and the database. Callers authorise first. */
export async function removeFiles(tx: Tx, where: { ownerType: FileOwner; ownerId: string; ids?: string[] }) {
  const rows = await tx
    .delete(files)
    .where(and(eq(files.ownerType, where.ownerType), eq(files.ownerId, where.ownerId), where.ids ? inArray(files.id, where.ids.length ? where.ids : ["00000000-0000-0000-0000-000000000000"]) : undefined))
    .returning({ key: files.storageKey });
  await Promise.all(rows.map((r) => deleteStored(r.key)));
  return rows.length;
}

/** A pending upload the signed-in user may write bytes to (the local stand-in for R2). */
export async function pendingUploadFor(db: DB, userId: string, fileId: string) {
  const [f] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.uploadedBy, userId), isNull(files.ownerId)));
  return f ?? null;
}

/**
 * Whether this user may download a file. Read as the owner role, then checked against the
 * user's own staff access, student record or children.
 */
export async function fileForUser(db: DB, userId: string, fileId: string) {
  const [f] = await db.select().from(files).where(eq(files.id, fileId));
  if (!f || !f.ownerId) return null;
  const [school] = await db.select({ slug: schools.slug }).from(schools).where(eq(schools.id, f.schoolId));
  if (!school) return null;
  const access = await loadAccess(db, userId, school.slug);
  const staff = access?.isStaff ? access : null;

  if (f.ownerType === "assignment" || f.ownerType === "submission") {
    const [row] =
      f.ownerType === "assignment"
        ? await db.select({ a: assignments, studentId: assignments.id }).from(assignments).where(eq(assignments.id, f.ownerId))
        : await db
            .select({ a: assignments, studentId: assignmentSubmissions.studentId })
            .from(assignmentSubmissions)
            .innerJoin(assignments, eq(assignments.id, assignmentSubmissions.assignmentId))
            .where(eq(assignmentSubmissions.id, f.ownerId));
    if (!row) return null;
    const a = row.a;
    if (staff) {
      if (f.ownerType === "assignment") return f;
      if (await withTenant(db, f.schoolId, (tx) => teaches(tx, staff, a.classId, a.subjectId))) return f;
    }
    const me = await myStudentRecord(db, userId);
    if (me && me.schoolId === f.schoolId) {
      if (f.ownerType === "assignment" ? me.classId === a.classId && a.status !== "draft" : me.studentId === row.studentId) return f;
    }
    const children = (await myChildren(db, userId)).filter((c) => c.schoolId === f.schoolId);
    if (f.ownerType === "assignment" ? children.some((c) => c.classId === a.classId) && a.status !== "draft" : children.some((c) => c.studentId === row.studentId)) return f;
    return null;
  }

  if (f.ownerType === "material") {
    const [m] = await db.select().from(materials).where(eq(materials.id, f.ownerId));
    if (!m) return null;
    if (staff) return f;
    const sees = async (studentId: string, levelId: string | null) =>
      !!levelId && m.levelId === levelId && (!m.subjectId || (await withTenant(db, f.schoolId, (tx) => studentSubjectIds(tx, studentId, levelId))).has(m.subjectId));
    const me = await myStudentRecord(db, userId);
    if (me && me.schoolId === f.schoolId && (await sees(me.studentId, me.levelId))) return f;
    for (const c of (await myChildren(db, userId)).filter((c) => c.schoolId === f.schoolId && c.classId)) {
      const [cls] = await db.select({ levelId: classes.levelId }).from(classes).where(eq(classes.id, c.classId!));
      if (await sees(c.studentId, cls?.levelId ?? null)) return f;
    }
    return null;
  }

  if (f.ownerType === "lesson_note") {
    if (!staff) return null;
    const [note] = await db.select().from(lessonNotes).where(eq(lessonNotes.id, f.ownerId));
    if (!note) return null;
    return note.authorId === staff.membershipId || can(staff, "teaching:review") ? f : null;
  }
  return null;
}
