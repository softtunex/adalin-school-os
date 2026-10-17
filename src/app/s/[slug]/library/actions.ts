"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import type { FormState } from "@/lib/form-state";
import { formatNaira } from "@/lib/money";
import { bookSchema, deleteBook, issueBook, issueSchema, librarySettingsSchema, lookupIsbn, markFinePaid, returnBook, saveBook, saveLibrarySettings } from "@/lib/services/library";
import { fieldErrors } from "@/lib/validation";

async function ctx(slug: string) {
  return { access: await requireAccess(slug), ip: (await requestMeta()).ip };
}
function done(slug: string) {
  revalidatePath(`/s/${slug}/library`);
}

export async function lookupIsbnAction(slug: string, isbn: string) {
  try {
    await ctx(slug);
    return { book: await lookupIsbn(isbn) };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveBookAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  try {
    const { access, ip } = await ctx(slug);
    await saveBook(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: parsed.data.id ? "Saved." : "Added to the catalogue." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function deleteBookAction(slug: string, id: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await deleteBook(getDb(), access, id, ip);
    done(slug);
    return { success: "Removed." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function issueAction(slug: string, input: unknown): Promise<FormState> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the loan." };
  try {
    const { access, ip } = await ctx(slug);
    const loan = await issueBook(getDb(), access, parsed.data, ip);
    done(slug);
    return { success: `Lent. Due back ${new Date(`${loan.dueOn}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "long", timeZone: "UTC" })}.` };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function returnAction(slug: string, loanId: string, waiveFine: boolean): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    const r = await returnBook(getDb(), access, loanId, { waiveFine }, ip);
    done(slug);
    return { success: r.fine ? `Returned ${r.late} day${r.late === 1 ? "" : "s"} late. Fine: ${formatNaira(r.fine)}.` : r.late ? "Returned late, fine waived." : "Returned on time." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function finePaidAction(slug: string, loanId: string): Promise<FormState> {
  try {
    const { access, ip } = await ctx(slug);
    await markFinePaid(getDb(), access, loanId, ip);
    done(slug);
    return { success: "Fine marked as paid." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveLibrarySettingsAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = librarySettingsSchema.safeParse({
    loanDays: Number(formData.get("loanDays")),
    maxLoans: Number(formData.get("maxLoans")),
    finePerDayKobo: Math.round(Number(String(formData.get("fine") ?? "0").replace(/[,₦\s]/g, "")) * 100),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const { access, ip } = await ctx(slug);
    await saveLibrarySettings(getDb(), access, parsed.data, ip);
    revalidatePath(`/s/${slug}`, "layout");
    return { success: "Library settings saved." };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
