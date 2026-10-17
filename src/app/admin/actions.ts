"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import {
  addManualBill,
  extendTrial,
  manualBillSchema,
  markBillPaid,
  markDelivered,
  openAsSupport,
  overridesSchema,
  planEditSchema,
  requirePlatformAdmin,
  saveAdminNote,
  setFeatureOverrides,
  setSchoolPlan,
  setSchoolStatus,
  updatePlan,
  voidBill,
  type Admin,
} from "@/lib/services/platform";

async function run(fn: (admin: Admin) => Promise<string>): Promise<FormState> {
  try {
    const user = await requireUser();
    const admin = await requirePlatformAdmin(getDb(), user.id);
    const success = await fn(admin);
    revalidatePath("/admin", "layout");
    return { success };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function setPlanAction(schoolId: string, planKey: string) {
  return run(async (a) => {
    await setSchoolPlan(getDb(), a, schoolId, planKey);
    return "Plan changed. No bill was raised.";
  });
}

export async function setFeaturesAction(schoolId: string, input: unknown) {
  const parsed = overridesSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the features." } satisfies FormState;
  return run(async (a) => {
    await setFeatureOverrides(getDb(), a, schoolId, parsed.data);
    return "Features saved.";
  });
}

export async function extendTrialAction(schoolId: string, days: number) {
  return run(async (a) => {
    await extendTrial(getDb(), a, schoolId, days);
    return `Trial extended by ${days} days.`;
  });
}

export async function setStatusAction(schoolId: string, status: "active" | "suspended" | "read_only", reason: string) {
  return run(async (a) => {
    await setSchoolStatus(getDb(), a, schoolId, status, reason);
    return { active: "The school is active.", suspended: "The school is suspended.", read_only: "The school is read-only." }[status];
  });
}

export async function saveNoteAction(schoolId: string, note: string) {
  return run(async (a) => {
    await saveAdminNote(getDb(), a, schoolId, note);
    return "Note saved.";
  });
}

export async function markPaidAction(billId: string, via: string) {
  return run(async (a) => {
    await markBillPaid(getDb(), a, billId, via);
    return "Marked paid.";
  });
}

export async function voidBillAction(billId: string, reason: string) {
  return run(async (a) => {
    await voidBill(getDb(), a, billId, reason);
    return "Bill cancelled.";
  });
}

export async function manualBillAction(schoolId: string, input: unknown) {
  const parsed = manualBillSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the bill." } satisfies FormState;
  return run(async (a) => {
    const bill = await addManualBill(getDb(), a, schoolId, parsed.data);
    return `Bill ${bill.number} raised.`;
  });
}

export async function deliveredAction(addonId: string) {
  return run(async (a) => {
    await markDelivered(getDb(), a, addonId);
    return "Marked delivered.";
  });
}

export async function updatePlanAction(input: unknown) {
  const parsed = planEditSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the plan." } satisfies FormState;
  return run(async (a) => {
    await updatePlan(getDb(), a, parsed.data);
    return "Plan saved. It applies to every school on it straight away.";
  });
}

export async function openAsSupportAction(schoolId: string): Promise<FormState> {
  let slug: string;
  try {
    const user = await requireUser();
    const admin = await requirePlatformAdmin(getDb(), user.id);
    slug = await openAsSupport(getDb(), admin, schoolId);
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect(`/s/${slug}`);
}
