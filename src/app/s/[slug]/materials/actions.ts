"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { deleteMaterial, materialSchema, saveMaterial } from "@/lib/services/materials";
import { fieldErrors } from "@/lib/validation";

export async function saveMaterialAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const get = (k: string) => (typeof formData.get(k) === "string" ? (formData.get(k) as string) : "");
  const values = { id: get("id"), plan: get("plan"), title: get("title"), description: get("description"), kind: get("kind"), url: get("url"), body: get("body") };
  const [levelId, subjectId] = values.plan.split(":");
  const parsed = materialSchema.safeParse({
    ...values,
    id: values.id || undefined,
    levelId,
    subjectId,
    fileIds: formData.getAll("fileIds").map(String),
    removeFileIds: formData.getAll("removeFileIds").map(String),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const access = await requireAccess(slug);
    await saveMaterial(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/materials`);
    return { success: values.id ? "Saved." : "Shared. Students in that class can see it now." };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function deleteMaterialAction(slug: string, id: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await deleteMaterial(getDb(), access, id, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/materials`);
    return { success: "Removed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
