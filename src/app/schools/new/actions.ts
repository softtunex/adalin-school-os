"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { addSchool } from "@/lib/services/accounts";
import { schoolNameSchema } from "@/lib/validation";
import { TERMS_REQUIRED } from "@/components/terms-consent";

export async function addSchoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { schoolName: String(formData.get("schoolName") ?? "") };
  const parsed = schoolNameSchema.safeParse(values.schoolName);
  if (!parsed.success) return { fieldErrors: { schoolName: parsed.error.issues[0].message }, values };
  if (formData.get("terms") !== "on") return { fieldErrors: { terms: TERMS_REQUIRED }, values };
  let slug: string;
  try {
    const user = await requireUser();
    slug = (await addSchool(getDb(), user, parsed.data)).slug;
  } catch (error) {
    return { error: userMessage(error), values };
  }
  redirect(`/s/${slug}?welcome=1`);
}
