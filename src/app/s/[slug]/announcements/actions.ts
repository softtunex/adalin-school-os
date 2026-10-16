"use server";

import { revalidatePath } from "next/cache";
import { appUrl, requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { userMessage } from "@/lib/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { announcementSchema, audienceSize, createAnnouncement, deleteAnnouncement, deleteEvent, eventSchema, saveEvent } from "@/lib/services/announcements";
import { buyCredits, commsSettingsSchema, saveCommsSettings } from "@/lib/services/credits";
import { fieldErrors } from "@/lib/validation";

async function ctx(slug: string) {
  const access = await requireAccess(slug);
  const { ip } = await requestMeta();
  return { access, ip };
}

export async function audienceAction(slug: string, audience: string, classIds: string[]) {
  try {
    const { access } = await ctx(slug);
    return await audienceSize(getDb(), access, { audience, classIds });
  } catch {
    return null;
  }
}

export async function postAnnouncementAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["title", "body", "audience"]);
  const parsed = announcementSchema.safeParse({
    ...values,
    classIds: formData.getAll("classIds").map(String),
    pinned: formData.get("pinned") === "on",
    email: formData.get("email") === "on",
    sms: formData.get("sms") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const { access, ip } = await ctx(slug);
    const r = await createAnnouncement(getDb(), access, parsed.data, ip);
    deliverSoon();
    revalidatePath(`/s/${slug}`, "layout");
    const parts = [`Posted to ${r.families} ${r.families === 1 ? "family" : "families"}.`];
    if (r.queued) parts.push(`${r.queued} email${r.queued === 1 ? "" : "s"} and texts on their way${r.credits ? ` (${r.credits} credits)` : ""}.`);
    if (r.unpaid) parts.push(`${r.unpaid} SMS couldn't go: not enough credits.`);
    return { success: parts.join(" ") };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function deleteAnnouncementAction(slug: string, id: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await deleteAnnouncement(getDb(), access, id, ip);
    revalidatePath(`/s/${slug}/announcements`);
    return { success: "Deleted." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveEventAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["id", "title", "kind", "startsOn", "endsOn", "details"]);
  const parsed = eventSchema.safeParse({ ...values, id: values.id || undefined, forParents: formData.get("forParents") === "on" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  try {
    const { access, ip } = await ctx(slug);
    await saveEvent(getDb(), access, parsed.data, ip);
    revalidatePath(`/s/${slug}/calendar`);
    return { success: values.id ? "Event updated." : "Added to the calendar." };
  } catch (error) {
    return { error: userMessage(error), values };
  }
}

export async function deleteEventAction(slug: string, id: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await deleteEvent(getDb(), access, id, ip);
    revalidatePath(`/s/${slug}/calendar`);
    return { success: "Removed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveCommsSettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const on = (k: string) => formData.get(k) === "on";
  const parsed = commsSettingsSchema.safeParse({
    senderId: formData.get("senderId") ?? undefined,
    absenceAlerts: on("absenceAlerts"),
    resultAlerts: on("resultAlerts"),
    paymentAlerts: on("paymentAlerts"),
    smsAlerts: on("smsAlerts"),
    parentMessaging: on("parentMessaging"),
    studentResults: on("studentResults"),
    limitHours: on("limitHours"),
    start: formData.get("start") || undefined,
    end: formData.get("end") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const { access, ip } = await ctx(slug);
    await saveCommsSettings(getDb(), access, parsed.data, ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Messaging settings saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function buyCreditsAction(slug: string, pack: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    const { url } = await buyCredits(getDb(), access, pack, await appUrl(), ip);
    revalidatePath(`/s/${slug}/settings`);
    return { success: "Redirecting…", data: { url } };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
