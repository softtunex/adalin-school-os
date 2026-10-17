"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { formatNaira } from "@/lib/money";
import {
  billTransport,
  deleteRoute,
  deleteVehicle,
  removeRider,
  riderSchema,
  routeSchema,
  saveRoute,
  saveTransportSettings,
  saveTrip,
  saveVehicle,
  setRider,
  transportSettingsSchema,
  tripSchema,
  vehicleSchema,
} from "@/lib/services/transport";

async function ctx(slug: string) {
  return { access: await requireAccess(slug), ip: (await requestMeta()).ip };
}
function done(slug: string) {
  revalidatePath(`/s/${slug}`, "layout");
}

async function run(slug: string, fn: (c: Awaited<ReturnType<typeof ctx>>) => Promise<string>): Promise<FormState> {
  try {
    const c = await ctx(slug);
    const success = await fn(c);
    done(slug);
    return { success };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveVehicleAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the bus." };
  return run(slug, async ({ access, ip }) => {
    await saveVehicle(getDb(), access, parsed.data, ip);
    return "Bus saved.";
  });
}

export async function deleteVehicleAction(slug: string, id: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    await deleteVehicle(getDb(), access, id, ip);
    return "Removed.";
  });
}

export async function saveRouteAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = routeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the route." };
  return run(slug, async ({ access, ip }) => {
    await saveRoute(getDb(), access, parsed.data, ip);
    return "Route saved.";
  });
}

export async function deleteRouteAction(slug: string, id: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    await deleteRoute(getDb(), access, id, ip);
    return "Removed.";
  });
}

export async function setRiderAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = riderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  return run(slug, async ({ access, ip }) => {
    await setRider(getDb(), access, parsed.data, ip);
    return "Saved.";
  });
}

export async function removeRiderAction(slug: string, studentId: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    await removeRider(getDb(), access, studentId, ip);
    return "Taken off the bus.";
  });
}

export async function saveTripAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the register." };
  return run(slug, async ({ access, ip }) => {
    const r = await saveTrip(getDb(), access, parsed.data, ip);
    return `Saved: ${r.boarded} of ${r.of} on the bus.${r.told ? ` ${r.told} parent${r.told === 1 ? "" : "s"} told.` : ""}`;
  });
}

export async function billTransportAction(slug: string): Promise<FormState> {
  return run(slug, async ({ access, ip }) => {
    const r = await billTransport(getDb(), access, ip);
    const parts = [r.added ? `Added the bus fee to ${r.added} invoice${r.added === 1 ? "" : "s"} (${formatNaira(r.totalKobo)}).` : "No new bus fees to add."];
    if (r.already) parts.push(`${r.already} already had it.`);
    if (r.noInvoice) parts.push(`${r.noInvoice} ${r.noInvoice === 1 ? "has" : "have"} no ${r.term} invoice yet. Raise term invoices under Fees, then run this again.`);
    return parts.join(" ");
  });
}

export async function saveTransportSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = transportSettingsSchema.safeParse({ notifyBoarding: formData.get("notifyBoarding") === "on" });
  if (!parsed.success) return { error: "Check the settings." };
  return run(slug, async ({ access, ip }) => {
    await saveTransportSettings(getDb(), access, parsed.data, ip);
    return "Transport settings saved.";
  });
}
