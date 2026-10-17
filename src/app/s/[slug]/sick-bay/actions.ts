"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { healthRecordSchema, healthSettingsSchema, OUTCOME_LABEL, recordVisit, saveHealthRecord, saveHealthSettings, updateVisit, updateVisitSchema, visitSchema } from "@/lib/services/health";

async function ctx(slug: string) {
  return { access: await requireAccess(slug), ip: (await requestMeta()).ip };
}
function done(slug: string) {
  revalidatePath(`/s/${slug}`, "layout");
}
function closed(outcome: keyof typeof OUTCOME_LABEL | null, told: number) {
  if (!outcome) return "In the sick bay. Close the visit when they leave.";
  return `${OUTCOME_LABEL[outcome]}.${told ? ` Parents told (${told}).` : ""}`;
}

export async function recordVisitAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = visitSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the visit." };
  try {
    const { access, ip } = await ctx(slug);
    const r = await recordVisit(getDb(), access, parsed.data, ip);
    if (r.told) deliverSoon();
    done(slug);
    return { success: closed(r.visit.outcome, r.told) };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function updateVisitAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = updateVisitSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the visit." };
  try {
    const { access, ip } = await ctx(slug);
    const r = await updateVisit(getDb(), access, parsed.data, ip);
    if (r.told) deliverSoon();
    done(slug);
    return { success: r.visit.outcome ? closed(r.visit.outcome, r.told) : "Saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveHealthRecordAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = healthRecordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the record." };
  try {
    const { access, ip } = await ctx(slug);
    await saveHealthRecord(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: "Health record saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveHealthSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = healthSettingsSchema.safeParse({
    medicines: String(formData.get("medicines") ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
    notifyParents: formData.get("notifyParents"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const { access, ip } = await ctx(slug);
    await saveHealthSettings(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: "Sick bay settings saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
