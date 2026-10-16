"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { formatNaira } from "@/lib/money";
import { createExpense, decideExpense, deleteExpense, expenseSchema } from "@/lib/services/expenses";
import { fieldErrors } from "@/lib/validation";

export async function createExpenseAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["spentOn", "category", "description", "amount", "method", "vendor", "reference"]);
  const parsed = expenseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const access = await requireAccess(slug);
    const row = await createExpense(getDb(), access, parsed.data, {}, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/expenses`);
    return { success: `${formatNaira(row.amountKobo)} recorded${row.status === "pending" ? " and sent for approval" : ""}.` };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function decideExpenseAction(slug: string, expenseId: string, approve: boolean, reason?: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await decideExpense(getDb(), access, { expenseId, approve, reason }, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/expenses`);
    return { success: approve ? "Approved." : "Rejected." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function deleteExpenseAction(slug: string, expenseId: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await deleteExpense(getDb(), access, expenseId, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/expenses`);
    return { success: "Deleted." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
