import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import {
  classes,
  classResults,
  DOCUMENT_KINDS,
  documentTemplates,
  guardians,
  issuedDocuments,
  memberships,
  schools,
  scores,
  studentGuardians,
  students,
  terms,
  TEMPLATE_KINDS,
  users,
  type DocumentSettings,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { getCurrentTerm } from "./academics";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { buildClassResults, resolveTerm } from "./results";

/*
 * Documents the school issues: ID cards, testimonials, certificates, transcripts and letters.
 * Each one is recorded with a serial number and a secret code. The QR code on the paper opens
 * a public page that says whether the document is genuine, so a forged testimonial fails.
 */

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export const KIND_LABEL: Record<DocumentKind, string> = { id_card: "ID card", testimonial: "Testimonial", certificate: "Certificate", transcript: "Transcript", letter: "Letter" };
const SERIAL_CODE: Record<DocumentKind, string> = { id_card: "ID", testimonial: "TES", certificate: "CRT", transcript: "TRN", letter: "LTR" };
export const DOC_PAGE_SIZE = 30;

export const DEFAULT_DOCUMENTS: Required<DocumentSettings> = { signatoryName: "", signatoryTitle: "Principal", cardNote: "This card belongs to the school. If found, please return it to the school office." };

export function documentSettings(s: DocumentSettings): Required<DocumentSettings> {
  return { ...DEFAULT_DOCUMENTS, ...s };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireDocuments(access: Access) {
  if (!hasFeature(access.plan, "documents")) throw new AppError("Documents are on the Premium plan.", "upgrade");
  requirePermission(access, "documents:issue");
}

const fullName = (s: { firstName: string; middleName?: string | null; lastName: string }) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");

// ---------- Settings ----------

export const documentSettingsSchema = z.object({
  signatoryName: z.string().trim().max(120),
  signatoryTitle: z.string().trim().min(2, "Give the signatory's title.").max(80),
  cardNote: z.string().trim().max(160),
});

export async function saveDocumentSettings(db: DB, access: Access, input: z.infer<typeof documentSettingsSchema>, ip?: string | null) {
  requireDocuments(access);
  await db.update(schools).set({ documentSettings: input }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, actor(access, ip), { action: "documents.settings", summary: `Documents signed by ${input.signatoryName || "the school"}, ${input.signatoryTitle}` }),
  );
}

// ---------- Templates ----------

/** Words a template can use. Filled in per student when the letter is printed. */
export const MERGE_FIELDS = [
  ["name", "Student's full name"],
  ["first_name", "Student's first name"],
  ["admission_no", "Admission number"],
  ["class", "Current class"],
  ["parent", "Parent or guardian's name"],
  ["school", "School name"],
  ["date", "Today's date"],
  ["session", "Current session"],
  ["term", "Current term"],
] as const;

export type MergeData = Partial<Record<(typeof MERGE_FIELDS)[number][0], string>>;

export function fillTemplate(text: string, data: MergeData) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => data[k as keyof MergeData] ?? m);
}

export function unknownFields(text: string) {
  const known = new Set<string>(MERGE_FIELDS.map(([k]) => k));
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !known.has(k)))];
}

export const BUILT_IN_TEMPLATES: { kind: TemplateKind; name: string; title: string; body: string }[] = [
  {
    kind: "letter",
    name: "Resumption notice",
    title: "Resumption for {{term}}",
    body: "Dear {{parent}},\n\nWe write to remind you that school resumes for the {{term}} of the {{session}} session. {{first_name}} ({{class}}) should arrive in full uniform by 7:30am on the first day, with all books and materials for the term.\n\nPlease make sure the term's fees are settled before resumption. Thank you for your continued support.",
  },
  {
    kind: "letter",
    name: "Invitation to a meeting",
    title: "Invitation to meet about {{first_name}}",
    body: "Dear {{parent}},\n\nWe would like to meet with you to discuss {{name}}'s progress in {{class}}. Please call the school office to agree a time that suits you this week.\n\nWe look forward to seeing you.",
  },
  {
    kind: "certificate",
    name: "Award of excellence",
    title: "Certificate of Excellence",
    body: "This is to certify that {{name}} of {{class}} is awarded this certificate for outstanding performance in the {{term}} of the {{session}} session.",
  },
  {
    kind: "certificate",
    name: "Certificate of completion",
    title: "Certificate of Completion",
    body: "This is to certify that {{name}} ({{admission_no}}) has completed their studies at {{school}} and conducted themselves well throughout.",
  },
];

export const templateSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(TEMPLATE_KINDS),
    name: z.string().trim().min(2, "Name the template.").max(80),
    title: z.string().trim().min(2, "Give it a heading.").max(120),
    body: z.string().trim().min(10, "Write the wording.").max(6000),
  })
  .superRefine((v, ctx) => {
    const bad = unknownFields(`${v.title} ${v.body}`);
    if (bad.length) ctx.addIssue({ code: "custom", path: ["body"], message: `These fields don't exist: ${bad.map((b) => `{{${b}}}`).join(", ")}.` });
  });

export async function listTemplates(db: DB, access: Access) {
  requireDocuments(access);
  return withTenant(db, access.school.id, async (tx) => {
    let rows = await tx.select().from(documentTemplates).orderBy(asc(documentTemplates.kind), asc(documentTemplates.name));
    if (!rows.length) rows = await tx.insert(documentTemplates).values(BUILT_IN_TEMPLATES.map((t) => ({ ...t, schoolId: access.school.id }))).returning();
    return rows;
  });
}

export async function saveTemplate(db: DB, access: Access, input: z.infer<typeof templateSchema>, ip?: string | null) {
  requireDocuments(access);
  requirePermission(access, "documents:templates");
  return withTenant(db, access.school.id, async (tx) => {
    const { id, ...values } = input;
    const [row] = id
      ? await tx
          .update(documentTemplates)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(documentTemplates.id, id))
          .returning()
      : await tx
          .insert(documentTemplates)
          .values({ ...values, schoolId: access.school.id })
          .returning();
    if (!row) throw new AppError("That template wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "documents.template", summary: `${id ? "Edited" : "Added"} the "${row.name}" ${row.kind} template` });
    return row;
  });
}

export async function deleteTemplate(db: DB, access: Access, id: string, ip?: string | null) {
  requireDocuments(access);
  requirePermission(access, "documents:templates");
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.delete(documentTemplates).where(eq(documentTemplates.id, id)).returning();
    if (row) await recordAudit(tx, access.school.id, actor(access, ip), { action: "documents.template_removed", summary: `Removed the "${row.name}" template` });
  });
}

// ---------- Issuing ----------

async function nextSerials(tx: Tx, schoolCode: string, kind: DocumentKind, n: number) {
  const year = lagosToday().slice(0, 4);
  const prefix = `${schoolCode}-${SERIAL_CODE[kind]}-${year}-`;
  const [{ top }] = await tx
    .select({ top: sql<number>`coalesce(max(cast(substring(${issuedDocuments.serial} from ${prefix.length + 1}::int) as integer)), 0)`.mapWith(Number) })
    .from(issuedDocuments)
    .where(sql`${issuedDocuments.serial} like ${`${prefix}%`}`);
  return Array.from({ length: n }, (_, i) => `${prefix}${String(top + i + 1).padStart(5, "0")}`);
}

export function schoolCode(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "SCH").slice(0, 3)).slice(0, 4);
}

type Holder = { studentId?: string | null; membershipId?: string | null; holderName: string; title: string; data: Record<string, unknown> };

/** Records documents and returns them with their serial and verification code. */
async function issue(tx: Tx, access: Access, kind: DocumentKind, holders: Holder[], batch: string = randomUUID()) {
  if (!holders.length) return [];
  const serials = await nextSerials(tx, schoolCode(access.school.name), kind, holders.length);
  return tx
    .insert(issuedDocuments)
    .values(
      holders.map((h, i) => ({
        schoolId: access.school.id,
        kind,
        studentId: h.studentId ?? null,
        membershipId: h.membershipId ?? null,
        holderName: h.holderName,
        title: h.title,
        serial: serials[i],
        token: randomBytes(12).toString("base64url"),
        data: h.data,
        batch,
        issuedBy: access.membershipId,
      })),
    )
    .returning();
}

async function studentsFor(tx: Tx, studentIds: string[]) {
  if (!studentIds.length) throw new AppError("Choose at least one student.", "invalid");
  const rows = await tx
    .select({ s: students, className: classes.name })
    .from(students)
    .leftJoin(classes, eq(classes.id, students.classId))
    .where(inArray(students.id, studentIds))
    .orderBy(asc(classes.name), asc(students.lastName), asc(students.firstName));
  if (rows.length !== new Set(studentIds).size) throw new AppError("Some of those students weren't found.", "not_found");
  return rows;
}

const pickSchema = z.object({ studentIds: z.array(z.string().uuid()).max(500).default([]), classId: z.string().uuid().nullable().default(null) });

async function resolvePick(tx: Tx, pick: z.infer<typeof pickSchema>) {
  if (pick.classId) {
    const rows = await tx.select({ id: students.id }).from(students).where(and(eq(students.classId, pick.classId), eq(students.status, "active")));
    return rows.map((r) => r.id);
  }
  return pick.studentIds;
}

// ID cards

export const idCardSchema = pickSchema.extend({ staff: z.boolean().default(false), membershipIds: z.array(z.string().uuid()).max(300).default([]) });

/**
 * ID cards for students (by class or picked) or staff. A holder keeps the same card code for
 * the session, so reprinting a lost card doesn't make the old one fail: revoke it for that.
 */
export async function issueIdCards(db: DB, access: Access, input: z.infer<typeof idCardSchema>, ip?: string | null) {
  requireDocuments(access);
  return withTenant(db, access.school.id, async (tx) => {
    const current = await getCurrentTerm(tx);
    const session = current?.session.name ?? lagosToday().slice(0, 4);
    const existing = await tx
      .select()
      .from(issuedDocuments)
      .where(and(eq(issuedDocuments.kind, "id_card"), isNull(issuedDocuments.revokedAt), sql`${issuedDocuments.data}->>'session' = ${session}`));
    const holders: Holder[] = [];
    const cards: { doc?: typeof issuedDocuments.$inferSelect; holder: Holder & { photoUrl: string | null; lines: [string, string][] } }[] = [];
    if (input.staff) {
      if (!input.membershipIds.length) throw new AppError("Choose at least one member of staff.", "invalid");
      const staff = await tx
        .select({ id: memberships.id, name: users.name, title: memberships.jobTitle, role: sql<string | null>`(select r.name from membership_roles mr join roles r on r.id = mr.role_id where mr.membership_id = ${memberships.id} order by r.is_system desc limit 1)` })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(inArray(memberships.id, input.membershipIds), eq(memberships.status, "active")));
      for (const m of staff) {
        const h = { membershipId: m.id, holderName: m.name, title: `Staff ID card, ${session}`, data: { session, role: m.title ?? m.role ?? "Staff" }, photoUrl: null, lines: [["Role", m.title ?? m.role ?? "Staff"]] as [string, string][] };
        const doc = existing.find((e) => e.membershipId === m.id);
        if (!doc) holders.push(h);
        cards.push({ doc, holder: h });
      }
    } else {
      const ids = await resolvePick(tx, input);
      const rows = await studentsFor(tx, ids);
      for (const { s, className } of rows) {
        const h = {
          studentId: s.id,
          holderName: fullName(s),
          title: `Student ID card, ${session}`,
          data: { session, admissionNo: s.admissionNo, className, blood: [s.bloodGroup, s.genotype].filter(Boolean).join(" · ") || null },
          photoUrl: s.photoUrl,
          lines: [
            ["Adm. no", s.admissionNo],
            ["Class", className ?? "—"],
            ...(s.bloodGroup || s.genotype ? ([["Blood", [s.bloodGroup, s.genotype].filter(Boolean).join(" · ")]] as [string, string][]) : []),
          ] as [string, string][],
        };
        const doc = existing.find((e) => e.studentId === s.id);
        if (!doc) holders.push(h);
        cards.push({ doc, holder: h });
      }
    }
    const batch = randomUUID();
    const fresh = await issue(tx, access, "id_card", holders, batch);
    for (const c of cards) c.doc ??= fresh.find((f) => (c.holder.studentId ? f.studentId === c.holder.studentId : f.membershipId === c.holder.membershipId));
    // Reprinted cards keep their code; the batch just gathers this print run into one PDF.
    const reused = cards.filter((c) => c.doc && !fresh.includes(c.doc)).map((c) => c.doc!.id);
    if (reused.length) await tx.update(issuedDocuments).set({ batch }).where(inArray(issuedDocuments.id, reused));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "documents.id_cards", summary: `Printed ${cards.length} ${input.staff ? "staff" : "student"} ID card${cards.length === 1 ? "" : "s"} (${fresh.length} new)` });
    return { session, batch, cards: cards.map((c) => ({ ...c.holder, serial: c.doc!.serial, token: c.doc!.token })) };
  });
}

// Testimonials

export const CONDUCT_GRADES = ["Excellent", "Very good", "Good", "Fair"] as const;

export const testimonialSchema = z.object({
  studentId: z.string().uuid(),
  conduct: z.enum(CONDUCT_GRADES),
  yearsFrom: z.string().regex(/^\d{4}$/, "Year joined, e.g. 2020."),
  yearsTo: z.string().regex(/^\d{4}$/, "Year leaving, e.g. 2026."),
  lastClass: z.string().trim().min(1).max(60),
  offices: z.string().trim().max(300).default(""),
  activities: z.string().trim().max(300).default(""),
  remark: z.string().trim().min(10, "Write a sentence or two about them.").max(1200),
});

export async function issueTestimonial(db: DB, access: Access, input: z.infer<typeof testimonialSchema>, ip?: string | null) {
  requireDocuments(access);
  if (input.yearsTo < input.yearsFrom) throw new AppError("They can't leave before they joined.", "invalid");
  return withTenant(db, access.school.id, async (tx) => {
    const [{ s }] = await studentsFor(tx, [input.studentId]);
    const [doc] = await issue(tx, access, "testimonial", [{ studentId: s.id, holderName: fullName(s), title: `Testimonial, ${input.yearsFrom}–${input.yearsTo}`, data: { ...input, admissionNo: s.admissionNo, gender: s.gender, dateOfBirth: s.dateOfBirth } }]);
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "documents.testimonial", summary: `Issued a testimonial for ${fullName(s)} (${doc.serial})`, entityType: "student", entityId: s.id });
    return doc;
  });
}

// Certificates and letters from templates

export const fromTemplateSchema = pickSchema.extend({ templateId: z.string().uuid("Choose a template.") });

async function mergeFor(tx: Tx, schoolName: string, rows: Awaited<ReturnType<typeof studentsFor>>) {
  const current = await getCurrentTerm(tx);
  const parents = rows.length
    ? await tx
        .select({ studentId: studentGuardians.studentId, name: guardians.name })
        .from(studentGuardians)
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .where(inArray(studentGuardians.studentId, rows.map((r) => r.s.id)))
    : [];
  const date = new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
  return rows.map(({ s, className }) => ({
    s,
    data: {
      name: fullName(s),
      first_name: s.firstName,
      admission_no: s.admissionNo,
      class: className ?? "",
      parent: parents.find((p) => p.studentId === s.id)?.name ?? "Parent",
      school: schoolName,
      date,
      session: current?.session.name ?? "",
      term: current?.term.name ? (/term$/i.test(current.term.name) ? current.term.name.toLowerCase().replace(/^./, (c) => c.toUpperCase()) : `${current.term.name} term`) : "",
    } satisfies MergeData,
  }));
}

export async function issueFromTemplate(db: DB, access: Access, input: z.infer<typeof fromTemplateSchema>, ip?: string | null) {
  requireDocuments(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [tpl] = await tx.select().from(documentTemplates).where(eq(documentTemplates.id, input.templateId));
    if (!tpl) throw new AppError("That template wasn't found.", "not_found");
    const ids = await resolvePick(tx, input);
    const rows = await studentsFor(tx, ids);
    const merged = await mergeFor(tx, access.school.name, rows);
    const batch = randomUUID();
    const docs = await issue(
      tx,
      access,
      tpl.kind,
      merged.map((m) => {
        const title = fillTemplate(tpl.title, m.data);
        return { studentId: m.s.id, holderName: m.data.name, title, data: { template: tpl.name, heading: title, body: fillTemplate(tpl.body, m.data), parent: m.data.parent, className: m.data.class, admissionNo: m.data.admission_no } };
      }),
      batch,
    );
    await recordAudit(tx, access.school.id, actor(access, ip), { action: `documents.${tpl.kind}`, summary: `Issued "${tpl.name}" to ${docs.length} student${docs.length === 1 ? "" : "s"}` });
    return { kind: tpl.kind, docs, batch };
  });
}

// Transcripts

export const transcriptSchema = z.object({ studentId: z.string().uuid() });

/** Every published term's results for a student, subject by subject. */
export async function issueTranscript(db: DB, access: Access, input: z.infer<typeof transcriptSchema>, ip?: string | null) {
  requireDocuments(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [{ s, className }] = await studentsFor(tx, [input.studentId]);
    const termsTaken = await tx
      .selectDistinct({ termId: scores.termId, classId: scores.classId, start: terms.startsOn, number: terms.number })
      .from(scores)
      .innerJoin(classResults, and(eq(classResults.termId, scores.termId), eq(classResults.classId, scores.classId), eq(classResults.status, "published")))
      .innerJoin(terms, eq(terms.id, scores.termId))
      .where(eq(scores.studentId, s.id))
      .orderBy(asc(terms.startsOn), asc(terms.number));
    if (!termsTaken.length) throw new AppError(`${s.firstName} has no published results yet.`, "conflict");
    const blocks = [];
    for (const t of termsTaken) {
      const built = await buildClassResults(tx, access.school.id, t.classId, await resolveTerm(tx, t.termId));
      const me = built.students.find((x) => x.id === s.id);
      if (!me) continue;
      blocks.push({
        term: `${built.term.term.name} term, ${built.term.session.name}`,
        className: built.class.name,
        subjects: built.subjects.map((sub) => ({ name: sub.name, total: me.result.subjects[sub.id]?.total ?? null, grade: me.result.subjects[sub.id]?.grade ?? null })).filter((x) => x.total !== null),
        average: me.result.average,
        position: me.result.position,
        classSize: built.students.length,
      });
    }
    const [doc] = await issue(tx, access, "transcript", [{ studentId: s.id, holderName: fullName(s), title: `Academic transcript (${blocks.length} term${blocks.length === 1 ? "" : "s"})`, data: { admissionNo: s.admissionNo, className, blocks } }]);
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "documents.transcript", summary: `Issued a transcript for ${fullName(s)} (${doc.serial})`, entityType: "student", entityId: s.id });
    return doc;
  });
}

// ---------- Register ----------

export async function listIssued(db: DB, access: Access, filter: { q?: string; kind?: string; page?: number } = {}) {
  requireDocuments(access);
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [];
    if (filter.kind && (DOCUMENT_KINDS as readonly string[]).includes(filter.kind)) where.push(sql`${issuedDocuments.kind} = ${filter.kind}`);
    if (filter.q) where.push(or(ilike(issuedDocuments.holderName, `%${filter.q}%`), ilike(issuedDocuments.serial, `%${filter.q}%`), ilike(issuedDocuments.title, `%${filter.q}%`))!);
    const page = Math.max(1, filter.page ?? 1);
    const [[{ total }], rows, stats] = await Promise.all([
      tx.select({ total: count() }).from(issuedDocuments).where(and(...where)),
      tx
        .select({ d: issuedDocuments, by: users.name })
        .from(issuedDocuments)
        .leftJoin(memberships, eq(memberships.id, issuedDocuments.issuedBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(...where))
        .orderBy(desc(issuedDocuments.issuedAt))
        .limit(DOC_PAGE_SIZE)
        .offset((page - 1) * DOC_PAGE_SIZE),
      tx.select({ kind: issuedDocuments.kind, n: count() }).from(issuedDocuments).groupBy(issuedDocuments.kind),
    ]);
    const by = Object.fromEntries(stats.map((x) => [x.kind, x.n])) as Partial<Record<DocumentKind, number>>;
    return { rows, total, stats: by };
  });
}

export async function getIssued(db: DB, access: Access, id: string) {
  requireDocuments(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.select().from(issuedDocuments).where(eq(issuedDocuments.id, id));
    if (!row) throw new AppError("That document wasn't found.", "not_found");
    return row;
  });
}

export async function revokeDocument(db: DB, access: Access, input: { id: string; reason: string }, ip?: string | null) {
  requireDocuments(access);
  if (input.reason.trim().length < 3) throw new AppError("Say why it's being revoked.", "invalid");
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .update(issuedDocuments)
      .set({ revokedAt: new Date(), revokeReason: input.reason.trim() })
      .where(and(eq(issuedDocuments.id, input.id), isNull(issuedDocuments.revokedAt)))
      .returning();
    if (!row) throw new AppError("That document wasn't found or is already revoked.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "documents.revoked", summary: `Revoked ${KIND_LABEL[row.kind].toLowerCase()} ${row.serial} (${input.reason.trim()})` });
  });
}

/** Students and staff for the pickers. */
export async function documentPeople(db: DB, access: Access) {
  requireDocuments(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [kids, staff, classList] = await Promise.all([
      tx
        .select({ id: students.id, name: sql<string>`${students.firstName} || ' ' || ${students.lastName}`, admissionNo: students.admissionNo, className: classes.name, admittedOn: students.admittedOn })
        .from(students)
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(inArray(students.status, ["active", "graduated", "withdrawn"]))
        .orderBy(asc(students.firstName), asc(students.lastName)),
      tx
        .select({ id: memberships.id, name: users.name, jobTitle: memberships.jobTitle })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.status, "active"))
        .orderBy(asc(users.name)),
      tx.select({ id: classes.id, name: classes.name }).from(classes).orderBy(asc(classes.name)),
    ]);
    return { students: kids, staff, classes: classList };
  });
}

// ---------- Public check ----------

/** What anyone scanning the QR code sees. Needs only the school and the code on the paper. */
export async function verifyDocument(db: DB, slug: string, token: string) {
  const [school] = await db.select({ id: schools.id, name: schools.name, slug: schools.slug, logoUrl: schools.logoUrl }).from(schools).where(eq(schools.slug, slug));
  if (!school || !/^[\w-]{10,40}$/.test(token)) return null;
  return withTenant(db, school.id, async (tx) => {
    const [doc] = await tx.select().from(issuedDocuments).where(eq(issuedDocuments.token, token));
    if (!doc) return { school, doc: null, holderActive: null };
    let holderActive: boolean | null = null;
    if (doc.kind === "id_card") {
      if (doc.studentId) holderActive = (await tx.select({ status: students.status }).from(students).where(eq(students.id, doc.studentId)))[0]?.status === "active";
      else if (doc.membershipId) holderActive = (await tx.select({ status: memberships.status }).from(memberships).where(eq(memberships.id, doc.membershipId)))[0]?.status === "active";
    }
    return { school, doc, holderActive };
  });
}
