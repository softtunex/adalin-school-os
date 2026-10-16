"use server";

import { redirect } from "next/navigation";
import { requestMeta, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { sendEmail } from "@/lib/mail";
import { sendPlatformSms } from "@/lib/services/outbox";
import { loginCodeMessage, requestLoginCode, testLoginCodesAllowed, verifyLoginCode, type Destination } from "@/lib/services/parent-auth";

/** In development, CI and demos (never the live site), with no SMS or email provider set up, the code is shown on screen. */
function showCodeOnScreen(d: Destination) {
  if (!testLoginCodesAllowed()) return false;
  return d.kind === "phone" ? !process.env.TERMII_API_KEY : !process.env.RESEND_API_KEY;
}

export async function requestCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get("destination") ?? "").slice(0, 120);
  const shown: { code?: string } = {};
  try {
    const { ip } = await requestMeta();
    const result = await requestLoginCode(getDb(), raw, ip, async (d, code) => {
      if (showCodeOnScreen(d)) shown.code = code;
      if (d.kind === "phone") await sendPlatformSms(d.value, loginCodeMessage(code));
      else await sendEmail({ to: d.value, subject: `Your School OS code: ${code}`, text: loginCodeMessage(code) });
    });
    return {
      success: result.destination.kind === "phone" ? "If your child's school has this number, we've texted you a code." : "If your child's school has this email, we've sent you a code.",
      data: shown.code ? { step: "code", destination: raw.trim(), testCode: shown.code } : { step: "code", destination: raw.trim() },
      values: { destination: raw },
    };
  } catch (error) {
    return { error: userMessage(error), values: { destination: raw } };
  }
}

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const destination = String(formData.get("destination") ?? "").slice(0, 120);
  const code = String(formData.get("code") ?? "").slice(0, 12);
  try {
    const { userId } = await verifyLoginCode(getDb(), destination, code);
    await startSession(userId);
  } catch (error) {
    return { error: userMessage(error), data: { step: "code", destination }, values: { destination } };
  }
  redirect("/p");
}
