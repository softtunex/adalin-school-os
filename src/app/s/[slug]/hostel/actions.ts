"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { formatNaira } from "@/lib/money";
import {
  assignBed,
  bedSchema,
  billBoarding,
  createExeat,
  deleteHostel,
  deleteRoom,
  exeatSchema,
  hostelSchema,
  hostelSettingsSchema,
  moveExeat,
  removeBoarder,
  roomSchema,
  saveHostel,
  saveHostelSettings,
  saveRoom,
} from "@/lib/services/hostel";

async function run(slug: string, fn: (c: { access: Awaited<ReturnType<typeof requireAccess>>; ip: string | null }) => Promise<string>): Promise<FormState> {
  try {
    const access = await requireAccess(slug);
    const success = await fn({ access, ip: (await requestMeta()).ip });
    revalidatePath(`/s/${slug}`, "layout");
    return { success };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveHostelAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = hostelSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the hostel." };
  return run(slug, async ({ access, ip }) => {
    await saveHostel(getDb(), access, parsed.data, ip);
    return "Hostel saved.";
  });
}

export async function deleteHostelAction(slug: string, id: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    await deleteHostel(getDb(), access, id, ip);
    return "Removed.";
  });
}

export async function saveRoomAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the room." };
  return run(slug, async ({ access, ip }) => {
    await saveRoom(getDb(), access, parsed.data, ip);
    return "Room saved.";
  });
}

export async function deleteRoomAction(slug: string, id: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    await deleteRoom(getDb(), access, id, ip);
    return "Removed.";
  });
}

export async function assignBedAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = bedSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the bed." };
  return run(slug, async ({ access, ip }) => {
    const r = await assignBed(getDb(), access, parsed.data, ip);
    return `${r.hostel}, ${r.room}, bed ${r.bed}.`;
  });
}

export async function removeBoarderAction(slug: string, studentId: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    await removeBoarder(getDb(), access, studentId, ip);
    return "Now a day student.";
  });
}

export async function createExeatAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = exeatSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the exeat." };
  return run(slug, async ({ access, ip }) => {
    await createExeat(getDb(), access, parsed.data, ip);
    deliverSoon();
    return "Exeat approved. Parents have been told.";
  });
}

export async function moveExeatAction(slug: string, id: string, action: "approve" | "decline" | "out" | "back", note?: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    const r = await moveExeat(getDb(), access, { id, action, note }, ip);
    deliverSoon();
    return { approve: "Approved.", decline: "Declined.", out: "Signed out.", back: r.late ? "Back, late." : "Back in school." }[action];
  });
}

export async function billBoardingAction(slug: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    const r = await billBoarding(getDb(), access, ip);
    const parts = [r.added ? `Added boarding to ${r.added} invoice${r.added === 1 ? "" : "s"} (${formatNaira(r.totalKobo)}).` : "No new boarding fees to add."];
    if (r.already) parts.push(`${r.already} already had it.`);
    if (r.noInvoice) parts.push(`${r.noInvoice} ${r.noInvoice === 1 ? "has" : "have"} no ${r.term} invoice yet. Raise term invoices under Fees, then run this again.`);
    return parts.join(" ");
  });
}

export async function saveHostelSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = hostelSettingsSchema.safeParse({ parentRequests: formData.get("parentRequests") === "on", notifyMovements: formData.get("notifyMovements") === "on" });
  if (!parsed.success) return { error: "Check the settings." };
  return run(slug, async ({ access, ip }) => {
    await saveHostelSettings(getDb(), access, parsed.data, ip);
    return "Boarding settings saved.";
  });
}
