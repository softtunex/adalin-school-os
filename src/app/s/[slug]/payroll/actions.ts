"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import {
  approveRun,
  createRun,
  deleteRun,
  editPayslip,
  markRunPaid,
  monthLabel,
  payProfileSchema,
  payrollSettingsSchema,
  refreshRun,
  savePayProfile,
  savePayrollSettings,
  slipEditSchema,
} from "@/lib/services/payroll";
import { fieldErrors } from "@/lib/validation";

async function ctx(slug: string) {
  return { access: await requireAccess(slug), ip: (await requestMeta()).ip };
}
function done(slug: string) {
  revalidatePath(`/s/${slug}/payroll`, "layout");
}

export async function savePayProfileAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = payProfileSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  try {
    const { access, ip } = await ctx(slug);
    await savePayProfile(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: "Pay details saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function createRunAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const month = String(formData.get("month") ?? "");
  try {
    const { access, ip } = await ctx(slug);
    const run = await createRun(getDb(), access, month, ip);
    done(slug);
    return { success: `${monthLabel(month)} payroll prepared.`, data: { id: run.id } };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function runAction(slug: string, id: string, what: "refresh" | "approve" | "paid" | "delete"): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    const db = getDb();
    if (what === "refresh") {
      const n = await refreshRun(db, access, id);
      done(slug);
      return { success: `Refreshed from pay details: ${n} staff.` };
    }
    if (what === "approve") await approveRun(db, access, id, ip);
    if (what === "paid") await markRunPaid(db, access, id, ip);
    if (what === "delete") await deleteRun(db, access, id, ip);
    done(slug);
    revalidatePath(`/s/${slug}/expenses`);
    return { success: what === "approve" ? "Approved." : what === "paid" ? "Marked as paid. Staff can now see their payslips." : "Deleted." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function editSlipAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = slipEditSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the amounts." };
  try {
    const { access } = await ctx(slug);
    await editPayslip(getDb(), access, parsed.data);
    done(slug);
    return { success: "Payslip updated." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function savePayrollSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const on = (k: string) => formData.get(k) === "on";
  const parsed = payrollSettingsSchema.safeParse({ payDay: Number(formData.get("payDay")), paye: on("paye"), pension: on("pension"), nhf: on("nhf"), recordExpense: on("recordExpense") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const { access, ip } = await ctx(slug);
    await savePayrollSettings(getDb(), access, parsed.data, ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Payroll settings saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
