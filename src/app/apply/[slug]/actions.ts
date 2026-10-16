"use server";

import { redirect } from "next/navigation";
import { appUrl, requestMeta } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { applicationSchema, confirmApplicationFee, feePaymentSchema, respondToOffer, startApplicationFee, submitApplication } from "@/lib/services/admissions";
import { fieldErrors } from "@/lib/validation";

const FIELDS = ["levelId", "firstName", "middleName", "lastName", "gender", "dateOfBirth", "previousSchool", "guardianName", "guardianRelationship", "guardianPhone", "guardianEmail", "address", "notes"];

export async function applyAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, FIELDS);
  // Bots fill every field; people never see this one.
  if (formData.get("website")) return { success: "Thank you." };
  const parsed = applicationSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values, error: "Some details need another look." };
  let token: string;
  try {
    const r = await submitApplication(getDb(), slug, parsed.data, { ip: (await requestMeta()).ip, baseUrl: await appUrl() });
    token = r.token;
    deliverSoon();
  } catch (error) {
    return { error: userMessage(error), values };
  }
  redirect(`/apply/${slug}/status/${token}?new=1`);
}

export async function payFeeAction(slug: string, token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = feePaymentSchema.safeParse({ email });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, values: { email } };
  try {
    const { url } = await startApplicationFee(getDb(), slug, token, parsed.data.email, await appUrl());
    return { success: "Redirecting to checkout…", data: { url } };
  } catch (error) {
    return { error: userMessage(error), values: { email } };
  }
}

/** Test mode only: stands in for Paystack's checkout outcome. */
export async function finishTestFeeAction(slug: string, token: string, reference: string, approve: boolean) {
  let ok = false;
  try {
    ok = await confirmApplicationFee(getDb(), reference, { testApproved: approve });
  } catch {
    ok = false;
  }
  redirect(`/apply/${slug}/status/${token}?${ok ? "paid=1" : "cancelled=1"}`);
}

export async function respondAction(slug: string, token: string, accept: boolean): Promise<FormState> {
  try {
    await respondToOffer(getDb(), slug, token, accept);
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect(`/apply/${slug}/status/${token}?${accept ? "accepted=1" : "declined=1"}`);
}
