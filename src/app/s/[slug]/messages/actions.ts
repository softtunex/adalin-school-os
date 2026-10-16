"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { newConversationSchema, staffReply, startStaffConversation } from "@/lib/services/messaging";

export async function staffStartAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = { studentId: String(formData.get("studentId") ?? ""), subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") };
  const parsed = newConversationSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the message.", values };
  try {
    const access = await requireAccess(slug);
    const c = await startStaffConversation(getDb(), access, parsed.data);
    deliverSoon();
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Sent.", data: { conversationId: c.id } };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function staffReplyAction(slug: string, conversationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const body = String(formData.get("body") ?? "");
  if (!body.trim()) return { error: "Write a message.", values: { body } };
  try {
    const access = await requireAccess(slug);
    await staffReply(getDb(), access, conversationId, body);
    deliverSoon();
    revalidatePath(`/s/${slug}/messages/${conversationId}`);
    return { success: "Sent." };
  } catch (error) {
    return { error: userMessage(error), values: { body } };
  }
}
