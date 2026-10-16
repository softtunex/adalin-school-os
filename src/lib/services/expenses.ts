import { and, count, desc, eq, gte, ilike, lte, or, sql, sum, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { EXPENSE_METHODS, expenses, memberships, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira, nairaField } from "../money";
import { requireFeature } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";

const actor = (access: Access, ip?: string | null) => ({ userId: access.user.id, name: access.user.name, ip });

export const EXPENSE_PAGE_SIZE = 25;

const optional = (max: number) => z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), z.string().trim().max(max).nullable().optional());

export const expenseSchema = z.object({
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date."),
  category: z.string().trim().min(2, "Choose a category.").max(60),
  description: z.string().trim().min(3, "Describe what it was for.").max(200),
  amount: nairaField("amount"),
  method: z.enum(EXPENSE_METHODS, { message: "Choose how it was paid." }),
  vendor: optional(120),
  reference: optional(80),
});

/** Records an expense. Someone who can approve expenses has theirs approved straight away. */
export async function createExpense(db: DB, access: Access, input: z.infer<typeof expenseSchema>, extra: { receiptUrl?: string | null } = {}, ip?: string | null) {
  requirePermission(access, "expenses:create");
  requireFeature(access.plan, "expenses");
  if (input.spentOn > lagosToday()) throw new AppError("The date can't be in the future.");
  const approved = can(access, "expenses:approve");
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({
        schoolId: access.school.id,
        spentOn: input.spentOn,
        category: input.category,
        description: input.description,
        amountKobo: input.amount,
        method: input.method,
        vendor: input.vendor ?? null,
        reference: input.reference ?? null,
        receiptUrl: extra.receiptUrl ?? null,
        status: approved ? "approved" : "pending",
        recordedBy: access.membershipId,
        decidedBy: approved ? access.membershipId : null,
        decidedAt: approved ? new Date() : null,
      })
      .returning();
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "expenses.created",
      summary: `Recorded ${formatNaira(input.amount)} for ${input.description} (${input.category})${approved ? "" : ", awaiting approval"}`,
      entityType: "expense",
      entityId: row.id,
    });
    return row;
  });
}

export async function decideExpense(db: DB, access: Access, input: { expenseId: string; approve: boolean; reason?: string }, ip?: string | null) {
  requirePermission(access, "expenses:approve");
  requireFeature(access.plan, "expenses");
  if (!input.approve && (input.reason?.trim().length ?? 0) < 3) throw new AppError("Say why you're rejecting it.");
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.select().from(expenses).where(eq(expenses.id, input.expenseId));
    if (!row) throw new AppError("That expense wasn't found.", "not_found");
    if (row.status !== "pending") throw new AppError("This expense has already been decided.", "conflict");
    await tx
      .update(expenses)
      .set({ status: input.approve ? "approved" : "rejected", decidedBy: access.membershipId, decidedAt: new Date(), rejectionReason: input.approve ? null : input.reason!.trim().slice(0, 300) })
      .where(eq(expenses.id, row.id));
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.approve ? "expenses.approved" : "expenses.rejected",
      summary: `${input.approve ? "Approved" : "Rejected"} ${formatNaira(row.amountKobo)} for ${row.description}`,
      entityType: "expense",
      entityId: row.id,
    });
  });
}

/** Pending expenses can be withdrawn by whoever recorded them; approvers can remove any. */
export async function deleteExpense(db: DB, access: Access, expenseId: string, ip?: string | null) {
  requirePermission(access, "expenses:create");
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.select().from(expenses).where(eq(expenses.id, expenseId));
    if (!row) throw new AppError("That expense wasn't found.", "not_found");
    const own = row.recordedBy === access.membershipId && row.status === "pending";
    if (!own && !can(access, "expenses:approve")) throw new AppError("Only an approver can remove this expense.", "forbidden");
    await tx.delete(expenses).where(eq(expenses.id, row.id));
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "expenses.deleted",
      summary: `Deleted the expense ${row.description} (${formatNaira(row.amountKobo)})`,
      entityType: "expense",
      entityId: row.id,
    });
  });
}

export async function listExpenses(db: DB, access: Access, f: { from?: string; to?: string; category?: string; status?: string; q?: string; page?: number }) {
  requirePermission(access, "expenses:view");
  requireFeature(access.plan, "expenses");
  const page = Math.max(1, f.page ?? 1);
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [];
    if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) where.push(gte(expenses.spentOn, f.from));
    if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) where.push(lte(expenses.spentOn, f.to));
    if (f.category) where.push(eq(expenses.category, f.category));
    if (f.status === "pending" || f.status === "approved" || f.status === "rejected") where.push(eq(expenses.status, f.status));
    const q = f.q?.trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      where.push(or(ilike(expenses.description, like), ilike(expenses.vendor, like), ilike(expenses.reference, like))!);
    }
    const cond = where.length ? and(...where) : undefined;
    const monthStart = `${lagosToday().slice(0, 8)}01`;
    const [rows, [agg], [month], [pending], categories] = await Promise.all([
      tx
        .select({ expense: expenses, recordedByName: users.name })
        .from(expenses)
        .leftJoin(memberships, eq(memberships.id, expenses.recordedBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(cond)
        .orderBy(desc(expenses.spentOn), desc(expenses.createdAt))
        .limit(EXPENSE_PAGE_SIZE)
        .offset((page - 1) * EXPENSE_PAGE_SIZE),
      tx.select({ total: count(), amount: sql<number>`coalesce(sum(${expenses.amountKobo}), 0)`.mapWith(Number) }).from(expenses).where(cond),
      tx.select({ amount: sql<number>`coalesce(sum(${expenses.amountKobo}), 0)`.mapWith(Number) }).from(expenses).where(and(eq(expenses.status, "approved"), gte(expenses.spentOn, monthStart))),
      tx.select({ n: count(), amount: sql<number>`coalesce(sum(${expenses.amountKobo}), 0)`.mapWith(Number) }).from(expenses).where(eq(expenses.status, "pending")),
      tx
        .select({ category: expenses.category, amount: sum(expenses.amountKobo).mapWith(Number) })
        .from(expenses)
        .where(and(eq(expenses.status, "approved"), gte(expenses.spentOn, monthStart)))
        .groupBy(expenses.category)
        .orderBy(desc(sum(expenses.amountKobo)))
        .limit(5),
    ]);
    return { rows, total: agg.total, amount: agg.amount, thisMonth: month.amount, pending, topCategories: categories };
  });
}
