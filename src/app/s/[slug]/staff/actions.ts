"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { APP_NAME, INVITE_TTL_DAYS } from "@/lib/config";
import { appUrl, requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { sendEmail } from "@/lib/mail";
import { inviteStaff, revokeInvitation, setMemberRoles, setMemberStatus } from "@/lib/services/staff";
import { emailSchema, fieldErrors, nameSchema } from "@/lib/validation";

const inviteSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  jobTitle: z.string().trim().max(80).optional(),
  roleIds: z.array(z.string().uuid()).min(1, "Choose at least one role."),
});

export async function inviteAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["name", "email", "jobTitle"]);
  const parsed = inviteSchema.safeParse({ ...values, roleIds: formData.getAll("roleIds") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  try {
    const access = await requireAccess(slug);
    const { ip } = await requestMeta();
    const { token } = await inviteStaff(getDb(), access, parsed.data, ip);
    const link = `${await appUrl()}/invite/${token}`;
    const emailed = await sendEmail({
      to: parsed.data.email,
      subject: `${access.user.name} invited you to ${access.school.name} on ${APP_NAME}`,
      text: `Hi ${parsed.data.name},\n\n${access.user.name} has invited you to join ${access.school.name} on ${APP_NAME}.\n\nAccept your invitation here (valid for ${INVITE_TTL_DAYS} days):\n\n${link}`,
      action: { label: "Accept invitation", url: link },
      fromName: access.school.name,
    });
    revalidatePath(`/s/${slug}/staff`);
    return {
      success: emailed ? `Invitation emailed to ${parsed.data.email}.` : `Invitation created for ${parsed.data.email}.`,
      data: { link },
    };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function revokeInviteAction(slug: string, invitationId: string) {
  const access = await requireAccess(slug);
  await revokeInvitation(getDb(), access, invitationId, (await requestMeta()).ip);
  revalidatePath(`/s/${slug}/staff`);
}

export async function updateRolesAction(slug: string, membershipId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const roleIds = z.array(z.string().uuid()).safeParse(formData.getAll("roleIds"));
  if (!roleIds.success || roleIds.data.length === 0) return { error: "Choose at least one role." };
  try {
    const access = await requireAccess(slug);
    await setMemberRoles(getDb(), access, membershipId, roleIds.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Roles updated." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function setStatusAction(slug: string, membershipId: string, status: "active" | "deactivated"): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await setMemberStatus(getDb(), access, membershipId, status === "active" ? "active" : "deactivated", (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/staff`);
    return { success: status === "active" ? "Reactivated." : "Deactivated." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
