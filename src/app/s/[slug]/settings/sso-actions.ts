"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { configuredProviders, PROVIDERS, saveSsoSettings, type Provider } from "@/lib/services/sso";

export async function saveSsoAction(slug: string, input: { required: boolean; providers: Provider[] }): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    if (input.required) {
      const missing = input.providers.filter((p) => !configuredProviders().includes(p));
      if (missing.length) return { error: `${missing.map((p) => PROVIDERS[p].name).join(" and ")} sign-in isn't available yet, so staff couldn't log in. Leave it off for now.` };
    }
    await saveSsoSettings(getDb(), access, input, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/settings`);
    return { success: input.required ? "Saved. Staff now log in with their work account." : "Saved. Staff can log in with a password." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
