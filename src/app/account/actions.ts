"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, requireUser, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { userMessage } from "@/lib/errors";
import { type FormState } from "@/lib/form-state";
import { changePassword, revokeAllSessions } from "@/lib/services/accounts";
import { unlinkSsoIdentity } from "@/lib/services/sso";
import { nameSchema, passwordSchema } from "@/lib/validation";

export async function updateNameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0].message } };
  const user = await requireUser();
  await getDb().update(users).set({ name: parsed.data }).where(eq(users.id, user.id));
  return { success: "Name updated." };
}

const passwordChange = z.object({ current: z.string().min(1, "Enter your current password."), next: passwordSchema });

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordChange.safeParse({ current: formData.get("current"), next: formData.get("next") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { fieldErrors: { [String(issue.path[0])]: issue.message } };
  }
  const user = await requireUser();
  try {
    await changePassword(getDb(), user.id, parsed.data.current, parsed.data.next);
    // Changing the password signs out every other device, then keeps this one signed in.
    await revokeAllSessions(getDb(), user.id);
    await startSession(user.id);
    return { success: "Password changed. Other devices have been signed out." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function signOutEverywhereAction() {
  const user = await requireUser();
  await revokeAllSessions(getDb(), user.id);
  await endSession();
  redirect("/login");
}

export async function disconnectSsoAction(identityId: string): Promise<FormState> {
  try {
    const user = await requireUser();
    await unlinkSsoIdentity(getDb(), user.id, identityId);
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect("/account");
}
