"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { aiSettingsSchema, saveAiSettings } from "@/lib/services/ai";

export async function saveAiSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = aiSettingsSchema.safeParse({ enabled: formData.get("enabled") === "on", kolaForFamilies: formData.get("kolaForFamilies") === "on" });
  if (!parsed.success) return { error: "Check the settings." };
  try {
    const access = await requireAccess(slug);
    await saveAiSettings(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: parsed.data.enabled ? "AI helpers are on." : "AI helpers are off." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
