"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { cancelLeave, clockIn, clockOut, decideLeave, decisionSchema, hrSettingsSchema, lagosClock, leaveSchema, markSchema, markStaff, requestLeave, saveHrSettings } from "@/lib/services/hr";
import { fieldErrors } from "@/lib/validation";

function done(slug: string) {
  revalidatePath(`/s/${slug}`, "layout");
}

export async function clockAction(slug: string, direction: "in" | "out"): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    const row = direction === "in" ? await clockIn(getDb(), access) : await clockOut(getDb(), access);
    done(slug);
    return direction === "in"
      ? { success: row.status === "late" ? `Clocked in at ${lagosClock(row.clockIn!)}, after the late time.` : `Clocked in at ${lagosClock(row.clockIn!)}. Have a good day!` }
      : { success: `Clocked out at ${lagosClock(row.clockOut!)}.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function requestLeaveAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["kind", "startsOn", "endsOn", "reason"]);
  const parsed = leaveSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const access = await requireAccess(slug);
    const r = await requestLeave(getDb(), access, parsed.data, (await requestMeta()).ip);
    done(slug);
    return { success: `Sent: ${r.days} working day${r.days === 1 ? "" : "s"}. You'll be told when it's decided.` };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function cancelLeaveAction(slug: string, id: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await cancelLeave(getDb(), access, id);
    done(slug);
    return { success: "Cancelled." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function decideLeaveAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the decision." };
  try {
    const access = await requireAccess(slug);
    await decideLeave(getDb(), access, parsed.data, (await requestMeta()).ip);
    done(slug);
    return { success: parsed.data.approve ? "Approved." : "Declined." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function markStaffAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the entry." };
  try {
    const access = await requireAccess(slug);
    await markStaff(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/hr`);
    return { success: "Saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveHrSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const allowances: Record<string, number> = {};
  for (const [k, v] of formData.entries()) if (k.startsWith("allow_") && String(v).trim() !== "") allowances[k.slice(6)] = Number(v);
  const parsed = hrSettingsSchema.safeParse({
    resumeAt: formData.get("resumeAt"),
    lateAfter: formData.get("lateAfter"),
    closeAt: formData.get("closeAt"),
    workDays: formData.getAll("workDays").map(Number),
    allowances,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const access = await requireAccess(slug);
    await saveHrSettings(getDb(), access, parsed.data, (await requestMeta()).ip);
    done(slug);
    return { success: "Staff hours and leave saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
