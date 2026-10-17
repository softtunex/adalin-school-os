"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { checkCustomDomain, removeCustomDomain, setCustomDomain } from "@/lib/services/domains";

export async function setDomainAction(slug: string, domain: string): Promise<FormState> {
  try {
    const d = await setCustomDomain(getDb(), await requireAccess(slug), domain, { ip: (await requestMeta()).ip });
    revalidatePath(`/s/${slug}/settings`);
    return { success: `Saved. Now add the DNS record below where ${d} is managed.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function checkDomainAction(slug: string): Promise<FormState> {
  try {
    const r = await checkCustomDomain(getDb(), await requireAccess(slug));
    revalidatePath(`/s/${slug}/settings`);
    if (r.note) return { success: r.note };
    return r.live ? { success: "It's live. Your school's address is working." } : { error: "Not working yet. DNS changes can take up to a few hours; check the record and try again later." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function removeDomainAction(slug: string): Promise<FormState> {
  try {
    await removeCustomDomain(getDb(), await requireAccess(slug), { ip: (await requestMeta()).ip });
    revalidatePath(`/s/${slug}/settings`);
    return { success: "Removed. Your school is only at the usual School OS address now." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
