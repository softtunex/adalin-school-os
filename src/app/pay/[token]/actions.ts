"use server";

import { redirect } from "next/navigation";
import { appUrl } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { confirmOnlinePayment, startOnlinePayment, startPaymentSchema } from "@/lib/services/paystack";

export async function startPaymentAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? ""), amount: String(formData.get("amount") ?? "") };
  const parsed = startPaymentSchema.safeParse({ token, ...values });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", values };
  try {
    const { url } = await startOnlinePayment(getDb(), parsed.data, await appUrl());
    return { success: "Redirecting to checkout…", data: { url } };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

/** Test mode only: stands in for Paystack's checkout outcome. */
export async function finishTestPaymentAction(token: string, reference: string, approve: boolean) {
  let ok = false;
  try {
    ok = (await confirmOnlinePayment(getDb(), reference, { testApproved: approve })).ok;
    deliverSoon();
  } catch {
    ok = false;
  }
  redirect(`/pay/${token}?${ok ? "paid=1" : "cancelled=1"}`);
}
