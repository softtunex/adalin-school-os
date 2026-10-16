"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { endSession, requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { newConversationSchema, parentReply, parentStartConversation } from "@/lib/services/messaging";
import { markAnnouncementRead, markParentNotificationsRead } from "@/lib/services/parent-portal";
import { eq } from "drizzle-orm";

export async function readAnnouncementAction(schoolId: string, announcementId: string) {
  const user = await requireUser();
  try {
    await markAnnouncementRead(getDb(), user.id, schoolId, announcementId);
  } catch {
    // A read receipt is best effort.
  }
}

export async function readAllNotificationsAction() {
  const user = await requireUser();
  await markParentNotificationsRead(getDb(), user.id);
  revalidatePath("/p", "layout");
}

export async function startConversationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { studentId: String(formData.get("studentId") ?? ""), subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") };
  const parsed = newConversationSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the message.", values };
  try {
    const user = await requireUser();
    const c = await parentStartConversation(getDb(), { id: user.id, name: user.name }, parsed.data);
    deliverSoon();
    return { success: "Sent.", data: { conversationId: c.id } };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function replyAction(conversationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const body = String(formData.get("body") ?? "");
  try {
    const user = await requireUser();
    await parentReply(getDb(), { id: user.id, name: user.name }, conversationId, body);
    deliverSoon();
    revalidatePath(`/p/messages/${conversationId}`);
    return { success: "Sent." };
  } catch (error) {
    return { error: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Write a message.") : userMessage(error), values: { body } };
  }
}

const prefsSchema = z.object({ name: z.string().trim().min(2, "Enter your name.").max(120), sms: z.boolean(), whatsapp: z.boolean(), email: z.boolean() });

export async function saveParentAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = prefsSchema.safeParse({
    name: formData.get("name"),
    sms: formData.get("sms") === "on",
    whatsapp: formData.get("whatsapp") === "on",
    email: formData.get("email") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const user = await requireUser();
  await getDb()
    .update(users)
    .set({ name: parsed.data.name, notifyPrefs: { sms: parsed.data.sms, whatsapp: parsed.data.whatsapp, email: parsed.data.email } })
    .where(eq(users.id, user.id));
  revalidatePath("/p", "layout");
  return { success: "Saved." };
}

export async function parentLogoutAction() {
  await endSession();
  redirect("/parent");
}
