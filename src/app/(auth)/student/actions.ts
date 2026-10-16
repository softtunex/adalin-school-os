"use server";

import { redirect } from "next/navigation";
import { requestMeta, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { authenticateStudent } from "@/lib/services/student-accounts";

export async function studentLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { school: String(formData.get("school") ?? "").slice(0, 80), admissionNo: String(formData.get("admissionNo") ?? "").slice(0, 60) };
  const password = String(formData.get("password") ?? "").slice(0, 128);
  if (!values.school.trim() || !values.admissionNo.trim() || !password) return { error: "Fill in your school code, admission number and password.", values };
  try {
    const { ip } = await requestMeta();
    const { userId } = await authenticateStudent(getDb(), { ...values, password }, ip);
    await startSession(userId);
  } catch (error) {
    return { error: userMessage(error), values };
  }
  redirect("/learn");
}
