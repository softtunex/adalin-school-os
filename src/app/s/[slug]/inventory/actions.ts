"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ASSET_CONDITIONS } from "@/lib/db/schema";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { adjustStock, countSchema, deleteItem, giveOut, giveOutSchema, inventorySettingsSchema, itemSchema, saveInventorySettings, saveItem, stockIn, stockInSchema, takeBack } from "@/lib/services/inventory";
import { fieldErrors } from "@/lib/validation";

async function ctx(slug: string) {
  return { access: await requireAccess(slug), ip: (await requestMeta()).ip };
}
function done(slug: string) {
  revalidatePath(`/s/${slug}`, "layout");
}

export async function saveItemAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  try {
    const { access, ip } = await ctx(slug);
    await saveItem(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: parsed.data.id ? "Saved." : "Added to the store." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function deleteItemAction(slug: string, id: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await deleteItem(getDb(), access, id, ip);
    done(slug);
    return { success: "Removed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function stockInAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = stockInSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the delivery." };
  try {
    const { access, ip } = await ctx(slug);
    const r = await stockIn(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: `In the store. ${r.balance} now.${r.expense ? " The cost is in Expenses for approval." : ""}` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function giveOutAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = giveOutSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check who it's going to." };
  try {
    const { access, ip } = await ctx(slug);
    const r = await giveOut(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: `${r.asset ? "Signed out" : "Issued"} to ${r.to}. ${r.balance} left in the store.${r.low ? " Time to reorder." : ""}` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function takeBackAction(slug: string, assignmentId: string, condition: string): Promise<FormState> {
  const c = ASSET_CONDITIONS.find((k) => k === condition);
  if (!c) return { error: "Choose its condition." };
  try {
    const { access, ip } = await ctx(slug);
    const r = await takeBack(getDb(), access, assignmentId, c, ip);
    done(slug);
    return { success: c === "lost" ? `${r.name} marked as lost.` : `${r.name} is back in the store.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function countAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = countSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the count." };
  try {
    const { access, ip } = await ctx(slug);
    const r = await adjustStock(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: r.change === 0 ? "The count matches. Nothing changed." : `Count updated (${r.change > 0 ? "+" : ""}${r.change}).` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveInventorySettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const lines = (k: string) =>
    String(formData.get(k) ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  const parsed = inventorySettingsSchema.safeParse({ categories: lines("categories"), locations: lines("locations"), recordPurchases: formData.get("recordPurchases") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const { access, ip } = await ctx(slug);
    await saveInventorySettings(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: "Inventory settings saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
