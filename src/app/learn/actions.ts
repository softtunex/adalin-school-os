"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UploadTicket } from "@/components/file-uploader";
import { endSession, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { studentUploadSchool, submissionSchema, submitAssignment } from "@/lib/services/assignments";
import { answerSchema, recordFocusLoss, saveAnswer, startExam, submitExam } from "@/lib/services/cbt";
import { createUpload } from "@/lib/services/files";
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

export async function studentUploadAction(name: string, size: number): Promise<UploadTicket> {
  try {
    const user = await requireUser();
    const schoolId = await studentUploadSchool(getDb(), user.id);
    if (!schoolId) return { error: "Uploads aren't available for your account." };
    return await createUpload(getDb(), { schoolId, userId: user.id, ownerType: "submission", name, size });
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function submitWorkAction(assignmentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const text = String(formData.get("text") ?? "");
  const parsed = submissionSchema.safeParse({
    assignmentId,
    text,
    fileIds: formData.getAll("fileIds").map(String),
    removeFileIds: formData.getAll("removeFileIds").map(String),
  });
  if (!parsed.success) return { error: "Check your answer and try again.", values: { text } };
  try {
    const user = await requireUser();
    const { late } = await submitAssignment(getDb(), user.id, parsed.data);
    revalidatePath("/learn", "layout");
    return { success: late ? "Handed in (late). Your teacher can see it now." : "Handed in. Your teacher can see it now." };
  } catch (error) {
    return { error: userMessage(error), values: { text } };
  }
}

export async function startExamAction(examId: string): Promise<FormState> {
  try {
    const user = await requireUser();
    await startExam(getDb(), user.id, examId);
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect(`/exam/${examId}`);
}

export async function saveAnswerAction(input: { examId: string; questionId: string; answer: number | string | null }): Promise<{ ok: boolean; error?: string; closed?: boolean }> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That answer couldn't be saved." };
  try {
    const user = await requireUser();
    await saveAnswer(getDb(), user.id, parsed.data);
    return { ok: true };
  } catch (error) {
    const message = userMessage(error);
    return { ok: false, error: message, closed: /Time is up|isn't open|closed/.test(message) };
  }
}

export async function focusLossAction(examId: string) {
  try {
    const user = await requireUser();
    return await recordFocusLoss(getDb(), user.id, examId);
  } catch {
    return null;
  }
}

export async function submitExamAction(examId: string): Promise<FormState> {
  try {
    const user = await requireUser();
    await submitExam(getDb(), user.id, examId);
    revalidatePath("/learn", "layout");
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect(`/learn/exams/${examId}?done=1`);
}
