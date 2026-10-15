"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { createCustomRole, deleteCustomRole, updateCustomRole } from "@/lib/services/roles";
import { fieldErrors } from "@/lib/validation";

const roleSchema = z.object({
  name: z.string().trim().min(2, "Give the role a name.").max(60),
  description: z.string().trim().max(200).default(""),
  permissions: z.array(z.string()).min(1, "Choose at least one permission."),
});

export async function saveRoleAction(slug: string, roleId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["name", "description"]);
  const parsed = roleSchema.safeParse({ ...values, permissions: formData.getAll("permissions") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const access = await requireAccess(slug);
    const { ip } = await requestMeta();
    if (roleId) await updateCustomRole(getDb(), access, roleId, parsed.data, ip);
    else await createCustomRole(getDb(), access, parsed.data, ip);
    revalidatePath(`/s/${slug}/roles`);
    return { success: roleId ? "Role updated." : "Role created." };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function deleteRoleAction(slug: string, roleId: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await deleteCustomRole(getDb(), access, roleId, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/roles`);
    return { success: "Role deleted." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
