import { and, asc, count, desc, eq, gte, ilike, lte, or, sql, sum, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { classes, guardians, invoiceLines, invoices, memberships, paymentIntents, payments, studentGuardians, students, users, type PaymentMethod } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira, nairaField } from "../money";
import { requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { pickTerm } from "./fees";
import { balanceOf, refreshInvoice, reserveNumbers } from "./invoices";

const actor = (access: Access, ip?: string | null) => ({ userId: access.user.id, name: access.user.name, ip });

export const PAYMENT_PAGE_SIZE = 25;

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", transfer: "Bank transfer", pos: "POS", cheque: "Cheque", paystack: "Online (Paystack)" };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date.");

export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: nairaField("amount"),
  method: z.enum(["cash", "transfer", "pos", "cheque"], { message: "Choose how they paid." }),
  paidOn: isoDate,
  reference: z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), z.string().trim().max(80).nullable().optional()),
  payerName: z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), z.string().trim().max(120).nullable().optional()),
  note: z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), z.string().trim().max(300).nullable().optional()),
});

/** Records cash, transfer, POS or cheque money against an invoice and issues a receipt number. */
export async function recordPayment(db: DB, access: Access, input: z.infer<typeof recordPaymentSchema>, ip?: string | null) {
  requirePermission(access, "fees:record_payment");
  requireFeature(access.plan, "fees_basic");
  if (input.paidOn > lagosToday()) throw new AppError("The payment date can't be in the future.");
  return withTenant(db, access.school.id, async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId));
    if (!inv) throw new AppError("That invoice wasn't found.", "not_found");
    if (inv.status === "void") throw new AppError("This invoice has been voided.", "conflict");
    const balance = balanceOf(inv);
    if (balance <= 0) throw new AppError("This invoice is already fully paid.", "conflict");
    if (input.amount > balance) throw new AppError(`That's more than the balance of ${formatNaira(balance)}.`, "conflict");
    const [receiptNo] = await reserveNumbers(tx, access.school.id, "receipt", 1);
    const [payment] = await tx
      .insert(payments)
      .values({
        schoolId: access.school.id,
        invoiceId: inv.id,
        studentId: inv.studentId,
        amountKobo: input.amount,
        method: input.method,
        reference: input.reference ?? null,
        payerName: input.payerName ?? null,
        note: input.note ?? null,
        paidOn: input.paidOn,
        receiptNo,
        recordedBy: access.membershipId,
      })
      .returning();
    const updated = await refreshInvoice(tx, inv.id);
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "fees.payment_recorded",
      summary: `Recorded ${formatNaira(input.amount)} (${METHOD_LABEL[input.method]}) on ${inv.number}, receipt ${receiptNo}`,
      entityType: "payment",
      entityId: payment.id,
    });
    return { payment, invoice: updated };
  });
}

/** Marks a payment as reversed (a bounced cheque, a refund, a mistake). The invoice balance goes back up. */
export async function reversePayment(db: DB, access: Access, input: { paymentId: string; reason: string }, ip?: string | null) {
  requirePermission(access, "fees:refund");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new AppError("Say why this payment is being reversed.");
  await withTenant(db, access.school.id, async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, input.paymentId));
    if (!p) throw new AppError("That payment wasn't found.", "not_found");
    if (p.status === "reversed") throw new AppError("This payment has already been reversed.", "conflict");
    await tx.update(payments).set({ status: "reversed", reversedAt: new Date(), reversedBy: access.membershipId, reversalReason: reason.slice(0, 300) }).where(eq(payments.id, p.id));
    await refreshInvoice(tx, p.invoiceId);
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "fees.payment_reversed",
      summary: `Reversed receipt ${p.receiptNo} (${formatNaira(p.amountKobo)}): ${reason}`,
      entityType: "payment",
      entityId: p.id,
    });
  });
}

/**
 * Turns a confirmed Paystack charge into a payment. Idempotent on the reference, so the
 * webhook and the browser callback can both call it.
 */
export async function settleIntent(tx: Tx, schoolId: string, reference: string, paid: { amountKobo: number; paidAt: Date; channel?: string | null }) {
  const [intent] = await tx.select().from(paymentIntents).where(eq(paymentIntents.reference, reference));
  if (!intent) throw new AppError("Unknown payment reference.", "not_found");
  if (intent.status === "succeeded") return { alreadySettled: true, paymentId: intent.paymentId };
  if (paid.amountKobo !== intent.amountKobo) {
    await tx.update(paymentIntents).set({ status: "failed", completedAt: new Date() }).where(eq(paymentIntents.id, intent.id));
    throw new AppError("The amount paid doesn't match the amount requested.", "conflict");
  }
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, intent.invoiceId));
  const [receiptNo] = await reserveNumbers(tx, schoolId, "receipt", 1);
  const paidOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(paid.paidAt);
  const [payment] = await tx
    .insert(payments)
    .values({
      schoolId,
      invoiceId: inv.id,
      studentId: inv.studentId,
      amountKobo: paid.amountKobo,
      method: "paystack",
      reference,
      receiptNo,
      paidOn,
      payerName: intent.email,
      note: paid.channel ? `Paid online by ${paid.channel}` : "Paid online",
    })
    .returning();
  await tx.update(paymentIntents).set({ status: "succeeded", paymentId: payment.id, completedAt: new Date() }).where(eq(paymentIntents.id, intent.id));
  await refreshInvoice(tx, inv.id);
  await recordAudit(tx, schoolId, null, {
    action: "fees.payment_online",
    summary: `Received ${formatNaira(paid.amountKobo)} online for ${inv.number}, receipt ${receiptNo}`,
    entityType: "payment",
    entityId: payment.id,
  });
  return { alreadySettled: false, paymentId: payment.id };
}

// ---------- Reading ----------

export type PaymentFilter = { from?: string; to?: string; method?: string; q?: string; status?: string; page?: number };

export async function listPayments(db: DB, access: Access, f: PaymentFilter) {
  requirePermission(access, "fees:view");
  requireFeature(access.plan, "fees_basic");
  const page = Math.max(1, f.page ?? 1);
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [];
    if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) where.push(gte(payments.paidOn, f.from));
    if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) where.push(lte(payments.paidOn, f.to));
    if (f.method && f.method in METHOD_LABEL) where.push(eq(payments.method, f.method as PaymentMethod));
    if (f.status === "reversed") where.push(eq(payments.status, "reversed"));
    else if (f.status !== "all") where.push(eq(payments.status, "succeeded"));
    const q = f.q?.trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      where.push(
        or(
          ilike(payments.receiptNo, like),
          ilike(payments.reference, like),
          ilike(invoices.number, like),
          ilike(students.admissionNo, like),
          ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, like),
        )!,
      );
    }
    const cond = where.length ? and(...where) : undefined;
    const [rows, [agg], byMethod] = await Promise.all([
      tx
        .select({
          payment: payments,
          invoiceNumber: invoices.number,
          student: { id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo },
          className: classes.name,
          recordedByName: users.name,
        })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .innerJoin(students, eq(students.id, payments.studentId))
        .leftJoin(classes, eq(classes.id, invoices.classId))
        .leftJoin(memberships, eq(memberships.id, payments.recordedBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(cond)
        .orderBy(desc(payments.paidOn), desc(payments.createdAt))
        .limit(PAYMENT_PAGE_SIZE)
        .offset((page - 1) * PAYMENT_PAGE_SIZE),
      tx
        .select({ total: count(), amount: sql<number>`coalesce(sum(${payments.amountKobo}), 0)`.mapWith(Number) })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .innerJoin(students, eq(students.id, payments.studentId))
        .where(cond),
      tx
        .select({ method: payments.method, amount: sum(payments.amountKobo).mapWith(Number), n: count() })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .innerJoin(students, eq(students.id, payments.studentId))
        .where(cond)
        .groupBy(payments.method),
    ]);
    return { rows, total: agg.total, amount: agg.amount, byMethod };
  });
}

/** Everything a receipt needs. */
export async function getReceipt(db: DB, access: Access, paymentId: string) {
  requirePermission(access, "fees:view");
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ payment: payments, invoice: invoices, student: students, className: classes.name, recordedByName: users.name })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(students, eq(students.id, payments.studentId))
      .leftJoin(classes, eq(classes.id, invoices.classId))
      .leftJoin(memberships, eq(memberships.id, payments.recordedBy))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(eq(payments.id, paymentId));
    if (!row) throw new AppError("That payment wasn't found.", "not_found");
    const { term } = await pickTerm(tx, row.invoice.termId);
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, row.invoice.id)).orderBy(asc(invoiceLines.sort));
    return { ...row, term, lines, balance: balanceOf(row.invoice) };
  });
}

/** Guardian emails for a student, primary first, for sending receipts. */
export async function guardianEmails(tx: Tx, studentId: string) {
  const rows = await tx
    .select({ name: guardians.name, email: guardians.email })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(eq(studentGuardians.studentId, studentId))
    .orderBy(desc(studentGuardians.isPrimary));
  return rows.filter((r): r is { name: string; email: string } => !!r.email);
}

export function receiptEmail(input: { schoolName: string; guardianName: string; studentName: string; receiptNo: string; invoiceNumber: string; amountKobo: number; balanceKobo: number; paidOn: string }) {
  return {
    subject: `Receipt ${input.receiptNo}: ${formatNaira(input.amountKobo)} for ${input.studentName}`,
    text: [
      `Dear ${input.guardianName},`,
      "",
      `We have received ${formatNaira(input.amountKobo)} towards ${input.studentName}'s fees (invoice ${input.invoiceNumber}) on ${input.paidOn}.`,
      `Receipt number: ${input.receiptNo}`,
      input.balanceKobo > 0 ? `Balance remaining: ${formatNaira(input.balanceKobo)}` : "The invoice is now fully paid. Thank you.",
      "",
      input.schoolName,
    ].join("\n"),
  };
}
