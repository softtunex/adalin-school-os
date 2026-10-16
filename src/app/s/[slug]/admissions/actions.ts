"use server";

import { revalidatePath } from "next/cache";
import { appUrl, requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { admissionSettingsSchema, applicantUpdateSchema, enrollApplicant, saveAdmissionSettings, STATUS_LABEL, updateApplicant } from "@/lib/services/admissions";

export async function saveAdmissionSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = admissionSettingsSchema.safeParse({
    open: formData.get("open") === "on",
    levelIds: formData.getAll("levelIds").map(String),
    fee: String(formData.get("fee") ?? ""),
    intro: String(formData.get("intro") ?? ""),
    examInfo: String(formData.get("examInfo") ?? ""),
    assessment: String(formData.get("assessment") ?? "both"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const access = await requireAccess(slug);
    await saveAdmissionSettings(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/admissions`, "layout");
    revalidatePath(`/s/${slug}/settings`);
    return { success: parsed.data.open ? "Saved. Your admission form is open." : "Saved. Admissions are closed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function updateApplicantAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = applicantUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  try {
    const access = await requireAccess(slug);
    const a = await updateApplicant(getDb(), access, parsed.data, { ip: (await requestMeta()).ip, baseUrl: await appUrl() });
    deliverSoon();
    revalidatePath(`/s/${slug}/admissions`, "layout");
    return { success: parsed.data.status ? `Moved to ${STATUS_LABEL[a.status]}${parsed.data.notify ? ". The parent has been told." : "."}` : "Saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function enrollAction(slug: string, id: string, classId: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    const s = await enrollApplicant(getDb(), access, { id, classId }, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: `Enrolled as ${s.admissionNo}.`, data: { studentId: s.id } };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
