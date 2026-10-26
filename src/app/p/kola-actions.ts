"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { askParentKola, kolaSchema } from "@/lib/services/kola";

export async function askParentKolaAction(input: unknown): Promise<{ reply?: string; error?: string }> {
  const parsed = kolaSchema.safeParse(input);
  if (!parsed.success) return { error: "Type a shorter question." };
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Please sign in again." };
    return { reply: await askParentKola(getDb(), user, parsed.data) };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
