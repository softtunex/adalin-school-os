import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql, sum } from "drizzle-orm";
import type { DB } from "../db/client";
import { classes, expenses, invoiceLines, invoices, payments, students } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { pickTerm } from "./fees";
import { termSummary } from "./invoices";

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The bursar's dashboard for one term. */
export async function getFeesOverview(db: DB, access: Access, termId?: string | null) {
  requirePermission(access, "fees:view");
  requireFeature(access.plan, "fees_basic");
  return withTenant(db, access.school.id, async (tx) => {
    const { term, options } = await pickTerm(tx, termId);
    const today = lagosToday();
    const since = addDays(today, -29);
    const termInvoice = and(eq(invoices.termId, term.id), ne(invoices.status, "void"));
    const live = eq(payments.status, "succeeded");
    const [summary, byClass, daily, methods, recent, [todayRow]] = await Promise.all([
      termSummary(tx, term.id),
      tx
        .select({
          classId: invoices.classId,
          name: classes.name,
          invoices: count(),
          expected: sql<number>`coalesce(sum(${invoices.chargesKobo} - ${invoices.discountKobo}), 0)`.mapWith(Number),
          collected: sql<number>`coalesce(sum(${invoices.paidKobo}), 0)`.mapWith(Number),
          owing: sql<number>`count(*) filter (where ${invoices.status} in ('unpaid', 'partial'))`.mapWith(Number),
        })
        .from(invoices)
        .leftJoin(classes, eq(classes.id, invoices.classId))
        .where(termInvoice)
        .groupBy(invoices.classId, classes.name)
        .orderBy(asc(classes.name)),
      tx
        .select({ day: payments.paidOn, amount: sum(payments.amountKobo).mapWith(Number) })
        .from(payments)
        .where(and(live, gte(payments.paidOn, since), lte(payments.paidOn, today)))
        .groupBy(payments.paidOn),
      tx
        .select({ method: payments.method, amount: sum(payments.amountKobo).mapWith(Number), n: count() })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(and(live, eq(invoices.termId, term.id)))
        .groupBy(payments.method)
        .orderBy(desc(sum(payments.amountKobo))),
      tx
        .select({ payment: payments, invoiceId: invoices.id, firstName: students.firstName, lastName: students.lastName, className: classes.name })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .innerJoin(students, eq(students.id, payments.studentId))
        .leftJoin(classes, eq(classes.id, invoices.classId))
        .orderBy(desc(payments.createdAt))
        .limit(8),
      tx.select({ amount: sql<number>`coalesce(sum(${payments.amountKobo}), 0)`.mapWith(Number), n: count() }).from(payments).where(and(live, eq(payments.paidOn, today))),
    ]);
    const byDay = new Map(daily.map((d) => [d.day, d.amount]));
    const series = Array.from({ length: 30 }, (_, i) => {
      const day = addDays(since, i);
      return { day, amount: byDay.get(day) ?? 0 };
    });
    return { term, terms: options, summary, byClass, series, methods, recent, today: todayRow };
  });
}

// ---------- Income statement ----------

/**
 * Fee income for a period, split across fee items in proportion to each invoice's lines,
 * against approved expenses by category.
 */
export async function getIncomeStatement(db: DB, access: Access, input: { from: string; to: string }) {
  if (!can(access, "fees:report") && !can(access, "expenses:view")) requirePermission(access, "fees:report");
  requireFeature(access.plan, "expenses");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.from > input.to) throw new AppError("Choose a valid date range.");
  return withTenant(db, access.school.id, async (tx) => {
    const paid = await tx
      .select({ invoiceId: payments.invoiceId, amount: sum(payments.amountKobo).mapWith(Number) })
      .from(payments)
      .where(and(eq(payments.status, "succeeded"), gte(payments.paidOn, input.from), lte(payments.paidOn, input.to)))
      .groupBy(payments.invoiceId);
    const invoiceIds = paid.map((p) => p.invoiceId);
    const lines = invoiceIds.length ? await tx.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, invoiceIds)) : [];
    const byInvoice = new Map<string, typeof lines>();
    for (const l of lines) byInvoice.set(l.invoiceId, [...(byInvoice.get(l.invoiceId) ?? []), l]);

    const income = new Map<string, number>();
    for (const p of paid) {
      const ls = byInvoice.get(p.invoiceId) ?? [];
      const charges = ls.filter((l) => l.kind === "charge");
      const net = charges.reduce((n, l) => n + l.amountKobo, 0) - ls.filter((l) => l.kind === "discount").reduce((n, l) => n + l.amountKobo, 0);
      if (net <= 0 || !charges.length) {
        income.set("Other fees", (income.get("Other fees") ?? 0) + p.amount);
        continue;
      }
      // Share the payment across charges by their weight, in whole naira; the rounding remainder goes to the smallest line.
      const gross = charges.reduce((n, l) => n + l.amountKobo, 0);
      let allocated = 0;
      const sorted = [...charges].sort((a, b) => b.amountKobo - a.amountKobo);
      sorted.forEach((l, i) => {
        const share = i === sorted.length - 1 ? p.amount - allocated : Math.round((p.amount * l.amountKobo) / gross / 100) * 100;
        allocated += share;
        income.set(l.description, (income.get(l.description) ?? 0) + share);
      });
    }
    const spent = await tx
      .select({ category: expenses.category, amount: sum(expenses.amountKobo).mapWith(Number), n: count() })
      .from(expenses)
      .where(and(eq(expenses.status, "approved"), gte(expenses.spentOn, input.from), lte(expenses.spentOn, input.to)))
      .groupBy(expenses.category)
      .orderBy(desc(sum(expenses.amountKobo)));
    const incomeRows = [...income.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
    const totalIncome = incomeRows.reduce((n, r) => n + r.amount, 0);
    const totalExpenses = spent.reduce((n, r) => n + r.amount, 0);
    return { from: input.from, to: input.to, income: incomeRows, expenses: spent, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
  });
}
