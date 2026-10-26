"use server";

import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { askKola, kolaSchema } from "@/lib/services/kola";

export async function askKolaAction(slug: string, input: unknown): Promise<{ reply?: string; error?: string }> {
  const parsed = kolaSchema.safeParse(input);
  if (!parsed.success) return { error: "Type a shorter question." };
  try {
    const access = await requireAccess(slug);
    return { reply: await askKola(getDb(), access, parsed.data) };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
