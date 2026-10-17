"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { apiKeySchema, createApiKey, revokeApiKey } from "@/lib/services/api-keys";
import { createWebhook, deleteWebhook, setWebhookActive, testWebhook, webhookSchema } from "@/lib/services/webhooks";

async function run(slug: string, fn: (ctx: { access: Awaited<ReturnType<typeof requireAccess>>; ip: string | null }) => Promise<FormState>): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    const r = await fn({ access, ip: (await requestMeta()).ip });
    revalidatePath(`/s/${slug}/settings`);
    return r;
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function createApiKeyAction(slug: string, input: unknown) {
  const parsed = apiKeySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the key." } satisfies FormState;
  return run(slug, async ({ access, ip }) => ({ success: "Key created.", data: { key: await createApiKey(getDb(), access, parsed.data, ip) } }));
}

export async function revokeApiKeyAction(slug: string, keyId: string) {
  return run(slug, async ({ access, ip }) => {
    await revokeApiKey(getDb(), access, keyId, ip);
    return { success: "Key revoked. Anything using it stops working now." };
  });
}

export async function createWebhookAction(slug: string, input: unknown) {
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the webhook." } satisfies FormState;
  return run(slug, async ({ access, ip }) => ({ success: "Webhook added.", data: { secret: (await createWebhook(getDb(), access, parsed.data, ip)).secret } }));
}

export async function deleteWebhookAction(slug: string, webhookId: string) {
  return run(slug, async ({ access, ip }) => {
    await deleteWebhook(getDb(), access, webhookId, ip);
    return { success: "Webhook removed." };
  });
}

export async function setWebhookActiveAction(slug: string, webhookId: string, active: boolean) {
  return run(slug, async ({ access }) => {
    await setWebhookActive(getDb(), access, webhookId, active);
    return { success: active ? "Webhook switched on." : "Webhook switched off." };
  });
}

export async function testWebhookAction(slug: string, webhookId: string) {
  return run(slug, async ({ access }) => {
    const d = await testWebhook(getDb(), access, webhookId);
    return d.status === "sent" ? { success: `Test sent. Your address answered ${d.responseStatus}.` } : { error: `The test didn't arrive: ${d.error ?? "unknown error"}` };
  });
}
