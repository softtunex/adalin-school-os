"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { can } from "@/lib/services/access";
import { assignmentSchema, deleteAssignment, gradesSchema, gradeSubmissions, saveAssignment, sendToCA, setAssignmentStatus } from "@/lib/services/assignments";
import { createUpload } from "@/lib/services/files";
import { fieldErrors } from "@/lib/validation";
import type { UploadTicket } from "@/components/file-uploader";

/** Starts a staff upload (assignment briefs, lesson notes). */
export async function staffUploadAction(slug: string, ownerType: "assignment" | "lesson_note" | "material", name: string, size: number): Promise<UploadTicket> {
  try {
    const access = await requireAccess(slug);
    if (!can(access, "teaching:lessons")) return { error: "You don't have permission to upload here." };
    return await createUpload(getDb(), { schoolId: access.school.id, userId: access.user.id, ownerType, name, size });
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveAssignmentAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["id", "classId", "subjectId", "title", "instructions", "dueAt", "maxScore", "componentId", "pair"]);
  const [classId, subjectId] = (values.pair ?? "").split(":");
  const parsed = assignmentSchema.safeParse({
    ...values,
    id: values.id || undefined,
    classId: values.classId || classId,
    subjectId: values.subjectId || subjectId,
    allowLate: formData.get("allowLate") === "on",
    publish: formData.get("intent") !== "draft",
    fileIds: formData.getAll("fileIds").map(String),
    removeFileIds: formData.getAll("removeFileIds").map(String),
  });
  if (!parsed.success) {
    const fe = fieldErrors(parsed.error);
    if (fe.classId || fe.subjectId) fe.pair = fe.classId ?? fe.subjectId;
    return { fieldErrors: fe, values };
  }
  try {
    const access = await requireAccess(slug);
    const row = await saveAssignment(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/assignments`, "layout");
    return { success: values.id ? "Saved." : row.status === "draft" ? "Saved as a draft." : "Assignment set. Students can see it now.", data: { id: row.id } };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function assignmentStatusAction(slug: string, id: string, status: "published" | "closed"): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await setAssignmentStatus(getDb(), access, id, status, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/assignments`, "layout");
    return { success: status === "closed" ? "Closed. Students can no longer hand in." : "Reopened." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function deleteAssignmentAction(slug: string, id: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await deleteAssignment(getDb(), access, id, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/assignments`, "layout");
    return { success: "Deleted." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveGradesAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = gradesSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the marks and try again." };
  try {
    const access = await requireAccess(slug);
    const { marked } = await gradeSubmissions(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/assignments`, "layout");
    return { success: marked ? `Saved ${marked} mark${marked === 1 ? "" : "s"}.` : "Nothing changed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function sendToCAAction(slug: string, id: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    const r = await sendToCA(getDb(), access, id);
    revalidatePath(`/s/${slug}/results`, "layout");
    return { success: `${r.saved} score${r.saved === 1 ? "" : "s"} copied into ${r.column} (out of ${r.max}).` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
