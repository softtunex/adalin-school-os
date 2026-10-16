"use server";

import { redirect } from "next/navigation";
import { endSession, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { setOwnPassword } from "@/lib/services/student-accounts";

export async function setPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { error: "The two passwords don't match." };
  try {
    const user = await requireUser();
    await setOwnPassword(getDb(), user.id, password);
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect("/learn");
}

export async function studentLogoutAction() {
  await endSession();
  redirect("/student");
}
