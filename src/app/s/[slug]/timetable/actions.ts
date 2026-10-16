"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { copyTimetable, saveSchedule, scheduleSchema, setLevelSchedule, setSlot, slotSchema, swapSlots } from "@/lib/services/timetable";

export type SlotResult = { ok: boolean; clashes: string[]; error?: string };

export async function setSlotAction(slug: string, input: unknown): Promise<SlotResult> {
  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, clashes: [], error: parsed.error.issues[0]?.message ?? "Check the lesson." };
  try {
    const access = await requireAccess(slug);
    const r = await setSlot(getDb(), access, parsed.data, (await requestMeta()).ip);
    if (r.ok) revalidatePath(`/s/${slug}/timetable`);
    return r;
  } catch (error) {
    return { ok: false, clashes: [], error: userMessage(error) };
  }
}

export async function swapSlotsAction(slug: string, input: { termId: string; classId: string; a: { day: number; periodId: string }; b: { day: number; periodId: string }; force?: boolean }): Promise<SlotResult> {
  try {
    const access = await requireAccess(slug);
    const r = await swapSlots(getDb(), access, input);
    if (r.ok) revalidatePath(`/s/${slug}/timetable`);
    return r;
  } catch (error) {
    return { ok: false, clashes: [], error: userMessage(error) };
  }
}

export async function saveScheduleAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the schedule." };
  try {
    const access = await requireAccess(slug);
    await saveSchedule(getDb(), access, parsed.data, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/timetable`);
    return { success: "Bell schedule saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function setLevelScheduleAction(slug: string, levelId: string, scheduleId: string | null): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    await setLevelSchedule(getDb(), access, { levelId, scheduleId }, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/timetable`);
    return { success: "Saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function copyTimetableAction(slug: string, fromTermId: string, toTermId: string): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    const n = await copyTimetable(getDb(), access, { fromTermId, toTermId }, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/timetable`);
    return { success: `Copied ${n} lessons.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
