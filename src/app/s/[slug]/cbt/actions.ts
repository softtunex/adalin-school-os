"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import {
  bankForSubject,
  deleteExam,
  deleteQuestion,
  examSchema,
  extendExam,
  importQuestions,
  markTheory,
  questionSchema,
  reopenAttempt,
  saveExam,
  saveQuestion,
  sendExamToCA,
  setExamStatus,
  theoryMarksSchema,
} from "@/lib/services/cbt";
import { draftQuestions, draftSchema, readQuestionsFromPhoto } from "@/lib/services/ai-questions";
import { fieldErrors } from "@/lib/validation";

async function ctx(slug: string) {
  return { access: await requireAccess(slug), ip: (await requestMeta()).ip };
}

function done(slug: string) {
  revalidatePath(`/s/${slug}/cbt`, "layout");
}

export async function saveQuestionAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  try {
    const { access } = await ctx(slug);
    await saveQuestion(getDb(), access, parsed.data);
    done(slug);
    return { success: parsed.data.id ? "Question updated." : "Question added to the bank." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function deleteQuestionAction(slug: string, id: string): Promise<FormState> {
  try {
    const { access } = await ctx(slug);
    await deleteQuestion(getDb(), access, id);
    done(slug);
    return { success: "Deleted." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function importQuestionsAction(slug: string, input: { subjectId: string; levelId: string; topic: string; text: string }): Promise<FormState> {
  if (!input.subjectId) return { error: "Choose a subject." };
  try {
    const { access } = await ctx(slug);
    const r = await importQuestions(getDb(), access, { subjectId: input.subjectId, levelId: input.levelId || null, topic: input.topic.trim() || null, text: input.text });
    done(slug);
    return { success: `Added ${r.added} question${r.added === 1 ? "" : "s"} to the bank.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function bankAction(slug: string, subjectId: string) {
  try {
    const { access } = await ctx(slug);
    return await bankForSubject(getDb(), access, subjectId);
  } catch {
    return [];
  }
}

export async function saveExamAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  try {
    const { access, ip } = await ctx(slug);
    const exam = await saveExam(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: exam.status === "published" ? "Exam scheduled. Students see it in their portal." : "Saved as a draft.", data: { id: exam.id } };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function examStatusAction(slug: string, id: string, status: "published" | "closed" | "draft"): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await setExamStatus(getDb(), access, id, status, ip);
    done(slug);
    return { success: status === "closed" ? "Closed. Anyone still writing has been submitted." : status === "published" ? "Published." : "Back to draft." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function extendExamAction(slug: string, id: string, closesAt: string): Promise<FormState> {
  try {
    const { access } = await ctx(slug);
    await extendExam(getDb(), access, id, closesAt);
    done(slug);
    return { success: "Closing time updated." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function deleteExamAction(slug: string, id: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await deleteExam(getDb(), access, id, ip);
    done(slug);
    return { success: "Deleted." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function markTheoryAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = theoryMarksSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the marks and try again." };
  try {
    const { access, ip } = await ctx(slug);
    const r = await markTheory(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: `Saved: ${r.theoryScore} for theory.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function reopenAttemptAction(slug: string, attemptId: string, minutes: number): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await reopenAttempt(getDb(), access, attemptId, minutes, ip);
    done(slug);
    return { success: `Reopened with ${minutes} minutes. The student can carry on from where they stopped.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function examToCAAction(slug: string, id: string): Promise<FormState> {
  try {
    const { access } = await ctx(slug);
    const r = await sendExamToCA(getDb(), access, id);
    revalidatePath(`/s/${slug}/results`, "layout");
    return { success: `${r.saved} score${r.saved === 1 ? "" : "s"} written to ${r.column} (out of ${r.max}).` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function draftQuestionsAction(slug: string, input: unknown): Promise<{ text?: string; count?: number; problems?: number; error?: string }> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  try {
    const { access } = await ctx(slug);
    return await draftQuestions(getDb(), access, parsed.data);
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function questionsFromPhotoAction(slug: string, imageDataUrl: string): Promise<{ text?: string; count?: number; problems?: number; error?: string }> {
  try {
    const { access } = await ctx(slug);
    return await readQuestionsFromPhoto(getDb(), access, imageDataUrl);
  } catch (error) {
    return { error: userMessage(error) };
  }
}
