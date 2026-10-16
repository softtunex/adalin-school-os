"use server";

import { revalidatePath } from "next/cache";
import { appUrl, requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { sendEmail } from "@/lib/mail";
import { deliverSoon } from "@/lib/deliver";
import { formatNaira } from "@/lib/money";
import {
  copyFeeStructure,
  deleteDiscountScheme,
  deleteFeeItem,
  discountSchemeSchema,
  feeItemSchema,
  feeStructureSchema,
  saveDiscountScheme,
  saveFeeItem,
  saveFeeStructure,
  setStudentDiscounts,
} from "@/lib/services/fees";
import {
  addInvoiceLine,
  addLineSchema,
  createOtherInvoice,
  generateInvoicesSchema,
  generateTermInvoices,
  otherInvoiceSchema,
  prepareFeeReminders,
  removeInvoiceLine,
  voidInvoice,
} from "@/lib/services/invoices";
import { recordPayment, recordPaymentSchema, reversePayment } from "@/lib/services/payments";
import { feeSettingsSchema, saveFeeSettings, saveSettlementAccount, settlementSchema } from "@/lib/services/paystack";
import { fieldErrors } from "@/lib/validation";

type Ctx = { access: Awaited<ReturnType<typeof requireAccess>>; ip: string | null };

async function run(slug: string, fn: (ctx: Ctx) => Promise<string | FormState>): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    const { ip } = await requestMeta();
    const out = await fn({ access, ip });
    revalidatePath(`/s/${slug}`, "layout");
    return typeof out === "string" ? { success: out } : out;
  } catch (error) {
    return { error: userMessage(error) };
  }
}

// ---------- Structure ----------

export async function saveFeeItemAction(slug: string, input: { id?: string; name: string; isOptional: boolean }) {
  const parsed = feeItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fee item." };
  return run(slug, async ({ access, ip }) => {
    await saveFeeItem(getDb(), access, parsed.data, ip);
    return parsed.data.id ? "Fee item updated." : `${parsed.data.name} added.`;
  });
}

export async function deleteFeeItemAction(slug: string, itemId: string) {
  return run(slug, async ({ access, ip }) => {
    await deleteFeeItem(getDb(), access, itemId, ip);
    return "Fee item removed.";
  });
}

export async function saveStructureAction(slug: string, input: { termId: string; amounts: { levelId: string; itemId: string; amount: string }[] }) {
  const parsed = feeStructureSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the amounts." };
  return run(slug, async ({ access, ip }) => {
    await saveFeeStructure(getDb(), access, parsed.data, ip);
    return "Fee structure saved.";
  });
}

export async function copyStructureAction(slug: string, fromTermId: string, toTermId: string) {
  return run(slug, async ({ access, ip }) => {
    const n = await copyFeeStructure(getDb(), access, { fromTermId, toTermId }, ip);
    return `Copied ${n} amount${n === 1 ? "" : "s"}.`;
  });
}

// ---------- Discounts ----------

export async function saveDiscountAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["id", "name", "kind", "percent", "amount", "itemId"]);
  const parsed = discountSchemeSchema.safeParse({ ...values, id: values.id || undefined });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const out = await run(slug, async ({ access, ip }) => {
    await saveDiscountScheme(getDb(), access, parsed.data, ip);
    return values.id ? "Discount updated." : `${parsed.data.name} created.`;
  });
  return out.error ? { ...out, values } : out;
}

export async function deleteDiscountAction(slug: string, schemeId: string) {
  return run(slug, async ({ access, ip }) => {
    await deleteDiscountScheme(getDb(), access, schemeId, ip);
    return "Discount deleted.";
  });
}

export async function setStudentDiscountsAction(slug: string, studentId: string, schemeIds: string[]) {
  return run(slug, async ({ access, ip }) => {
    await setStudentDiscounts(getDb(), access, studentId, schemeIds, ip);
    return "Discounts saved. They apply to invoices raised from now on.";
  });
}

// ---------- Invoices ----------

export async function generateInvoicesAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  const parsed = generateInvoicesSchema.safeParse({ termId: formData.get("termId"), dueOn: formData.get("dueOn"), classIds: classIds.length ? classIds : undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  return run(slug, async ({ access, ip }) => {
    const r = await generateTermInvoices(getDb(), access, parsed.data, ip);
    const parts = [`${r.created} invoice${r.created === 1 ? "" : "s"} raised for ${r.term.label}.`];
    if (r.alreadyInvoiced) parts.push(`${r.alreadyInvoiced} already had one.`);
    if (r.noFees) parts.push(`${r.noFees} skipped because their class has no fees set.`);
    return { success: parts.join(" "), data: { created: String(r.created) } };
  });
}

export async function createOtherInvoiceAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["studentId", "termId", "title", "dueOn", "description", "amount", "itemId"]);
  const parsed = otherInvoiceSchema.safeParse({ ...values, lines: [{ itemId: values.itemId, description: values.description || values.title, amount: values.amount }] });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const out = await run(slug, async ({ access, ip }) => {
    const inv = await createOtherInvoice(getDb(), access, parsed.data, ip);
    return { success: `${inv.number} raised.`, data: { invoiceId: inv.id } };
  });
  return out.error ? { ...out, values } : out;
}

export async function addLineAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["invoiceId", "kind", "itemId", "description", "amount"]);
  const parsed = addLineSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const out = await run(slug, async ({ access, ip }) => {
    await addInvoiceLine(getDb(), access, parsed.data, ip);
    return parsed.data.kind === "discount" ? `Discount of ${formatNaira(parsed.data.amount)} applied.` : `${parsed.data.description} added.`;
  });
  return out.error ? { ...out, values } : out;
}

export async function removeLineAction(slug: string, lineId: string) {
  return run(slug, async ({ access, ip }) => {
    await removeInvoiceLine(getDb(), access, lineId, ip);
    return "Line removed.";
  });
}

export async function voidInvoiceAction(slug: string, invoiceId: string, reason: string) {
  return run(slug, async ({ access, ip }) => {
    await voidInvoice(getDb(), access, { invoiceId, reason }, ip);
    return "Invoice voided.";
  });
}

// ---------- Payments ----------

export async function recordPaymentAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["invoiceId", "amount", "method", "paidOn", "reference", "payerName", "note"]);
  const parsed = recordPaymentSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const sendReceipt = formData.get("sendReceipt") === "on";
  const out = await run(slug, async ({ access, ip }) => {
    const { payment, told } = await recordPayment(getDb(), access, parsed.data, ip, { emailReceipt: sendReceipt });
    deliverSoon();
    return {
      success: `${formatNaira(payment.amountKobo)} recorded. Receipt ${payment.receiptNo}${told ? ", and the parents have been told" : ""}.`,
      data: { paymentId: payment.id, receiptNo: payment.receiptNo },
    };
  });
  return out.error ? { ...out, values } : out;
}

export async function reversePaymentAction(slug: string, paymentId: string, reason: string) {
  return run(slug, async ({ access, ip }) => {
    await reversePayment(getDb(), access, { paymentId, reason }, ip);
    return "Payment reversed.";
  });
}

// ---------- Reminders ----------

export async function sendRemindersAction(slug: string, input: { invoiceIds?: string[]; termId?: string }) {
  return run(slug, async ({ access, ip }) => {
    const result = await prepareFeeReminders(getDb(), access, { ...input, baseUrl: await appUrl() }, ip);
    let sent = 0;
    for (const email of result.emails) if (await sendEmail(email)) sent++;
    if (!result.reminded && !result.noContact) return "Everyone selected was already reminded in the last day.";
    const parts = [`Reminders prepared for ${result.reminded} invoice${result.reminded === 1 ? "" : "s"}${sent ? ` (${sent} email${sent === 1 ? "" : "s"} sent)` : ""}.`];
    if (result.noContact) parts.push(`${result.noContact} ${result.noContact === 1 ? "family has" : "families have"} no parent email on file.`);
    return parts.join(" ");
  });
}

// ---------- Settings ----------

export async function saveSettlementAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["bankName", "bankCode", "accountNumber", "accountName"]);
  const parsed = settlementSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const out = await run(slug, async ({ access, ip }) => {
    const { accountName } = await saveSettlementAccount(getDb(), access, parsed.data, ip);
    return `Fees will settle into ${accountName}.`;
  });
  return out.error ? { ...out, values } : out;
}

export async function saveFeeSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = feeSettingsSchema.safeParse({
    withholdResults: formData.get("withholdResults") === "on",
    autoReminders: formData.get("autoReminders") === "on",
    reminderEveryDays: formData.get("reminderEveryDays") ?? 7,
    invoiceNote: formData.get("invoiceNote") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  return run(slug, async ({ access, ip }) => {
    await saveFeeSettings(getDb(), access, parsed.data, ip);
    return "Fee settings saved.";
  });
}
