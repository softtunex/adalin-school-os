"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { schoolProfileSchema, setBrandColor, setSchoolLogo, updateSchoolProfile } from "@/lib/services/school-profile";
import { storeImage } from "@/lib/storage";
import { requirePermission } from "@/lib/services/access";
import { fieldErrors } from "@/lib/validation";

const KEYS = ["name", "motto", "schoolType", "curriculum", "email", "phone", "address", "city", "state", "country", "admissionPrefix"];

export async function saveProfileAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, KEYS);
  const parsed = schoolProfileSchema.safeParse({
    ...values,
    schoolType: values.schoolType || null,
    curriculum: values.curriculum || null,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const access = await requireAccess(slug);
    await updateSchoolProfile(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "School profile saved.", values };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function uploadLogoAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  try {
    const access = await requireAccess(slug);
    requirePermission(access, "school:update");
    const url = await storeImage(`logos/${access.school.id}`, new Uint8Array(await file.arrayBuffer()), 1024 * 1024);
    await setSchoolLogo(getDb(), access, url, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Logo updated." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function removeLogoAction(slug: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await setSchoolLogo(getDb(), access, null, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Logo removed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function setBrandColorAction(slug: string, color: string | null): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await setBrandColor(getDb(), access, color, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: color ? "School colour saved. Documents and pages use it from now on." : "Back to the standard colour." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
