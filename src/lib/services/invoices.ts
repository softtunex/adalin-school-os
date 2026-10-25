import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, lt, ne, or, sql, sum, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import {
  classes,
  discountSchemes,
  feeAmounts,
  feeItems,
  guardians,
  invoiceLines,
  invoices,
  memberships,
  payments,
  schools,
  studentDiscounts,
  studentGuardians,
  students,
  users,
  type InvoiceStatus,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira, nairaField } from "../money";
import { hasFeature, requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { pickTerm } from "./fees";
import { notifyGuardians, schoolComms } from "./notify";

const actor = (access: Access, ip?: string | null) => ({ userId: access.user.id, name: access.user.name, ip });

export const INVOICE_PAGE_SIZE = 25;

// ---------- Pure helpers ----------

type Totals = { chargesKobo: number; discountKobo: number; paidKobo: number };

export const netOf = (i: Pick<Totals, "chargesKobo" | "discountKobo">) => i.chargesKobo - i.discountKobo;
export const balanceOf = (i: Totals) => i.chargesKobo - i.discountKobo - i.paidKobo;

export function statusFor(i: Totals): Exclude<InvoiceStatus, "void"> {
  if (i.paidKobo >= netOf(i)) return "paid";
  return i.paidKobo > 0 ? "partial" : "unpaid";
}

type SchemeLike = { id: string; name: string; kind: "percent" | "fixed"; value: number; itemId: string | null };
type ItemLike = { id: string; name: string; isOptional: boolean };

/**
 * The lines on a student's term invoice: every compulsory item their class level pays,
 * then their discounts. Item discounts work off that item's charge, others off the
 * compulsory total, and discounts together never exceed the charges.
 */
export function buildTermLines(items: ItemLike[], amounts: Map<string, number>, schemes: SchemeLike[]) {
  const charges = items
    .filter((i) => !i.isOptional && (amounts.get(i.id) ?? 0) > 0)
    .map((i) => ({ itemId: i.id, description: i.name, amountKobo: amounts.get(i.id)! }));
  const total = charges.reduce((n, c) => n + c.amountKobo, 0);
  let room = total;
  const discounts: { schemeId: string; description: string; amountKobo: number }[] = [];
  for (const s of schemes) {
    const base = s.itemId ? (charges.find((c) => c.itemId === s.itemId)?.amountKobo ?? 0) : total;
    if (base <= 0 || room <= 0) continue;
    const raw = s.kind === "percent" ? Math.round((base * s.value) / 100) : Math.min(s.value, base);
    const amountKobo = Math.min(raw, room);
    if (amountKobo <= 0) continue;
    room -= amountKobo;
    discounts.push({ schemeId: s.id, description: s.name, amountKobo });
  }
  return { charges, discounts, total, discount: total - room };
}

function newPayToken() {
  return randomBytes(18).toString("base64url");
}

/** Reserves `n` consecutive invoice or receipt numbers for the school. */
export async function reserveNumbers(tx: Tx, schoolId: string, kind: "invoice" | "receipt", n: number): Promise<string[]> {
  if (n <= 0) return [];
  const col = kind === "invoice" ? schools.nextInvoiceSeq : schools.nextReceiptSeq;
  const [row] = await tx
    .update(schools)
    .set(kind === "invoice" ? { nextInvoiceSeq: sql`${col} + ${n}` } : { nextReceiptSeq: sql`${col} + ${n}` })
    .where(eq(schools.id, schoolId))
    .returning({ next: col });
  const start = row.next - n;
  const prefix = kind === "invoice" ? "INV" : "RCT";
  return Array.from({ length: n }, (_, i) => `${prefix}-${String(start + i).padStart(5, "0")}`);
}

/** Recomputes an invoice's totals and status from its lines and successful payments. */
export async function refreshInvoice(tx: Tx, invoiceId: string) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new AppError("That invoice wasn't found.", "not_found");
  const lines = await tx.select({ kind: invoiceLines.kind, total: sum(invoiceLines.amountKobo).mapWith(Number) }).from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).groupBy(invoiceLines.kind);
  const [{ paid }] = await tx
    .select({ paid: sum(payments.amountKobo).mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, "succeeded")));
  const totals = {
    chargesKobo: lines.find((l) => l.kind === "charge")?.total ?? 0,
    discountKobo: lines.find((l) => l.kind === "discount")?.total ?? 0,
    paidKobo: paid ?? 0,
  };
  const status = inv.status === "void" ? "void" : statusFor(totals);
  const [updated] = await tx.update(invoices).set({ ...totals, status }).where(eq(invoices.id, invoiceId)).returning();
  return updated;
}

// ---------- Raising invoices ----------

export const generateInvoicesSchema = z.object({
  termId: z.string().uuid(),
  classIds: z.array(z.string().uuid()).optional(),
  dueOn: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
});

/**
 * Raises a term invoice for every active student who doesn't have one yet, from the fee
 * structure and their discounts. Safe to run again: students admitted later get theirs.
 */
export async function generateTermInvoices(db: DB, access: Access, input: z.infer<typeof generateInvoicesSchema>, ip?: string | null) {
  requirePermission(access, "fees:invoice");
  requireFeature(access.plan, "fees_basic");
  const discountsOn = hasFeature(access.plan, "debtors");
  return withTenant(db, access.school.id, async (tx) => {
    const { term } = await pickTerm(tx, input.termId);
    if (term.id !== input.termId) throw new AppError("That term wasn't found.", "not_found");

    const filters: SQL[] = [eq(students.status, "active"), isNotNull(students.classId)];
    if (input.classIds?.length) filters.push(inArray(students.classId, input.classIds));
    const [roster, existing, items, amounts, assigned] = await Promise.all([
      tx.select({ id: students.id, classId: students.classId, levelId: classes.levelId }).from(students).innerJoin(classes, eq(classes.id, students.classId)).where(and(...filters)),
      tx.select({ studentId: invoices.studentId }).from(invoices).where(and(eq(invoices.termId, term.id), eq(invoices.kind, "term"), ne(invoices.status, "void"))),
      tx.select().from(feeItems).orderBy(asc(feeItems.sort), asc(feeItems.name)),
      tx.select().from(feeAmounts).where(eq(feeAmounts.termId, term.id)),
      discountsOn
        ? tx.select({ studentId: studentDiscounts.studentId, scheme: discountSchemes }).from(studentDiscounts).innerJoin(discountSchemes, eq(discountSchemes.id, studentDiscounts.schemeId)).where(eq(discountSchemes.isActive, true)).orderBy(asc(discountSchemes.name))
        : Promise.resolve([]),
    ]);

    const invoiced = new Set(existing.map((e) => e.studentId));
    const byLevel = new Map<string, Map<string, number>>();
    for (const a of amounts) {
      if (!byLevel.has(a.levelId)) byLevel.set(a.levelId, new Map());
      byLevel.get(a.levelId)!.set(a.itemId, a.amountKobo);
    }
    const schemesFor = new Map<string, SchemeLike[]>();
    for (const a of assigned) schemesFor.set(a.studentId, [...(schemesFor.get(a.studentId) ?? []), a.scheme]);

    let alreadyInvoiced = 0;
    let noFees = 0;
    const toCreate: { student: (typeof roster)[number]; lines: ReturnType<typeof buildTermLines> }[] = [];
    for (const student of roster) {
      if (invoiced.has(student.id)) {
        alreadyInvoiced++;
        continue;
      }
      const lines = buildTermLines(items, byLevel.get(student.levelId) ?? new Map(), schemesFor.get(student.id) ?? []);
      if (lines.total === 0) {
        noFees++;
        continue;
      }
      toCreate.push({ student, lines });
    }

    if (toCreate.length) {
      const numbers = await reserveNumbers(tx, access.school.id, "invoice", toCreate.length);
      const created = await tx
        .insert(invoices)
        .values(
          toCreate.map(({ student, lines }, i) => {
            const totals = { chargesKobo: lines.total, discountKobo: lines.discount, paidKobo: 0 };
            return {
              schoolId: access.school.id,
              number: numbers[i],
              studentId: student.id,
              termId: term.id,
              classId: student.classId,
              kind: "term" as const,
              title: `${term.name} fees`,
              dueOn: input.dueOn ?? null,
              ...totals,
              status: statusFor(totals),
              payToken: newPayToken(),
              issuedBy: access.membershipId,
            };
          }),
        )
        .returning({ id: invoices.id, studentId: invoices.studentId });
      const idFor = new Map(created.map((c) => [c.studentId, c.id]));
      const lineRows = toCreate.flatMap(({ student, lines }) => [
        ...lines.charges.map((c, i) => ({ schoolId: access.school.id, invoiceId: idFor.get(student.id)!, kind: "charge" as const, itemId: c.itemId, description: c.description, amountKobo: c.amountKobo, sort: i })),
        ...lines.discounts.map((d, i) => ({ schoolId: access.school.id, invoiceId: idFor.get(student.id)!, kind: "discount" as const, schemeId: d.schemeId, description: d.description, amountKobo: d.amountKobo, sort: 100 + i })),
      ]);
      for (let i = 0; i < lineRows.length; i += 500) await tx.insert(invoiceLines).values(lineRows.slice(i, i + 500));
      await recordAudit(tx, access.school.id, actor(access, ip), {
        action: "fees.invoices_generated",
        summary: `Raised ${toCreate.length} ${term.label} invoice${toCreate.length === 1 ? "" : "s"}`,
        meta: { termId: term.id, created: toCreate.length },
      });
    }
    return { created: toCreate.length, alreadyInvoiced, noFees, term };
  });
}

const lineInput = z.object({
  itemId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional()),
  description: z.string().trim().min(2, "Describe the charge.").max(80),
  amount: nairaField("amount"),
});

export const otherInvoiceSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  title: z.string().trim().min(2, "Give the invoice a title, e.g. Uniform.").max(80),
  dueOn: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  lines: z.array(lineInput).min(1, "Add at least one charge.").max(30),
});

/** A one-off invoice, e.g. uniform, books, an excursion. */
export async function createOtherInvoice(db: DB, access: Access, input: z.infer<typeof otherInvoiceSchema>, ip?: string | null) {
  requirePermission(access, "fees:invoice");
  requireFeature(access.plan, "fees_basic");
  return withTenant(db, access.school.id, async (tx) => {
    const { term } = await pickTerm(tx, input.termId);
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!student) throw new AppError("That student wasn't found.", "not_found");
    const [number] = await reserveNumbers(tx, access.school.id, "invoice", 1);
    const total = input.lines.reduce((n, l) => n + l.amount, 0);
    const [invoice] = await tx
      .insert(invoices)
      .values({
        schoolId: access.school.id,
        number,
        studentId: student.id,
        termId: term.id,
        classId: student.classId,
        kind: "other",
        title: input.title,
        dueOn: input.dueOn ?? null,
        chargesKobo: total,
        status: "unpaid",
        payToken: newPayToken(),
        issuedBy: access.membershipId,
      })
      .returning();
    await tx.insert(invoiceLines).values(input.lines.map((l, i) => ({ schoolId: access.school.id, invoiceId: invoice.id, kind: "charge" as const, itemId: l.itemId ?? null, description: l.description, amountKobo: l.amount, sort: i })));
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "fees.invoice_created",
      summary: `Raised ${number} (${input.title}, ${formatNaira(total)}) for ${student.firstName} ${student.lastName}`,
      entityType: "invoice",
      entityId: invoice.id,
    });
    return invoice;
  });
}

export const addLineSchema = z.object({
  invoiceId: z.string().uuid(),
  kind: z.enum(["charge", "discount"]),
  itemId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional()),
  description: z.string().trim().min(2, "Describe it.").max(80),
  amount: nairaField("amount"),
});

export async function addInvoiceLine(db: DB, access: Access, input: z.infer<typeof addLineSchema>, ip?: string | null) {
  if (input.kind === "discount") {
    requirePermission(access, "fees:discount");
    requireFeature(access.plan, "debtors");
  } else {
    requirePermission(access, "fees:invoice");
    requireFeature(access.plan, "fees_basic");
  }
  return withTenant(db, access.school.id, async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId));
    if (!inv) throw new AppError("That invoice wasn't found.", "not_found");
    if (inv.status === "void") throw new AppError("This invoice has been voided.", "conflict");
    if (input.kind === "discount" && input.amount > balanceOf(inv)) {
      throw new AppError(`The discount can't be more than the balance of ${formatNaira(Math.max(0, balanceOf(inv)))}.`, "conflict");
    }
    await tx.insert(invoiceLines).values({ schoolId: access.school.id, invoiceId: inv.id, kind: input.kind, itemId: input.itemId ?? null, description: input.description, amountKobo: input.amount, sort: input.kind === "discount" ? 200 : 50 });
    const updated = await refreshInvoice(tx, inv.id);
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.kind === "discount" ? "fees.invoice_discount" : "fees.invoice_charge",
      summary: `${input.kind === "discount" ? "Gave a discount of" : "Added a charge of"} ${formatNaira(input.amount)} (${input.description}) on ${inv.number}`,
      entityType: "invoice",
      entityId: inv.id,
    });
    return updated;
  });
}

export async function removeInvoiceLine(db: DB, access: Access, lineId: string, ip?: string | null) {
  requirePermission(access, "fees:invoice");
  await withTenant(db, access.school.id, async (tx) => {
    const [line] = await tx.select().from(invoiceLines).where(eq(invoiceLines.id, lineId));
    if (!line) throw new AppError("That line wasn't found.", "not_found");
    if (line.kind === "discount") requirePermission(access, "fees:discount");
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, line.invoiceId));
    if (inv.status === "void") throw new AppError("This invoice has been voided.", "conflict");
    if (line.kind === "charge" && netOf(inv) - line.amountKobo < inv.paidKobo) {
      throw new AppError("Payments on this invoice are more than it would come to without this charge. Reverse a payment first.", "conflict");
    }
    await tx.delete(invoiceLines).where(eq(invoiceLines.id, lineId));
    await refreshInvoice(tx, inv.id);
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "fees.invoice_line_removed",
      summary: `Removed ${line.description} (${formatNaira(line.amountKobo)}) from ${inv.number}`,
      entityType: "invoice",
      entityId: inv.id,
    });
  });
}

export async function voidInvoice(db: DB, access: Access, input: { invoiceId: string; reason: string }, ip?: string | null) {
  requirePermission(access, "fees:invoice");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new AppError("Say why you're voiding this invoice.");
  await withTenant(db, access.school.id, async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId));
    if (!inv) throw new AppError("That invoice wasn't found.", "not_found");
    if (inv.status === "void") return;
    if (inv.paidKobo > 0) throw new AppError("This invoice has payments on it. Reverse them before voiding.", "conflict");
    await tx.update(invoices).set({ status: "void", voidedAt: new Date(), voidReason: reason.slice(0, 200) }).where(eq(invoices.id, inv.id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "fees.invoice_voided", summary: `Voided ${inv.number}: ${reason}`, entityType: "invoice", entityId: inv.id });
  });
}

// ---------- Reading ----------

export type InvoiceFilter = { termId?: string | null; q?: string; classId?: string; status?: string; page?: number; limit?: number };

function invoiceFilters(termId: string, f: InvoiceFilter): SQL[] {
  const where: SQL[] = [eq(invoices.termId, termId)];
  if (f.classId) where.push(eq(invoices.classId, f.classId));
  const today = lagosToday();
  switch (f.status) {
    case "unpaid":
    case "partial":
    case "paid":
    case "void":
      where.push(eq(invoices.status, f.status));
      break;
    case "owing":
      where.push(inArray(invoices.status, ["unpaid", "partial"]));
      break;
    case "overdue":
      where.push(inArray(invoices.status, ["unpaid", "partial"]), lt(invoices.dueOn, today));
      break;
    default:
      where.push(ne(invoices.status, "void"));
  }
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where.push(
      or(
        ilike(invoices.number, like),
        ilike(students.admissionNo, like),
        ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, like),
        ilike(sql`${students.lastName} || ' ' || ${students.firstName}`, like),
      )!,
    );
  }
  return where;
}

export async function listInvoices(db: DB, access: Access, f: InvoiceFilter) {
  requirePermission(access, "fees:view");
  requireFeature(access.plan, "fees_basic");
  const page = Math.max(1, f.page ?? 1);
  return withTenant(db, access.school.id, async (tx) => {
    const { term, options } = await pickTerm(tx, f.termId);
    const where = and(...invoiceFilters(term.id, f));
    const [rows, [{ total }], summary] = await Promise.all([
      tx
        .select({
          invoice: invoices,
          student: { id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo },
          className: classes.name,
        })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .leftJoin(classes, eq(classes.id, invoices.classId))
        .where(where)
        .orderBy(desc(invoices.createdAt), desc(invoices.number))
        .limit(f.limit ?? INVOICE_PAGE_SIZE)
        .offset((page - 1) * (f.limit ?? INVOICE_PAGE_SIZE)),
      tx.select({ total: count() }).from(invoices).innerJoin(students, eq(students.id, invoices.studentId)).where(where),
      termSummary(tx, term.id),
    ]);
    const today = lagosToday();
    return {
      term,
      terms: options,
      total,
      summary,
      rows: rows.map((r) => ({ ...r, balance: balanceOf(r.invoice), overdue: r.invoice.status !== "paid" && r.invoice.status !== "void" && !!r.invoice.dueOn && r.invoice.dueOn < today })),
    };
  });
}

/** Totals across a term's live invoices. */
export async function termSummary(tx: Tx, termId: string) {
  const today = lagosToday();
  const [row] = await tx
    .select({
      invoices: count(),
      expected: sql<number>`coalesce(sum(${invoices.chargesKobo} - ${invoices.discountKobo}), 0)`.mapWith(Number),
      discounts: sql<number>`coalesce(sum(${invoices.discountKobo}), 0)`.mapWith(Number),
      collected: sql<number>`coalesce(sum(${invoices.paidKobo}), 0)`.mapWith(Number),
      outstanding: sql<number>`coalesce(sum(greatest(${invoices.chargesKobo} - ${invoices.discountKobo} - ${invoices.paidKobo}, 0)), 0)`.mapWith(Number),
      paid: sql<number>`count(*) filter (where ${invoices.status} = 'paid')`.mapWith(Number),
      partial: sql<number>`count(*) filter (where ${invoices.status} = 'partial')`.mapWith(Number),
      unpaid: sql<number>`count(*) filter (where ${invoices.status} = 'unpaid')`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${invoices.status} in ('unpaid', 'partial') and ${invoices.dueOn} < ${today})`.mapWith(Number),
    })
    .from(invoices)
    .where(and(eq(invoices.termId, termId), ne(invoices.status, "void")));
  return { ...row, rate: row.expected > 0 ? Math.round((row.collected / row.expected) * 1000) / 10 : 0 };
}

async function primaryContacts(tx: Tx, studentIds: string[]) {
  if (!studentIds.length) return new Map<string, { name: string; phone: string | null; email: string | null }[]>();
  const rows = await tx
    .select({ studentId: studentGuardians.studentId, isPrimary: studentGuardians.isPrimary, name: guardians.name, phone: guardians.phone, email: guardians.email })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(inArray(studentGuardians.studentId, studentIds))
    .orderBy(desc(studentGuardians.isPrimary), asc(guardians.name));
  const out = new Map<string, { name: string; phone: string | null; email: string | null }[]>();
  for (const r of rows) out.set(r.studentId, [...(out.get(r.studentId) ?? []), { name: r.name, phone: r.phone, email: r.email }]);
  return out;
}

export async function getInvoice(db: DB, access: Access, invoiceId: string) {
  requirePermission(access, "fees:view");
  requireFeature(access.plan, "fees_basic");
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ invoice: invoices, student: students, className: classes.name })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .leftJoin(classes, eq(classes.id, invoices.classId))
      .where(eq(invoices.id, invoiceId));
    if (!row) throw new AppError("That invoice wasn't found.", "not_found");
    const { term } = await pickTerm(tx, row.invoice.termId);
    const [lines, paymentRows, contacts, items] = await Promise.all([
      tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.sort), asc(invoiceLines.description)),
      tx
        .select({ payment: payments, recordedByName: users.name })
        .from(payments)
        .leftJoin(memberships, eq(memberships.id, payments.recordedBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(eq(payments.invoiceId, invoiceId))
        .orderBy(desc(payments.paidOn), desc(payments.createdAt)),
      primaryContacts(tx, [row.student.id]),
      tx.select({ id: feeItems.id, name: feeItems.name }).from(feeItems).orderBy(asc(feeItems.sort), asc(feeItems.name)),
    ]);
    return {
      ...row,
      term,
      lines,
      payments: paymentRows.map((p) => ({ ...p.payment, recordedByName: p.recordedByName })),
      contacts: contacts.get(row.student.id) ?? [],
      items,
      balance: balanceOf(row.invoice),
    };
  });
}

/** The Fees tab on a student's profile: their invoices, what they owe, and their discounts. */
export async function getStudentFees(db: DB, access: Access, studentId: string) {
  requirePermission(access, "fees:view");
  requireFeature(access.plan, "fees_basic");
  return withTenant(db, access.school.id, async (tx) => {
    const [rows, schemes, assigned, items, current] = await Promise.all([
      tx.select().from(invoices).where(eq(invoices.studentId, studentId)).orderBy(desc(invoices.createdAt)),
      tx.select().from(discountSchemes).where(eq(discountSchemes.isActive, true)).orderBy(asc(discountSchemes.name)),
      tx.select({ schemeId: studentDiscounts.schemeId }).from(studentDiscounts).where(eq(studentDiscounts.studentId, studentId)),
      tx.select({ id: feeItems.id, name: feeItems.name }).from(feeItems).orderBy(asc(feeItems.sort), asc(feeItems.name)),
      pickTerm(tx).catch(() => null),
    ]);
    const live = rows.filter((r) => r.status !== "void");
    return {
      invoices: rows.map((r) => ({ ...r, balance: balanceOf(r) })),
      owing: live.reduce((n, r) => n + Math.max(0, balanceOf(r)), 0),
      paid: live.reduce((n, r) => n + r.paidKobo, 0),
      schemes,
      assigned: assigned.map((a) => a.schemeId),
      items,
      term: current?.term ?? null,
    };
  });
}

// ---------- Debtors and reminders ----------

export const DEBTOR_PAGE_SIZE = 25;

export async function listDebtors(db: DB, access: Access, f: { termId?: string | null; classId?: string; q?: string; overdue?: boolean; page?: number; limit?: number }) {
  requirePermission(access, "fees:view");
  requireFeature(access.plan, "debtors");
  const page = Math.max(1, f.page ?? 1);
  return withTenant(db, access.school.id, async (tx) => {
    const { term, options } = await pickTerm(tx, f.termId);
    const where = and(...invoiceFilters(term.id, { ...f, status: f.overdue ? "overdue" : "owing" }));
    const balance = sql<number>`${invoices.chargesKobo} - ${invoices.discountKobo} - ${invoices.paidKobo}`;
    const [rows, [agg], summary] = await Promise.all([
      tx
        .select({ invoice: invoices, student: { id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo }, className: classes.name })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .leftJoin(classes, eq(classes.id, invoices.classId))
        .where(where)
        .orderBy(desc(balance), asc(students.lastName))
        .limit(f.limit ?? DEBTOR_PAGE_SIZE)
        .offset((page - 1) * (f.limit ?? DEBTOR_PAGE_SIZE)),
      tx
        .select({ total: count(), owed: sql<number>`coalesce(sum(${balance}), 0)`.mapWith(Number) })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .where(where),
      termSummary(tx, term.id),
    ]);
    const contacts = await primaryContacts(tx, rows.map((r) => r.student.id));
    const today = lagosToday();
    return {
      term,
      terms: options,
      total: agg.total,
      owed: agg.owed,
      summary,
      rows: rows.map((r) => ({
        ...r,
        balance: balanceOf(r.invoice),
        overdue: !!r.invoice.dueOn && r.invoice.dueOn < today,
        contact: contacts.get(r.student.id)?.[0] ?? null,
      })),
    };
  });
}

export type Reminder = { to: string; subject: string; text: string; action?: { label: string; url: string }; fromName?: string };

export function reminderEmail(input: {
  schoolName: string;
  guardianName: string;
  studentName: string;
  invoice: { number: string; title: string; dueOn: string | null };
  balanceKobo: number;
  payUrl: string | null;
  bank?: { name: string; accountNumber: string; accountName: string } | null;
}): Omit<Reminder, "to"> {
  const lines = [
    `Dear ${input.guardianName},`,
    "",
    `This is a friendly reminder that ${input.studentName}'s ${input.invoice.title.toLowerCase()} (${input.invoice.number}) has an outstanding balance of ${formatNaira(input.balanceKobo)}${input.invoice.dueOn ? `, due on ${input.invoice.dueOn}` : ""}.`,
    "",
  ];
  if (input.payUrl) lines.push(`You can view the invoice and pay online here:`, "", input.payUrl, "");
  if (input.bank) lines.push(`Or pay by bank transfer to ${input.bank.accountName}, ${input.bank.name}, ${input.bank.accountNumber}, using ${input.invoice.number} as the reference.`, "");
  lines.push("If you have already paid, please ignore this message, and thank you.", "", input.schoolName);
  return {
    subject: `Fees reminder: ${input.studentName}, ${formatNaira(input.balanceKobo)} outstanding`,
    text: lines.join("\n"),
    action: input.payUrl ? { label: "View and pay", url: input.payUrl } : undefined,
    fromName: input.schoolName,
  };
}

/**
 * Builds reminder emails for owing invoices and stamps them as reminded. Sending happens
 * after the transaction, so a slow mail provider never holds the database.
 */
export async function collectReminders(
  tx: Tx,
  school: { id: string; name: string; planFeatures: string[]; feeSettings: { bank?: { name: string; accountNumber: string; accountName: string } }; paystackSubaccount: string | null },
  opts: { invoiceIds?: string[]; termId?: string; olderThanHours: number; baseUrl: string },
) {
  const cutoff = new Date(Date.now() - opts.olderThanHours * 3_600_000);
  const where: SQL[] = [inArray(invoices.status, ["unpaid", "partial"]), or(sql`${invoices.lastRemindedAt} is null`, lt(invoices.lastRemindedAt, cutoff))!];
  if (opts.invoiceIds) where.push(inArray(invoices.id, opts.invoiceIds.length ? opts.invoiceIds : ["00000000-0000-0000-0000-000000000000"]));
  if (opts.termId) where.push(eq(invoices.termId, opts.termId));
  const rows = await tx.select({ invoice: invoices, firstName: students.firstName, lastName: students.lastName }).from(invoices).innerJoin(students, eq(students.id, invoices.studentId)).where(and(...where));
  const contacts = await primaryContacts(tx, rows.map((r) => r.invoice.studentId));
  const online = school.planFeatures.includes("fees_online") && !!school.paystackSubaccount;
  const comms = await schoolComms(tx, school.id);
  const sms = comms.smsEnabled && !!comms.comms.smsAlerts;
  const emails: Reminder[] = [];
  const reminded: string[] = [];
  const byStudent = new Map<string, (typeof rows)[number]>();
  let noContact = 0;
  for (const r of rows) {
    const people = contacts.get(r.invoice.studentId) ?? [];
    const withEmail = people.filter((c) => c.email);
    if (!withEmail.length && !(sms && people.some((c) => c.phone))) {
      noContact++;
      continue;
    }
    for (const c of withEmail.slice(0, 2)) {
      emails.push({
        to: c.email!,
        ...reminderEmail({
          schoolName: school.name,
          guardianName: c.name,
          studentName: `${r.firstName} ${r.lastName}`,
          invoice: r.invoice,
          balanceKobo: balanceOf(r.invoice),
          payUrl: online ? `${opts.baseUrl}/pay/${r.invoice.payToken}` : null,
          bank: school.feeSettings.bank ?? null,
        }),
      });
    }
    reminded.push(r.invoice.id);
    byStudent.set(r.invoice.studentId, r);
  }
  if (reminded.length) await tx.update(invoices).set({ lastRemindedAt: new Date() }).where(inArray(invoices.id, reminded));
  // Parents on the app see the reminder in Updates; with SMS alerts on, those with a phone get a text.
  const today = new Date().toISOString().slice(0, 10);
  const ngn = (kobo: number) => `NGN ${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
  await notifyGuardians(
    tx,
    comms,
    [...byStudent.keys()],
    (c) => {
      const r = byStudent.get(c.studentId)!;
      const owed = balanceOf(r.invoice);
      const link = online ? ` Pay: ${opts.baseUrl}/pay/${r.invoice.payToken}` : "";
      return {
        kind: "fees",
        title: `${ngn(owed)} outstanding for ${c.studentFirstName}`,
        body: `${r.invoice.title} (${r.invoice.number})${r.invoice.dueOn ? `, due ${r.invoice.dueOn}` : ""}.`,
        link: `/p/children/${c.studentId}?tab=fees`,
        ref: `reminder:${r.invoice.id}:${today}`,
        sms: `${school.name}: ${c.studentFirstName}'s fees balance is ${ngn(owed)}.${link}`,
      };
    },
    { email: false, sms },
  );
  return { emails, reminded: reminded.length, noContact, skipped: (opts.invoiceIds?.length ?? rows.length) - rows.length };
}

export async function prepareFeeReminders(db: DB, access: Access, input: { invoiceIds?: string[]; termId?: string; baseUrl: string }, ip?: string | null) {
  requirePermission(access, "fees:invoice");
  requireFeature(access.plan, "debtors");
  return withTenant(db, access.school.id, async (tx) => {
    const result = await collectReminders(
      tx,
      { id: access.school.id, name: access.school.name, planFeatures: access.plan.features, feeSettings: access.school.feeSettings, paystackSubaccount: access.school.paystackSubaccount },
      { invoiceIds: input.invoiceIds, termId: input.termId, olderThanHours: 20, baseUrl: input.baseUrl },
    );
    if (result.reminded) {
      await recordAudit(tx, access.school.id, actor(access, ip), { action: "fees.reminders_sent", summary: `Sent fee reminders for ${result.reminded} invoice${result.reminded === 1 ? "" : "s"}` });
    }
    return result;
  });
}

/** For the result checker: does this student owe on any of the term's invoices? */
export async function owesForTerm(tx: Tx, studentId: string, termId: string) {
  const [row] = await tx
    .select({ owed: sql<number>`coalesce(sum(greatest(${invoices.chargesKobo} - ${invoices.discountKobo} - ${invoices.paidKobo}, 0)), 0)`.mapWith(Number) })
    .from(invoices)
    .where(and(eq(invoices.studentId, studentId), eq(invoices.termId, termId), inArray(invoices.status, ["unpaid", "partial"])));
  return row.owed;
}

