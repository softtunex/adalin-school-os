import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { expenses, membershipRoles, memberships, payrollRuns, payslips, roles, schools, staffPay, users, type PayLine, type PayrollSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira, nairaField } from "../money";
import { computePay } from "../payroll/tax";
import { hasFeature } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { notifyUsers } from "./notify";

/*
 * Payroll: a pay profile per staff member, a run per month that turns them into payslips,
 * one-off bonuses and deductions on the draft, approval by the proprietor, then "paid",
 * which records the cost in Expenses. Staff see their own payslips once a run is approved.
 */

export const DEFAULT_PAYROLL: Required<PayrollSettings> = { payDay: 25, paye: true, pension: true, nhf: false, recordExpense: true };

export function payrollSettings(s: PayrollSettings): Required<PayrollSettings> {
  return { ...DEFAULT_PAYROLL, ...s };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requirePayroll(access: Access) {
  if (!hasFeature(access.plan, "payroll")) throw new AppError("Payroll is on the Premium plan.", "upgrade");
  requirePermission(access, "expenses:payroll");
}

export function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ---------- Settings ----------

export const payrollSettingsSchema = z.object({
  payDay: z.number().int().min(1).max(31),
  paye: z.boolean(),
  pension: z.boolean(),
  nhf: z.boolean(),
  recordExpense: z.boolean(),
});

export async function savePayrollSettings(db: DB, access: Access, input: z.infer<typeof payrollSettingsSchema>, ip?: string | null) {
  requirePayroll(access);
  await db.update(schools).set({ payrollSettings: input }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) => recordAudit(tx, access.school.id, actor(access, ip), { action: "payroll.settings", summary: `Payroll settings saved (pay day ${input.payDay})` }));
}

// ---------- Pay profiles ----------

async function activeStaff(tx: Tx) {
  const rows = await tx
    .select({ membershipId: memberships.id, name: users.name, jobTitle: memberships.jobTitle, role: roles.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff")));
  const by = new Map<string, { membershipId: string; name: string; jobTitle: string }>();
  for (const r of rows) if (!by.has(r.membershipId)) by.set(r.membershipId, { membershipId: r.membershipId, name: r.name, jobTitle: r.jobTitle ?? r.role });
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listPayProfiles(db: DB, access: Access) {
  requirePayroll(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [staff, profiles] = await Promise.all([activeStaff(tx), tx.select().from(staffPay)]);
    const rows = staff.map((s) => {
      const p = profiles.find((x) => x.membershipId === s.membershipId) ?? null;
      const pay = p ? computePay({ basic: p.basicKobo, allowances: p.allowances, extras: [], deductions: p.deductions, pension: p.pension, nhf: p.nhf, paye: p.paye, annualRent: p.annualRentKobo }) : null;
      return { ...s, profile: p, pay };
    });
    const set = rows.filter((r) => r.profile && r.profile.basicKobo > 0);
    return {
      rows,
      stats: {
        staff: rows.length,
        onPayroll: set.length,
        monthlyGross: set.reduce((t, r) => t + (r.pay?.gross ?? 0), 0),
        monthlyNet: set.reduce((t, r) => t + (r.pay?.net ?? 0), 0),
        missingBank: set.filter((r) => !r.profile?.accountNumber).length,
      },
      settings: payrollSettings(access.school.payrollSettings),
    };
  });
}

const payLines = z
  .array(z.object({ name: z.string().trim().min(1, "Name each line.").max(60), kobo: z.number().int().min(0) }))
  .max(12)
  .default([]);

export const payProfileSchema = z.object({
  membershipId: z.string().uuid(),
  basic: nairaField("basic salary", { allowZero: true }),
  allowances: payLines,
  deductions: payLines,
  pension: z.boolean(),
  nhf: z.boolean(),
  paye: z.boolean(),
  annualRent: z.number().int().min(0).default(0),
  bankName: z.string().trim().max(80).default(""),
  accountNumber: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || /^\d{10}$/.test(v), "Account numbers are 10 digits."),
  accountName: z.string().trim().max(120).default(""),
});

export async function savePayProfile(db: DB, access: Access, input: z.infer<typeof payProfileSchema>, ip?: string | null) {
  requirePayroll(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [m] = await tx.select({ name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, input.membershipId));
    if (!m) throw new AppError("That staff member wasn't found.", "not_found");
    const values = {
      basicKobo: input.basic,
      allowances: input.allowances.filter((l) => l.kobo > 0),
      deductions: input.deductions.filter((l) => l.kobo > 0),
      pension: input.pension,
      nhf: input.nhf,
      paye: input.paye,
      annualRentKobo: input.annualRent,
      bankName: input.bankName || null,
      accountNumber: input.accountNumber || null,
      accountName: input.accountName || null,
      updatedAt: new Date(),
    };
    await tx
      .insert(staffPay)
      .values({ schoolId: access.school.id, membershipId: input.membershipId, ...values })
      .onConflictDoUpdate({ target: staffPay.membershipId, set: values });
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "payroll.profile", summary: `Set ${m.name}'s pay (basic ${formatNaira(input.basic)})`, entityType: "membership", entityId: input.membershipId });
  });
}

// ---------- Runs ----------

function slipFrom(p: typeof staffPay.$inferSelect, extras: PayLine[], deductions: PayLine[]) {
  const pay = computePay({ basic: p.basicKobo, allowances: p.allowances, extras, deductions, pension: p.pension, nhf: p.nhf, paye: p.paye, annualRent: p.annualRentKobo });
  return {
    basicKobo: p.basicKobo,
    allowances: p.allowances,
    extras,
    deductions,
    grossKobo: pay.gross,
    pensionKobo: pay.pension,
    employerPensionKobo: pay.employerPension,
    nhfKobo: pay.nhf,
    payeKobo: pay.paye,
    netKobo: pay.net,
    settings: { pension: p.pension, nhf: p.nhf, paye: p.paye, annualRentKobo: p.annualRentKobo },
  };
}

async function refreshTotals(tx: Tx, runId: string) {
  const slips = await tx.select().from(payslips).where(eq(payslips.runId, runId));
  const t = (k: "grossKobo" | "netKobo" | "payeKobo" | "pensionKobo" | "employerPensionKobo" | "nhfKobo") => slips.reduce((s, x) => s + x[k], 0);
  await tx
    .update(payrollRuns)
    .set({ grossKobo: t("grossKobo"), netKobo: t("netKobo"), payeKobo: t("payeKobo"), pensionKobo: t("pensionKobo"), employerPensionKobo: t("employerPensionKobo"), nhfKobo: t("nhfKobo") })
    .where(eq(payrollRuns.id, runId));
}

async function fillRun(tx: Tx, schoolId: string, runId: string) {
  const [staff, profiles, existing] = await Promise.all([activeStaff(tx), tx.select().from(staffPay), tx.select().from(payslips).where(eq(payslips.runId, runId))]);
  let n = 0;
  for (const s of staff) {
    const p = profiles.find((x) => x.membershipId === s.membershipId);
    if (!p || p.basicKobo <= 0) continue;
    const prev = existing.find((e) => e.membershipId === s.membershipId);
    // Keep any one-off lines already added; standing deductions come from the profile.
    const slip = slipFrom(p, prev?.extras ?? [], [...p.deductions, ...(prev?.deductions.filter((d) => !p.deductions.some((x) => x.name === d.name)) ?? [])]);
    const base = { name: s.name, jobTitle: s.jobTitle, bankName: p.bankName, accountNumber: p.accountNumber, accountName: p.accountName, ...slip };
    if (prev) await tx.update(payslips).set(base).where(eq(payslips.id, prev.id));
    else await tx.insert(payslips).values({ schoolId, runId, membershipId: s.membershipId, ...base });
    n++;
  }
  const keep = new Set(staff.map((s) => s.membershipId));
  const gone = existing.filter((e) => !keep.has(e.membershipId) || !profiles.some((p) => p.membershipId === e.membershipId && p.basicKobo > 0)).map((e) => e.id);
  if (gone.length) await tx.delete(payslips).where(inArray(payslips.id, gone));
  await refreshTotals(tx, runId);
  return n;
}

export async function createRun(db: DB, access: Access, month: string, ip?: string | null) {
  requirePayroll(access);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError("Choose a month.", "invalid");
  const today = lagosToday();
  const next = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  if (month > next.toISOString().slice(0, 7)) throw new AppError("You can prepare this month's or next month's payroll, not further ahead.", "invalid");
  return withTenant(db, access.school.id, async (tx) => {
    const [clash] = await tx.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.month, month));
    if (clash) throw new AppError(`There's already a payroll for ${monthLabel(month)}.`, "conflict");
    const [run] = await tx.insert(payrollRuns).values({ schoolId: access.school.id, month, createdBy: access.membershipId }).returning();
    const n = await fillRun(tx, access.school.id, run.id);
    if (n === 0) throw new AppError("Nobody has a salary set yet. Add pay details for your staff first.", "invalid");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "payroll.created", summary: `Prepared ${monthLabel(month)} payroll for ${n} staff`, entityType: "payroll", entityId: run.id });
    return run;
  });
}

async function loadRun(tx: Tx, id: string) {
  const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id));
  if (!run) throw new AppError("That payroll wasn't found.", "not_found");
  return run;
}

export async function refreshRun(db: DB, access: Access, id: string) {
  requirePayroll(access);
  return withTenant(db, access.school.id, async (tx) => {
    const run = await loadRun(tx, id);
    if (run.status !== "draft") throw new AppError("Only a draft payroll can be refreshed.", "conflict");
    return fillRun(tx, access.school.id, id);
  });
}

export async function listRuns(db: DB, access: Access) {
  requirePayroll(access);
  return withTenant(db, access.school.id, async (tx) => {
    const runs = await tx.select().from(payrollRuns).orderBy(desc(payrollRuns.month)).limit(36);
    const year = lagosToday().slice(0, 4);
    const thisYear = runs.filter((r) => r.month.startsWith(year) && r.status === "paid");
    return {
      runs,
      year: {
        net: thisYear.reduce((t, r) => t + r.netKobo, 0),
        paye: thisYear.reduce((t, r) => t + r.payeKobo, 0),
        pension: thisYear.reduce((t, r) => t + r.pensionKobo + r.employerPensionKobo, 0),
        cost: thisYear.reduce((t, r) => t + r.grossKobo + r.employerPensionKobo, 0),
      },
    };
  });
}

export async function getRun(db: DB, access: Access, id: string) {
  requirePayroll(access);
  return withTenant(db, access.school.id, async (tx) => {
    const run = await loadRun(tx, id);
    const slips = await tx.select().from(payslips).where(eq(payslips.runId, id)).orderBy(asc(payslips.name));
    const people = [run.createdBy, run.approvedBy].filter((x): x is string => !!x);
    const names = people.length ? await tx.select({ id: memberships.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(inArray(memberships.id, people)) : [];
    return { run, slips, preparedBy: names.find((n) => n.id === run.createdBy)?.name ?? null, approvedBy: names.find((n) => n.id === run.approvedBy)?.name ?? null };
  });
}

export const slipEditSchema = z.object({ payslipId: z.string().uuid(), extras: payLines, deductions: payLines });

/** One-off bonuses and deductions on a draft payslip. */
export async function editPayslip(db: DB, access: Access, input: z.infer<typeof slipEditSchema>) {
  requirePayroll(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [slip] = await tx.select().from(payslips).where(eq(payslips.id, input.payslipId));
    if (!slip) throw new AppError("That payslip wasn't found.", "not_found");
    const run = await loadRun(tx, slip.runId);
    if (run.status !== "draft") throw new AppError("This payroll has been approved and can't change.", "conflict");
    const pay = computePay({
      basic: slip.basicKobo,
      allowances: slip.allowances,
      extras: input.extras.filter((l) => l.kobo > 0),
      deductions: input.deductions.filter((l) => l.kobo > 0),
      pension: slip.settings.pension,
      nhf: slip.settings.nhf,
      paye: slip.settings.paye,
      annualRent: slip.settings.annualRentKobo,
    });
    if (pay.net < 0) throw new AppError("Deductions can't be more than the pay.", "invalid");
    await tx
      .update(payslips)
      .set({ extras: input.extras.filter((l) => l.kobo > 0), deductions: input.deductions.filter((l) => l.kobo > 0), grossKobo: pay.gross, pensionKobo: pay.pension, employerPensionKobo: pay.employerPension, nhfKobo: pay.nhf, payeKobo: pay.paye, netKobo: pay.net })
      .where(eq(payslips.id, slip.id));
    await refreshTotals(tx, run.id);
  });
}

export async function approveRun(db: DB, access: Access, id: string, ip?: string | null) {
  requirePayroll(access);
  if (!can(access, "school:billing")) throw new AppError("Only the proprietor approves payroll.", "forbidden");
  await withTenant(db, access.school.id, async (tx) => {
    const run = await loadRun(tx, id);
    if (run.status !== "draft") throw new AppError("This payroll is already approved.", "conflict");
    await tx.update(payrollRuns).set({ status: "approved", approvedBy: access.membershipId, approvedAt: new Date() }).where(eq(payrollRuns.id, id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "payroll.approved", summary: `Approved ${monthLabel(run.month)} payroll (${formatNaira(run.netKobo)} net)`, entityType: "payroll", entityId: id });
  });
}

/** Marks a run paid, records it as an expense, and tells staff their payslip is ready. */
export async function markRunPaid(db: DB, access: Access, id: string, ip?: string | null) {
  requirePayroll(access);
  const s = payrollSettings(access.school.payrollSettings);
  await withTenant(db, access.school.id, async (tx) => {
    const run = await loadRun(tx, id);
    if (run.status === "draft") throw new AppError("Approve the payroll first.", "conflict");
    if (run.status === "paid") throw new AppError("Already marked as paid.", "conflict");
    let expenseId: string | null = null;
    if (s.recordExpense && hasFeature(access.plan, "expenses")) {
      const [e] = await tx
        .insert(expenses)
        .values({
          schoolId: access.school.id,
          spentOn: lagosToday(),
          category: "Salaries and wages",
          description: `Payroll for ${monthLabel(run.month)} (net pay, PAYE, pension and NHF)`,
          amountKobo: run.grossKobo + run.employerPensionKobo,
          method: "transfer",
          reference: `PAYROLL-${run.month}`,
          status: "approved",
          recordedBy: access.membershipId,
          decidedBy: access.membershipId,
          decidedAt: new Date(),
        })
        .returning();
      expenseId = e.id;
    }
    await tx.update(payrollRuns).set({ status: "paid", paidAt: new Date(), expenseId }).where(eq(payrollRuns.id, id));
    const staffUsers = await tx
      .select({ userId: memberships.userId })
      .from(payslips)
      .innerJoin(memberships, eq(memberships.id, payslips.membershipId))
      .where(eq(payslips.runId, id));
    await notifyUsers(tx, access.school.id, staffUsers.map((u) => u.userId), {
      kind: "payslip",
      title: `Your ${monthLabel(run.month)} payslip is ready`,
      body: "See it under Attendance and leave.",
      link: `/s/${access.school.slug}/hr?tab=pay`,
      ref: `payslip:${id}`,
    });
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "payroll.paid", summary: `Marked ${monthLabel(run.month)} payroll paid`, entityType: "payroll", entityId: id });
  });
}

export async function deleteRun(db: DB, access: Access, id: string, ip?: string | null) {
  requirePayroll(access);
  await withTenant(db, access.school.id, async (tx) => {
    const run = await loadRun(tx, id);
    if (run.status !== "draft") throw new AppError("Only a draft payroll can be deleted.", "conflict");
    await tx.delete(payrollRuns).where(eq(payrollRuns.id, id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "payroll.deleted", summary: `Deleted the ${monthLabel(run.month)} draft payroll`, entityType: "payroll", entityId: id });
  });
}

// ---------- Staff ----------

/** A staff member's own payslips, once approved. */
export async function myPayslips(db: DB, access: Access) {
  if (!hasFeature(access.plan, "payroll") || !access.isStaff) return [];
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({ slip: payslips, month: payrollRuns.month, status: payrollRuns.status })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.membershipId, access.membershipId), inArray(payrollRuns.status, ["approved", "paid"])))
      .orderBy(desc(payrollRuns.month)),
  );
}

/** One payslip, for its owner or the payroll team. */
export async function getPayslip(db: DB, access: Access, id: string) {
  if (!hasFeature(access.plan, "payroll")) throw new AppError("Payroll is on the Premium plan.", "upgrade");
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.select({ slip: payslips, run: payrollRuns }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).where(eq(payslips.id, id));
    if (!row) throw new AppError("That payslip wasn't found.", "not_found");
    const own = row.slip.membershipId === access.membershipId && row.run.status !== "draft";
    if (!own && !can(access, "expenses:payroll")) throw new AppError("That payslip wasn't found.", "not_found");
    return row;
  });
}
