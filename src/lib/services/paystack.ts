import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { classes, invoiceLines, invoices, paymentIntents, plans, schools, students, type FeeSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira, nairaField } from "../money";
import { hasFeature, type PlanRow } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { pickTerm } from "./fees";
import { balanceOf } from "./invoices";
import { settleIntent } from "./payments";

/*
 * Paystack, with school fees settling into each school's own bank account through a
 * subaccount. Without PAYSTACK_SECRET_KEY, outside production, everything runs in test
 * mode: a local checkout page stands in for Paystack so the flow can be tried end to end.
 */

const API = "https://api.paystack.co";
export const MIN_ONLINE_KOBO = 100_00;

export function paystackMode(): "live" | "test" | "off" {
  if (process.env.PAYSTACK_SECRET_KEY) return "live";
  return process.env.NODE_ENV === "production" && process.env.PAYMENTS_TEST_MODE !== "1" ? "off" : "test";
}

async function paystack<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new AppError("Online payment isn't switched on yet.", "conflict");
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !json?.status) {
    console.error("[paystack]", path, res.status, json?.message);
    throw new AppError(json?.message ? `Paystack: ${json.message}` : "Paystack didn't respond. Please try again.", "conflict");
  }
  return json.data as T;
}

let bankCache: { at: number; banks: { name: string; code: string }[] } | null = null;

/** Nigerian banks for the settlement account picker. */
export async function listBanks(): Promise<{ name: string; code: string }[]> {
  if (paystackMode() !== "live") return [];
  if (bankCache && Date.now() - bankCache.at < 86_400_000) return bankCache.banks;
  const data = await paystack<{ name: string; code: string; active: boolean }[]>("/bank?country=nigeria&perPage=200");
  const banks = data.filter((b) => b.active).map((b) => ({ name: b.name, code: b.code }));
  bankCache = { at: Date.now(), banks };
  return banks;
}

export const settlementSchema = z.object({
  bankName: z.string().trim().min(2, "Choose the bank.").max(80),
  bankCode: z.string().trim().max(10).optional(),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Account numbers are 10 digits."),
  accountName: z.string().trim().max(120).optional(),
});

/**
 * Saves the account school fees settle into. Live mode confirms the account name with the
 * bank and creates (or updates) the school's Paystack subaccount. Owner only.
 */
export async function saveSettlementAccount(db: DB, access: Access, input: z.infer<typeof settlementSchema>, ip?: string | null) {
  requirePermission(access, "school:billing");
  const mode = paystackMode();
  let accountName = input.accountName?.trim() ?? "";
  let subaccount = access.school.paystackSubaccount;
  if (mode === "live") {
    if (!input.bankCode) throw new AppError("Choose the bank from the list.");
    const resolved = await paystack<{ account_name: string }>(`/bank/resolve?account_number=${input.accountNumber}&bank_code=${encodeURIComponent(input.bankCode)}`);
    accountName = resolved.account_name;
    const body = {
      business_name: access.school.name.slice(0, 100),
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: Number(process.env.PAYSTACK_PLATFORM_PERCENT ?? 0),
      primary_contact_email: access.school.email ?? undefined,
    };
    const result = subaccount
      ? await paystack<{ subaccount_code: string }>(`/subaccount/${subaccount}`, { method: "PUT", body })
      : await paystack<{ subaccount_code: string }>("/subaccount", { method: "POST", body });
    subaccount = result.subaccount_code;
  } else {
    if (accountName.length < 3) throw new AppError("Enter the account name exactly as the bank has it.");
    subaccount = mode === "test" ? "ACCT_test" : null;
  }
  const feeSettings: FeeSettings = { ...access.school.feeSettings, bank: { name: input.bankName, code: input.bankCode, accountNumber: input.accountNumber, accountName } };
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(schools).set({ feeSettings, paystackSubaccount: subaccount }).where(eq(schools.id, access.school.id));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "fees.settlement_account",
      summary: `Set the fees account to ${accountName}, ${input.bankName} ••••${input.accountNumber.slice(-4)}`,
    });
  });
  return { accountName };
}

export const feeSettingsSchema = z.object({
  withholdResults: z.boolean(),
  autoReminders: z.boolean(),
  reminderEveryDays: z.coerce.number().int().min(3).max(30),
  invoiceNote: z.string().trim().max(300).optional(),
});

export async function saveFeeSettings(db: DB, access: Access, input: z.infer<typeof feeSettingsSchema>, ip?: string | null) {
  requirePermission(access, "fees:manage");
  const feeSettings: FeeSettings = { ...access.school.feeSettings, ...input, invoiceNote: input.invoiceNote || undefined };
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(schools).set({ feeSettings }).where(eq(schools.id, access.school.id));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "fees.settings",
      summary: `Updated fee settings (results ${input.withholdResults ? "withheld" : "not withheld"} for debtors, reminders ${input.autoReminders ? `every ${input.reminderEveryDays} days` : "off"})`,
    });
  });
}

// ---------- The public pay page ----------

/** What a parent sees on the pay link. The token is the only key, so it reveals no more than the invoice. */
export async function getPayPage(db: DB, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [found] = await db.select({ schoolId: invoices.schoolId }).from(invoices).where(eq(invoices.payToken, token));
  if (!found) return null;
  const [school] = await db.select({ school: schools, plan: plans }).from(schools).innerJoin(plans, eq(plans.key, schools.planKey)).where(eq(schools.id, found.schoolId));
  return withTenant(db, found.schoolId, async (tx) => {
    const [row] = await tx
      .select({ invoice: invoices, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo, className: classes.name })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .leftJoin(classes, eq(classes.id, invoices.classId))
      .where(eq(invoices.payToken, token));
    const { term } = await pickTerm(tx, row.invoice.termId);
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, row.invoice.id)).orderBy(invoiceLines.sort);
    const mode = paystackMode();
    const canPayOnline = mode !== "off" && hasFeature(school.plan as PlanRow, "fees_online") && !!school.school.paystackSubaccount && row.invoice.status !== "void" && balanceOf(row.invoice) > 0;
    return {
      school: { name: school.school.name, logoUrl: school.school.logoUrl, phone: school.school.phone, email: school.school.email, bank: school.school.feeSettings.bank ?? null, note: school.school.feeSettings.invoiceNote ?? null },
      invoice: row.invoice,
      student: { name: `${row.firstName} ${row.lastName}`, admissionNo: row.admissionNo, className: row.className },
      term,
      lines,
      balance: balanceOf(row.invoice),
      canPayOnline,
      mode,
    };
  });
}

export const startPaymentSchema = z.object({
  token: z.string().min(16).max(64),
  email: z.string().trim().toLowerCase().email("Enter your email address for the receipt."),
  amount: nairaField("amount"),
});

/** Creates a payment intent and returns where to send the parent: Paystack checkout, or the local test checkout. */
export async function startOnlinePayment(db: DB, input: z.infer<typeof startPaymentSchema>, baseUrl: string) {
  const page = await getPayPage(db, input.token);
  if (!page) throw new AppError("This payment link isn't valid.", "not_found");
  if (!page.canPayOnline) throw new AppError("Online payment isn't available for this invoice.", "conflict");
  if (input.amount > page.balance) throw new AppError(`That's more than the balance of ${formatNaira(page.balance)}.`);
  if (input.amount < Math.min(MIN_ONLINE_KOBO, page.balance)) throw new AppError(`The smallest online payment is ${formatNaira(MIN_ONLINE_KOBO)}.`);
  const reference = `sos_${randomBytes(12).toString("hex")}`;
  const schoolId = page.invoice.schoolId;
  await withTenant(db, schoolId, (tx) => tx.insert(paymentIntents).values({ schoolId, invoiceId: page.invoice.id, reference, amountKobo: input.amount, email: input.email }));
  if (page.mode === "test") return { url: `${baseUrl}/pay/${input.token}/test-checkout?reference=${reference}` };

  const [school] = await db.select({ subaccount: schools.paystackSubaccount }).from(schools).where(eq(schools.id, schoolId));
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amount,
      currency: "NGN",
      reference,
      subaccount: school.subaccount,
      bearer: "subaccount",
      callback_url: `${baseUrl}/pay/${input.token}/callback`,
      metadata: { school_id: schoolId, invoice_id: page.invoice.id, invoice_number: page.invoice.number, student: page.student.name },
    },
  });
  return { url: data.authorization_url };
}

/** Finds which school a reference belongs to (references are unique across the platform). */
async function intentSchool(db: DB, reference: string) {
  if (!/^sos_[0-9a-f]{24}$/.test(reference)) return null;
  const [row] = await db.select({ schoolId: paymentIntents.schoolId, amountKobo: paymentIntents.amountKobo, status: paymentIntents.status }).from(paymentIntents).where(eq(paymentIntents.reference, reference));
  return row ?? null;
}

/** Confirms a payment with Paystack (or the test checkout) and records it. Safe to call more than once. */
export async function confirmOnlinePayment(db: DB, reference: string, opts: { testApproved?: boolean } = {}) {
  const intent = await intentSchool(db, reference);
  if (!intent) throw new AppError("We couldn't find that payment.", "not_found");
  if (intent.status === "succeeded") return { ok: true as const };
  if (paystackMode() === "test") {
    if (!opts.testApproved) return { ok: false as const, message: "The payment was cancelled." };
    await withTenant(db, intent.schoolId, (tx) => settleIntent(tx, intent.schoolId, reference, { amountKobo: intent.amountKobo, paidAt: new Date(), channel: "test card" }));
    return { ok: true as const };
  }
  const data = await paystack<{ status: string; amount: number; currency: string; paid_at: string; channel: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (data.status !== "success" || data.currency !== "NGN") return { ok: false as const, message: "The payment didn't go through. You haven't been charged." };
  await withTenant(db, intent.schoolId, (tx) => settleIntent(tx, intent.schoolId, reference, { amountKobo: data.amount, paidAt: new Date(data.paid_at), channel: data.channel }));
  return { ok: true as const };
}

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Handles Paystack's charge.success webhook. The signed payload is trusted; amounts are still checked against the intent. */
export async function handlePaystackEvent(db: DB, event: { event?: string; data?: { reference?: string; amount?: number; currency?: string; paid_at?: string; channel?: string } }) {
  if (event.event !== "charge.success" || !event.data?.reference) return { handled: false };
  const intent = await intentSchool(db, event.data.reference);
  if (!intent) return { handled: false };
  if (event.data.currency !== "NGN" || typeof event.data.amount !== "number") return { handled: false };
  const { amount, paid_at, channel } = event.data;
  await withTenant(db, intent.schoolId, (tx) => settleIntent(tx, intent.schoolId, event.data!.reference!, { amountKobo: amount, paidAt: paid_at ? new Date(paid_at) : new Date(), channel }));
  return { handled: true };
}
