"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { schoolProfileSchema, updateSchoolProfile } from "@/lib/services/school-profile";
import { fieldErrors } from "@/lib/validation";

const KEYS = ["name", "motto", "schoolType", "curriculum", "email", "phone", "address", "city", "state", "country"];

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
