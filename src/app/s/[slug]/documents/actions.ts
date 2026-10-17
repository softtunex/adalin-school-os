"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { requirePermission } from "@/lib/services/access";
import { storeImage } from "@/lib/storage";
import type { FormState } from "@/lib/form-state";
import {
  deleteTemplate,
  documentSettingsSchema,
  fromTemplateSchema,
  idCardSchema,
  issueFromTemplate,
  issueIdCards,
  issueTestimonial,
  issueTranscript,
  revokeDocument,
  saveDocumentSettings,
  saveTemplate,
  templateSchema,
  testimonialSchema,
  transcriptSchema,
} from "@/lib/services/documents";

type Result = FormState & { print?: string };

async function run(slug: string, fn: (c: { access: Awaited<ReturnType<typeof requireAccess>>; ip: string | null }) => Promise<Result>): Promise<Result> {
  try {
    const access = await requireAccess(slug);
    const r = await fn({ access, ip: (await requestMeta()).ip });
    revalidatePath(`/s/${slug}/documents`);
    return r;
  } catch (error) {
    return { error: userMessage(error) };
  }
}

const printUrl = (slug: string, q: string) => `/s/${slug}/documents/print?${q}`;

export async function idCardsAction(slug: string, input: unknown): Promise<Result> {
  const parsed = idCardSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose who the cards are for." };
  return run(slug, async ({ access, ip }) => {
    const r = await issueIdCards(getDb(), access, parsed.data, ip);
    return { success: `${r.cards.length} card${r.cards.length === 1 ? "" : "s"} ready.`, print: printUrl(slug, `batch=${r.batch}`) };
  });
}

export async function testimonialAction(slug: string, input: unknown): Promise<Result> {
  const parsed = testimonialSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the testimonial." };
  return run(slug, async ({ access, ip }) => {
    const doc = await issueTestimonial(getDb(), access, parsed.data, ip);
    return { success: `Testimonial ${doc.serial} issued.`, print: printUrl(slug, `id=${doc.id}`) };
  });
}

export async function transcriptAction(slug: string, input: unknown): Promise<Result> {
  const parsed = transcriptSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose the student." };
  return run(slug, async ({ access, ip }) => {
    const doc = await issueTranscript(getDb(), access, parsed.data, ip);
    return { success: `Transcript ${doc.serial} issued.`, print: printUrl(slug, `id=${doc.id}`) };
  });
}

export async function fromTemplateAction(slug: string, input: unknown): Promise<Result> {
  const parsed = fromTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a template and who it's for." };
  return run(slug, async ({ access, ip }) => {
    const r = await issueFromTemplate(getDb(), access, parsed.data, ip);
    return { success: `${r.docs.length} ${r.kind}${r.docs.length === 1 ? "" : "s"} ready.`, print: printUrl(slug, `batch=${r.batch}`) };
  });
}

export async function revokeAction(slug: string, id: string, reason: string): Promise<Result> {
  return run(slug, async ({ access, ip }) => {
    await revokeDocument(getDb(), access, { id, reason }, ip);
    return { success: "Revoked. Its QR code now shows it isn't valid." };
  });
}

export async function saveTemplateAction(slug: string, input: unknown): Promise<Result> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the template." };
  return run(slug, async ({ access, ip }) => {
    await saveTemplate(getDb(), access, parsed.data, ip);
    return { success: "Template saved." };
  });
}

export async function deleteTemplateAction(slug: string, id: string): Promise<Result> {
  return run(slug, async ({ access, ip }) => {
    await deleteTemplate(getDb(), access, id, ip);
    return { success: "Removed." };
  });
}

/** Stores a signature image. It takes effect when the settings are saved. */
export async function uploadSignatureAction(slug: string, formData: FormData): Promise<FormState & { url?: string }> {
  const file = formData.get("signature");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  try {
    const access = await requireAccess(slug);
    requirePermission(access, "documents:issue");
    const url = await storeImage(`signatures/${access.school.id}`, new Uint8Array(await file.arrayBuffer()), 512 * 1024);
    return { success: "Uploaded.", url };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveDocumentSettingsAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = documentSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  return run(slug, async ({ access, ip }) => {
    await saveDocumentSettings(getDb(), access, parsed.data, ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Document settings saved." };
  });
}
