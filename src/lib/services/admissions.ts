import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { academicSessions, applicants, classes, classLevels, loginAttempts, plans, schools, type AdmissionSettings, type ApplicantStatus } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira, nairaField } from "../money";
import { hasFeature, type PlanRow } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { getCurrentTerm } from "./academics";
import { recordAudit } from "./audit";
import { schoolComms } from "./notify";
import { enqueue, type Outgoing } from "./outbox";
import { paystack, paystackMode } from "./paystack";
import { createStudent, guardianInputSchema, normalizePhone, studentInputSchema } from "./students";

/*
 * Admissions: a public form per school, an application fee paid straight into the school's
 * Paystack subaccount, a pipeline for staff (entrance exam, interview, offer), an offer
 * letter, and one click to enrol an accepted child as a student.
 */

export const APPLICANT_PAGE_SIZE = 25;
const ACCEPT_DAYS = 14;

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireAdmissions(access: Access) {
  if (!hasFeature(access.plan, "admissions")) throw new AppError("Admissions are on the Standard plan.", "upgrade");
  requirePermission(access, "admissions:view");
}

export const STATUS_LABEL: Record<ApplicantStatus, string> = {
  applied: "Applied",
  exam: "Entrance exam",
  interview: "Interview",
  offered: "Offered",
  accepted: "Accepted",
  enrolled: "Enrolled",
  rejected: "Not successful",
  withdrawn: "Withdrawn",
};

/** Where staff can move an applicant from each stage. */
const NEXT: Record<ApplicantStatus, ApplicantStatus[]> = {
  applied: ["exam", "interview", "offered", "rejected", "withdrawn"],
  exam: ["interview", "offered", "rejected", "withdrawn"],
  interview: ["exam", "offered", "rejected", "withdrawn"],
  offered: ["accepted", "rejected", "withdrawn"],
  accepted: ["withdrawn"],
  enrolled: [],
  rejected: ["applied"],
  withdrawn: ["applied"],
};
export function nextStatuses(s: ApplicantStatus) {
  return NEXT[s];
}

function fullName(a: { firstName: string; middleName: string | null; lastName: string }) {
  return [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" ");
}

export function statusUrl(baseUrl: string, slug: string, token: string) {
  return `${baseUrl}/apply/${slug}/status/${token}`;
}

// ---------- Settings ----------

export const admissionSettingsSchema = z.object({
  open: z.boolean(),
  levelIds: z.array(z.string().uuid()).default([]),
  fee: z.preprocess((v) => (v === "" || v == null ? "0" : v), nairaField("application fee", { allowZero: true })),
  intro: z.string().trim().max(1500).default(""),
  examInfo: z.string().trim().max(1500).default(""),
});

export async function saveAdmissionSettings(db: DB, access: Access, input: z.infer<typeof admissionSettingsSchema>, ip?: string | null) {
  requireAdmissions(access);
  requirePermission(access, "admissions:manage");
  const settings: AdmissionSettings = { open: input.open, levelIds: input.levelIds, feeKobo: input.fee, intro: input.intro, examInfo: input.examInfo };
  await db.update(schools).set({ admissionSettings: settings }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, actor(access, ip), { action: "admissions.settings", summary: `${input.open ? "Opened" : "Closed"} admissions${input.fee ? `, form fee ${formatNaira(input.fee)}` : ""}` }),
  );
}

// ---------- Public form ----------

/** Everything the public application page needs, or null for an unknown school. */
export async function getApplyPage(db: DB, slug: string) {
  const [row] = await db.select({ school: schools, plan: plans }).from(schools).innerJoin(plans, eq(plans.key, schools.planKey)).where(eq(schools.slug, slug));
  if (!row || row.school.status === "suspended") return null;
  const { school, plan } = row;
  const settings = school.admissionSettings;
  const enabled = hasFeature(plan as PlanRow, "admissions");
  return withTenant(db, school.id, async (tx) => {
    const [levels, current] = await Promise.all([
      tx.select({ id: classLevels.id, name: classLevels.name }).from(classLevels).orderBy(asc(classLevels.sort)),
      getCurrentTerm(tx),
    ]);
    const open = enabled && !!settings.open;
    return {
      school: { id: school.id, name: school.name, slug: school.slug, logoUrl: school.logoUrl, city: school.city, state: school.state, phone: school.phone, email: school.email },
      open,
      levels: settings.levelIds?.length ? levels.filter((l) => settings.levelIds!.includes(l.id)) : levels,
      session: current?.session.name ?? null,
      feeKobo: settings.feeKobo ?? 0,
      intro: settings.intro ?? "",
      examInfo: settings.examInfo ?? "",
      payOnline: (settings.feeKobo ?? 0) > 0 && paystackMode() !== "off" && (!!school.paystackSubaccount || paystackMode() === "test"),
    };
  });
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const applicationSchema = z.object({
  levelId: z.string().uuid("Choose the class you're applying for."),
  firstName: z.string().trim().min(1, "Enter the child's first name.").max(60),
  middleName: optional(60),
  lastName: z.string().trim().min(1, "Enter the child's surname.").max(60),
  gender: z.enum(["male", "female"], { message: "Choose boy or girl." }),
  dateOfBirth: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").nullable()),
  previousSchool: optional(150),
  guardianName: z.string().trim().min(2, "Enter your name.").max(120),
  guardianRelationship: z.string().trim().min(2).max(40).default("Parent"),
  guardianPhone: z.string().transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 0803 123 4567." });
      return z.NEVER;
    }
    return n;
  }),
  guardianEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || null)
    .pipe(z.string().email("Enter a valid email address.").nullable()),
  address: optional(300),
  notes: optional(1000),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;

const APPLY_LIMIT = 5;

async function sendToGuardian(tx: Tx, schoolId: string, a: { guardianPhone: string; guardianEmail: string | null }, msg: { subject: string; body: string; sms: string; kind: string; ref: string }) {
  const comms = await schoolComms(tx, schoolId);
  const items: Outgoing[] = [];
  if (a.guardianEmail) items.push({ channel: "email", to: a.guardianEmail, subject: msg.subject, body: msg.body, kind: msg.kind, ref: msg.ref });
  if (comms.smsEnabled) items.push({ channel: "sms", to: a.guardianPhone, body: msg.sms, kind: msg.kind, ref: msg.ref });
  if (items.length) await enqueue(tx, schoolId, items);
}

/** A parent applies. Returns the private status-page token. */
export async function submitApplication(db: DB, slug: string, input: ApplicationInput, ctx: { ip: string | null; baseUrl: string }) {
  const page = await getApplyPage(db, slug);
  if (!page) throw new AppError("That school wasn't found.", "not_found");
  if (!page.open) throw new AppError(`${page.school.name} isn't taking applications right now.`, "conflict");
  if (!page.levels.some((l) => l.id === input.levelId)) throw new AppError("Choose one of the classes listed.", "invalid");

  const key = `apply:${ctx.ip ?? "unknown"}`;
  const [{ n }] = await db.select({ n: count() }).from(loginAttempts).where(and(eq(loginAttempts.key, key), gt(loginAttempts.createdAt, new Date(Date.now() - 3_600_000))));
  if (n >= APPLY_LIMIT) throw new AppError("Too many applications from this connection. Please try again in an hour.", "rate_limited");
  await db.insert(loginAttempts).values({ key, succeeded: true });

  const [{ seq }] = await db
    .update(schools)
    .set({ nextApplicantSeq: sql`${schools.nextApplicantSeq} + 1` })
    .where(eq(schools.id, page.school.id))
    .returning({ seq: sql<number>`${schools.nextApplicantSeq} - 1` });
  const year = new Date().getFullYear();
  const ref = `APP/${year}/${String(seq).padStart(4, "0")}`;
  const token = randomBytes(24).toString("base64url");
  const schoolId = page.school.id;

  await withTenant(db, schoolId, async (tx) => {
    const current = await getCurrentTerm(tx);
    await tx.insert(applicants).values({ ...input, schoolId, ref, token, sessionId: current?.session.id ?? null, feeKobo: page.feeKobo, feePaid: page.feeKobo === 0 });
    const level = page.levels.find((l) => l.id === input.levelId)!.name;
    const link = statusUrl(ctx.baseUrl, slug, token);
    await sendToGuardian(tx, schoolId, input, {
      subject: `${page.school.name}: application ${ref} received`,
      body: `Dear ${input.guardianName},\n\nWe've received the application for ${input.firstName} ${input.lastName} into ${level}. Your reference is ${ref}.\n\n${page.feeKobo ? `The application fee is ${formatNaira(page.feeKobo)}. ` : ""}Follow the application, and see the next steps, here:\n${link}\n\n${page.school.name}`,
      sms: `${page.school.name}: application ${ref} for ${input.firstName} received. Track it: ${link}`,
      kind: "admission",
      ref,
    });
  });
  return { token, ref };
}

/** The applicant's own page, found by the secret token in their link. */
export async function getApplicationStatus(db: DB, slug: string, token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const page = await getApplyPage(db, slug);
  if (!page) return null;
  return withTenant(db, page.school.id, async (tx) => {
    const [row] = await tx
      .select({ a: applicants, levelName: classLevels.name, sessionName: academicSessions.name })
      .from(applicants)
      .leftJoin(classLevels, eq(classLevels.id, applicants.levelId))
      .leftJoin(academicSessions, eq(academicSessions.id, applicants.sessionId))
      .where(eq(applicants.token, token));
    if (!row) return null;
    return { ...row, page, acceptBy: row.a.offeredAt ? new Date(row.a.offeredAt.getTime() + ACCEPT_DAYS * 86_400_000) : null };
  });
}

/** The parent accepts or declines an offer from their status page. */
export async function respondToOffer(db: DB, slug: string, token: string, accept: boolean) {
  const s = await getApplicationStatus(db, slug, token);
  if (!s) throw new AppError("That application wasn't found.", "not_found");
  if (s.a.status !== "offered") throw new AppError("There's no open offer on this application.", "conflict");
  await withTenant(db, s.page.school.id, async (tx) => {
    await tx.update(applicants).set({ status: accept ? "accepted" : "withdrawn", updatedAt: new Date() }).where(eq(applicants.id, s.a.id));
    await recordAudit(tx, s.page.school.id, null, {
      action: accept ? "admissions.offer_accepted" : "admissions.offer_declined",
      summary: `${s.a.guardianName} ${accept ? "accepted" : "declined"} the offer for ${fullName(s.a)} (${s.a.ref})`,
      entityType: "applicant",
      entityId: s.a.id,
    });
  });
}

// ---------- Application fee ----------

export const feePaymentSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter your email address for the receipt.") });

export async function startApplicationFee(db: DB, slug: string, token: string, email: string, baseUrl: string) {
  const s = await getApplicationStatus(db, slug, token);
  if (!s) throw new AppError("That application wasn't found.", "not_found");
  if (s.a.feePaid) throw new AppError("The application fee is already paid.", "conflict");
  if (!s.page.payOnline) throw new AppError("Online payment isn't available. Please pay at the school.", "conflict");
  const reference = `sosa_${randomBytes(12).toString("hex")}`;
  const schoolId = s.page.school.id;
  await withTenant(db, schoolId, (tx) => tx.update(applicants).set({ payReference: reference, guardianEmail: s.a.guardianEmail ?? email }).where(eq(applicants.id, s.a.id)));
  const back = statusUrl(baseUrl, slug, token);
  if (paystackMode() === "test") return { url: `${back}/test-checkout?reference=${reference}` };
  const [school] = await db.select({ subaccount: schools.paystackSubaccount }).from(schools).where(eq(schools.id, schoolId));
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email,
      amount: s.a.feeKobo,
      currency: "NGN",
      reference,
      subaccount: school.subaccount,
      bearer: "subaccount",
      callback_url: `${back}/callback`,
      metadata: { school_id: schoolId, applicant_ref: s.a.ref, purpose: "application fee" },
    },
  });
  return { url: data.authorization_url };
}

async function settleFee(db: DB, reference: string, paid: { amountKobo: number }) {
  if (!/^sosa_[0-9a-f]{24}$/.test(reference)) return false;
  const [row] = await db.select({ id: applicants.id, schoolId: applicants.schoolId, feeKobo: applicants.feeKobo, feePaid: applicants.feePaid, ref: applicants.ref }).from(applicants).where(eq(applicants.payReference, reference));
  if (!row) return false;
  if (row.feePaid) return true;
  if (paid.amountKobo < row.feeKobo) return false;
  await withTenant(db, row.schoolId, async (tx) => {
    await tx.update(applicants).set({ feePaid: true, updatedAt: new Date() }).where(eq(applicants.id, row.id));
    await recordAudit(tx, row.schoolId, null, { action: "admissions.fee_paid", summary: `Application fee paid for ${row.ref} (${formatNaira(paid.amountKobo)})`, entityType: "applicant", entityId: row.id });
  });
  return true;
}

/** Confirms the fee after checkout (or the local test checkout). Safe to call more than once. */
export async function confirmApplicationFee(db: DB, reference: string, opts: { testApproved?: boolean } = {}) {
  if (!/^sosa_[0-9a-f]{24}$/.test(reference)) return false;
  if (paystackMode() === "test") {
    if (!opts.testApproved) return false;
    const [row] = await db.select({ feeKobo: applicants.feeKobo }).from(applicants).where(eq(applicants.payReference, reference));
    return row ? settleFee(db, reference, { amountKobo: row.feeKobo }) : false;
  }
  const data = await paystack<{ status: string; amount: number; currency: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (data.status !== "success" || data.currency !== "NGN") return false;
  return settleFee(db, reference, { amountKobo: data.amount });
}

/** Paystack webhook for application fees (references start with sosa_). */
export async function handleApplicationFeeEvent(db: DB, data: { reference?: string; amount?: number; currency?: string }) {
  if (!data.reference || data.currency !== "NGN" || typeof data.amount !== "number") return false;
  return settleFee(db, data.reference, { amountKobo: data.amount });
}

// ---------- Staff ----------

export async function listApplicants(db: DB, access: Access, filter: { status?: string; levelId?: string; paid?: string; q?: string; page?: number; limit?: number } = {}) {
  requireAdmissions(access);
  const size = filter.limit ?? APPLICANT_PAGE_SIZE;
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [];
    if (filter.status && filter.status in STATUS_LABEL) where.push(eq(applicants.status, filter.status as ApplicantStatus));
    if (filter.levelId) where.push(eq(applicants.levelId, filter.levelId));
    if (filter.paid === "yes") where.push(eq(applicants.feePaid, true));
    if (filter.paid === "no") where.push(eq(applicants.feePaid, false));
    if (filter.q) {
      const q = `%${filter.q}%`;
      where.push(or(ilike(applicants.firstName, q), ilike(applicants.lastName, q), ilike(applicants.ref, q), ilike(applicants.guardianName, q), ilike(applicants.guardianPhone, q))!);
    }
    const page = Math.max(1, filter.page ?? 1);
    const [[{ total }], rows, pipeline, [stats], levels] = await Promise.all([
      tx.select({ total: count() }).from(applicants).where(and(...where)),
      tx
        .select({ a: applicants, levelName: classLevels.name })
        .from(applicants)
        .leftJoin(classLevels, eq(classLevels.id, applicants.levelId))
        .where(and(...where))
        .orderBy(desc(applicants.createdAt))
        .limit(size)
        .offset((page - 1) * size),
      tx.select({ status: applicants.status, n: count() }).from(applicants).groupBy(applicants.status),
      tx
        .select({
          thisWeek: sql<number>`count(*) filter (where ${applicants.createdAt} > now() - interval '7 days')`.mapWith(Number),
          fees: sql<number>`coalesce(sum(${applicants.feeKobo}) filter (where ${applicants.feePaid} and ${applicants.feeKobo} > 0), 0)`.mapWith(Number),
          unpaid: sql<number>`count(*) filter (where not ${applicants.feePaid})`.mapWith(Number),
        })
        .from(applicants),
      tx.select({ id: classLevels.id, name: classLevels.name }).from(classLevels).orderBy(asc(classLevels.sort)),
    ]);
    const by = Object.fromEntries(pipeline.map((p) => [p.status, p.n])) as Partial<Record<ApplicantStatus, number>>;
    return { rows, total, pipeline: by, stats: { ...stats, all: pipeline.reduce((t, p) => t + p.n, 0) }, levels };
  });
}

export async function getApplicant(db: DB, access: Access, id: string) {
  requireAdmissions(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ a: applicants, levelName: classLevels.name, sessionName: academicSessions.name })
      .from(applicants)
      .leftJoin(classLevels, eq(classLevels.id, applicants.levelId))
      .leftJoin(academicSessions, eq(academicSessions.id, applicants.sessionId))
      .where(eq(applicants.id, id));
    if (!row) throw new AppError("That applicant wasn't found.", "not_found");
    const classOptions = row.a.levelId
      ? await tx.select({ id: classes.id, name: classes.name }).from(classes).where(and(eq(classes.levelId, row.a.levelId), eq(classes.isActive, true))).orderBy(asc(classes.name))
      : [];
    return { ...row, classOptions, next: NEXT[row.a.status] };
  });
}

export const applicantUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["applied", "exam", "interview", "offered", "accepted", "rejected", "withdrawn"]).optional(),
  examScore: z.number().min(0).max(1000).nullable().optional(),
  interviewNotes: z.string().trim().max(3000).nullable().optional(),
  feePaid: z.boolean().optional(),
  notify: z.boolean().default(true),
});

/** Moves an applicant along, records exam scores and notes, and tells the parent. */
export async function updateApplicant(db: DB, access: Access, input: z.infer<typeof applicantUpdateSchema>, ctx: { ip?: string | null; baseUrl: string }) {
  requireAdmissions(access);
  requirePermission(access, "admissions:manage");
  return withTenant(db, access.school.id, async (tx) => {
    const [a] = await tx.select().from(applicants).where(eq(applicants.id, input.id));
    if (!a) throw new AppError("That applicant wasn't found.", "not_found");
    const set: Partial<typeof applicants.$inferInsert> = { updatedAt: new Date() };
    if (input.examScore !== undefined) set.examScore = input.examScore;
    if (input.interviewNotes !== undefined) set.interviewNotes = input.interviewNotes;
    if (input.feePaid !== undefined) set.feePaid = input.feePaid;
    const moving = input.status && input.status !== a.status;
    if (moving) {
      if (!NEXT[a.status].includes(input.status!)) throw new AppError(`An applicant who is "${STATUS_LABEL[a.status]}" can't move to "${STATUS_LABEL[input.status!]}".`, "conflict");
      if (input.status === "offered" && !(input.feePaid ?? a.feePaid)) throw new AppError("The application fee hasn't been paid. Mark it paid first if they paid at the school.", "conflict");
      set.status = input.status;
      if (input.status === "offered") set.offeredAt = new Date();
    }
    const [updated] = await tx.update(applicants).set(set).where(eq(applicants.id, a.id)).returning();
    if (moving) {
      await recordAudit(tx, access.school.id, actor(access, ctx.ip), {
        action: "admissions.status",
        summary: `${fullName(a)} (${a.ref}): ${STATUS_LABEL[a.status]} → ${STATUS_LABEL[input.status!]}`,
        entityType: "applicant",
        entityId: a.id,
      });
      const [school] = await tx.select({ name: schools.name, slug: schools.slug, settings: schools.admissionSettings }).from(schools).where(eq(schools.id, access.school.id));
      const link = statusUrl(ctx.baseUrl, school.slug, a.token);
      const child = a.firstName;
      const words: Partial<Record<ApplicantStatus, string>> = {
        exam: `${child} is invited to sit our entrance examination.${school.settings.examInfo ? ` ${school.settings.examInfo}` : ""}`,
        interview: `${child} is invited for an interview. The school will contact you with the time.`,
        offered: `Congratulations! ${child} has been offered admission. Please accept the offer on your application page.`,
        rejected: `We're sorry, we can't offer ${child} a place this time. Thank you for applying.`,
      };
      const text = words[input.status!];
      if (input.notify && text) {
        await sendToGuardian(tx, access.school.id, a, {
          subject: `${school.name}: update on application ${a.ref}`,
          body: `Dear ${a.guardianName},\n\n${text}\n\nSee your application:\n${link}\n\n${school.name}`,
          sms: `${school.name}: ${text} ${link}`.slice(0, 300),
          kind: "admission",
          ref: a.ref,
        });
      }
    }
    return updated;
  });
}

/** Turns an accepted applicant into a student in the chosen class, guardian included. */
export async function enrollApplicant(db: DB, access: Access, input: { id: string; classId: string }, ip?: string | null) {
  requireAdmissions(access);
  if (!can(access, "admissions:enroll")) throw new AppError("You don't have permission to enrol students.", "forbidden");
  const a = await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.select().from(applicants).where(eq(applicants.id, input.id));
    if (!row) throw new AppError("That applicant wasn't found.", "not_found");
    if (row.status === "enrolled") throw new AppError("Already enrolled.", "conflict");
    if (row.status !== "accepted" && row.status !== "offered") throw new AppError("Only children who've been offered a place can be enrolled.", "conflict");
    const [cls] = await tx.select().from(classes).where(eq(classes.id, input.classId));
    if (!cls) throw new AppError("Choose a class.", "invalid");
    if (row.levelId && cls.levelId !== row.levelId) throw new AppError("That class is in a different level from the one applied for.", "invalid");
    return row;
  });
  const student = await createStudent(
    db,
    access,
    studentInputSchema.parse({
      firstName: a.firstName,
      middleName: a.middleName ?? "",
      lastName: a.lastName,
      gender: a.gender,
      dateOfBirth: a.dateOfBirth ?? "",
      admittedOn: new Date().toISOString().slice(0, 10),
      classId: input.classId,
      address: a.address ?? "",
    }),
    [guardianInputSchema.parse({ name: a.guardianName, relationship: a.guardianRelationship, phone: a.guardianPhone, email: a.guardianEmail ?? "", address: a.address ?? "" })],
    ip,
  );
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(applicants).set({ status: "enrolled", studentId: student.id, updatedAt: new Date() }).where(eq(applicants.id, a.id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "admissions.enrolled", summary: `Enrolled ${fullName(a)} (${a.ref}) as ${student.admissionNo}`, entityType: "applicant", entityId: a.id });
  });
  return student;
}

/** Offer letter data, for staff (by id) or the parent (by token). */
export async function offerLetterData(db: DB, schoolId: string, applicantId: string) {
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  const row = await withTenant(db, schoolId, async (tx) => {
    const [r] = await tx
      .select({ a: applicants, levelName: classLevels.name, sessionName: academicSessions.name })
      .from(applicants)
      .leftJoin(classLevels, eq(classLevels.id, applicants.levelId))
      .leftJoin(academicSessions, eq(academicSessions.id, applicants.sessionId))
      .where(eq(applicants.id, applicantId));
    return r ?? null;
  });
  if (!school || !row || !row.a.offeredAt || !["offered", "accepted", "enrolled"].includes(row.a.status)) return null;
  return { school, ...row, acceptBy: new Date(row.a.offeredAt.getTime() + ACCEPT_DAYS * 86_400_000), child: fullName(row.a) };
}
