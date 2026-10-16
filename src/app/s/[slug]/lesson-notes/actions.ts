"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { deleteLessonNote, noteSchema, plannedTopic, reviewLessonNote, reviewSchema, saveLessonNote, saveScheme, schemeSchema, withdrawLessonNote } from "@/lib/services/lesson-notes";
import { fieldErrors } from "@/lib/validation";

export async function saveNoteAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["id", "levelId", "subjectId", "week", "topic", "objectives", "content"]);
  const parsed = noteSchema.safeParse({
    ...values,
    id: values.id || undefined,
    submit: formData.get("intent") === "submit",
    fileIds: formData.getAll("fileIds").map(String),
    removeFileIds: formData.getAll("removeFileIds").map(String),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const access = await requireAccess(slug);
    const note = await saveLessonNote(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/lesson-notes`, "layout");
    return { success: note.status === "submitted" ? "Sent for approval." : "Draft saved.", data: { id: note.id } };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function plannedTopicAction(slug: string, levelId: string, subjectId: string, week: number) {
  try {
    const access = await requireAccess(slug);
    return await plannedTopic(getDb(), access, { levelId, subjectId, week });
  } catch {
    return null;
  }
}

export async function reviewNoteAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the review." };
  try {
    const access = await requireAccess(slug);
    await reviewLessonNote(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: parsed.data.decision === "approved" ? "Approved." : "Returned to the teacher." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function withdrawNoteAction(slug: string, id: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await withdrawLessonNote(getDb(), access, id);
    revalidatePath(`/s/${slug}/lesson-notes`, "layout");
    return { success: "Withdrawn. You can edit it again." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function deleteNoteAction(slug: string, id: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await deleteLessonNote(getDb(), access, id);
    revalidatePath(`/s/${slug}/lesson-notes`, "layout");
    return { success: "Deleted." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveSchemeAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = schemeSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the topics and try again." };
  try {
    const access = await requireAccess(slug);
    const r = await saveScheme(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/lesson-notes`, "layout");
    return { success: `Scheme saved: ${r.weeks} week${r.weeks === 1 ? "" : "s"} planned.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
