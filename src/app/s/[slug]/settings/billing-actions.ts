"use server";

import { revalidatePath } from "next/cache";
import { appUrl, requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { formatNaira } from "@/lib/money";
import { buyAddon, cancelAddon } from "@/lib/services/addons";
import { changePlan, payBill, startTrial } from "@/lib/services/billing";
import { grantSupport, revokeSupport } from "@/lib/services/platform";

// Billing works in read-only mode: paying the bill is how a school gets out of it.
async function ctx(slug: string) {
  return { access: await requireAccess(slug, { allowReadOnly: true }), ip: (await requestMeta()).ip };
}

export async function startTrialAction(slug: string, planKey: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    const r = await startTrial(getDb(), access, planKey, ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: `Your ${r.plan} trial has started. It runs until ${r.endsAt.toLocaleDateString("en-NG", { day: "numeric", month: "long", timeZone: "Africa/Lagos" })}.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function changePlanAction(slug: string, planKey: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    const r = await changePlan(getDb(), access, planKey, ip);
    revalidatePath(`/s/${slug}`, "layout");
    if (r.change === "next_term") return { success: `You'll move to ${r.plan} when next term's bill is made. Until then you keep everything you've paid for.` };
    if (r.change === "kept") return { success: `You're staying on ${r.plan}.` };
    return { success: `You're now on ${r.plan}.${"bill" in r && r.bill ? ` Bill ${r.bill.number} for ${formatNaira(r.bill.totalKobo)} is below.` : ""}` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function payBillAction(slug: string, billId: string): Promise<FormState & { url?: string }> {
  try {
    const { access, ip } = await ctx(slug);
    const r = await payBill(getDb(), access, billId, await appUrl(), ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { url: r.url };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function buyAddonAction(slug: string, key: string, quantity?: number): Promise<FormState & { url?: string }> {
  try {
    const { access, ip } = await ctx(slug);
    const db = getDb();
    const { bill } = await buyAddon(db, access, { key, quantity }, ip);
    const r = await payBill(db, access, bill.id, await appUrl(), ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { url: r.url };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function cancelAddonAction(slug: string, addonId: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await cancelAddon(getDb(), access, addonId, ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Stopped. It keeps working until the end of this term." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function grantSupportAction(slug: string, hours: number, reason: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await grantSupport(getDb(), access, { hours, reason }, ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: `Adalin support can sign in for the next ${hours} hours.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function revokeSupportAction(slug: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await revokeSupport(getDb(), access, ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Support access is closed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
