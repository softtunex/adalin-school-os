"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APP_NAME, RESET_TTL_MINUTES } from "@/lib/config";
import { appUrl, endSession, getCurrentUser, requestMeta, safeNext, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { AppError, userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { sendEmail } from "@/lib/mail";
import { authenticate, createPasswordReset, registerSchoolOwner, resetPassword } from "@/lib/services/accounts";
import { acceptInvitation } from "@/lib/services/staff";
import { emailSchema, fieldErrors, nameSchema, passwordSchema, schoolNameSchema } from "@/lib/validation";
import { TERMS_REQUIRED } from "@/components/terms-consent";

const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  schoolName: schoolNameSchema,
});

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["name", "email", "schoolName"]);
  const parsed = signupSchema.safeParse({ ...values, password: formData.get("password") });
  const terms: Record<string, string> = formData.get("terms") === "on" ? {} : { terms: TERMS_REQUIRED };
  if (!parsed.success) return { fieldErrors: { ...fieldErrors(parsed.error), ...terms }, values };
  if (terms.terms) return { fieldErrors: terms, values };

  let slug: string;
  try {
    const { user, school } = await registerSchoolOwner(getDb(), parsed.data);
    await startSession(user.id);
    slug = school.slug;
  } catch (error) {
    return { error: userMessage(error), values };
  }
  redirect(`/s/${slug}?welcome=1`);
}

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.") });

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email"]);
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  try {
    const { ip } = await requestMeta();
    const user = await authenticate(getDb(), parsed.data.email, parsed.data.password, ip);
    await startSession(user.id);
  } catch (error) {
    return { error: userMessage(error), values };
  }
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email"]);
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message }, values };

  const success = "If that email has an account, a reset link is on its way. Check your inbox and spam folder.";
  try {
    const reset = await createPasswordReset(getDb(), parsed.data);
    if (!reset) return { success };
    const link = `${await appUrl()}/reset-password/${reset.token}`;
    const sent = await sendEmail({
      to: parsed.data,
      subject: `Reset your ${APP_NAME} password`,
      text: `Hi ${reset.user.name},\n\nUse this link to set a new password. It works once and expires in ${RESET_TTL_MINUTES} minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
    // Local development without email configured: surface the link so the flow can be tested.
    if (!sent && process.env.NODE_ENV !== "production") return { success, data: { devLink: link } };
    return { success };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0].message } };
  if (formData.get("password") !== formData.get("confirm")) return { fieldErrors: { confirm: "The passwords don't match." } };

  try {
    const userId = await resetPassword(getDb(), token, parsed.data);
    await startSession(userId);
  } catch (error) {
    return { error: userMessage(error) };
  }
  redirect("/schools");
}

const acceptSchema = z.object({ name: nameSchema, password: passwordSchema });

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const db = getDb();
  let schoolId: string;
  try {
    const current = await getCurrentUser();
    if (current) {
      ({ schoolId } = await acceptInvitation(db, token, { userId: current.id }));
    } else {
      const values = formValues(formData, ["name"]);
      const parsed = acceptSchema.safeParse({ name: formData.get("name"), password: formData.get("password") });
      if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
      const result = await acceptInvitation(db, token, parsed.data);
      schoolId = result.schoolId;
      await startSession(result.userId);
    }
  } catch (error) {
    return { error: userMessage(error) };
  }
  const [school] = await db.select({ slug: schools.slug }).from(schools).where(eq(schools.id, schoolId));
  if (!school) throw new AppError("School not found", "not_found");
  redirect(`/s/${school.slug}`);
}
