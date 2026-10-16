"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { behaviourSchema, deleteBehaviour, disciplineSettingsSchema, recordBehaviour, resolveIncident, saveDisciplineSettings } from "@/lib/services/discipline";
import { fieldErrors } from "@/lib/validation";

function done(slug: string) {
  revalidatePath(`/s/${slug}/discipline`);
  revalidatePath(`/s/${slug}/students`, "layout");
}

export async function recordBehaviourAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = behaviourSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  try {
    const access = await requireAccess(slug);
    const { told } = await recordBehaviour(getDb(), access, parsed.data, (await requestMeta()).ip);
    deliverSoon();
    done(slug);
    return { success: `Recorded.${told ? " The parent has been told." : ""}` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function resolveAction(slug: string, id: string, actionTaken: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await resolveIncident(getDb(), access, { id, actionTaken }, (await requestMeta()).ip);
    done(slug);
    return { success: "Closed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function deleteBehaviourAction(slug: string, id: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await deleteBehaviour(getDb(), access, id, (await requestMeta()).ip);
    done(slug);
    return { success: "Removed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveDisciplineSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const lines = (k: string) =>
    String(formData.get(k) ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  const parsed = disciplineSettingsSchema.safeParse({
    meritCategories: lines("meritCategories"),
    incidentCategories: lines("incidentCategories"),
    notifyIncidents: formData.get("notifyIncidents"),
    notifyMerits: formData.get("notifyMerits") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const access = await requireAccess(slug);
    await saveDisciplineSettings(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Behaviour settings saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
