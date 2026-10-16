"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { RESULT_STATUSES } from "@/lib/db/schema";
import { userMessage } from "@/lib/errors";
import { saveScores, saveTermReport, setClassResultStatus, setSheetStatus } from "@/lib/services/results";
import { generatePins } from "@/lib/services/pins";

const uuid = z.string().uuid();
const entriesSchema = z
  .array(z.object({ studentId: uuid, componentId: uuid, score: z.number().nullable() }))
  .max(5000);

type Result = { error?: string; success?: string };

async function guarded(fn: () => Promise<void>, success: string, revalidate?: string): Promise<Result> {
  try {
    await fn();
    if (revalidate) revalidatePath(revalidate);
    return { success };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

export async function saveScoresAction(slug: string, classId: string, subjectId: string, entries: unknown): Promise<Result> {
  const parsed = entriesSchema.safeParse(entries);
  if (!parsed.success || !uuid.safeParse(classId).success || !uuid.safeParse(subjectId).success) return { error: "Some scores couldn't be read. Reload and try again." };
  return guarded(async () => {
    const access = await requireAccess(slug);
    await saveScores(getDb(), access, { classId, subjectId, entries: parsed.data }, (await requestMeta()).ip);
  }, "Saved");
}

export async function setSheetStatusAction(slug: string, classId: string, subjectId: string, status: "draft" | "submitted"): Promise<Result> {
  if (status !== "draft" && status !== "submitted") return { error: "Invalid status." };
  return guarded(
    async () => {
      const access = await requireAccess(slug);
      await setSheetStatus(getDb(), access, { classId, subjectId, status }, (await requestMeta()).ip);
    },
    status === "submitted" ? "Scores submitted to the class teacher." : "Sheet reopened for editing.",
    `/s/${slug}/results`,
  );
}

export async function setResultStatusAction(slug: string, classId: string, status: string, nextTermBegins?: string | null): Promise<Result> {
  if (!(RESULT_STATUSES as readonly string[]).includes(status)) return { error: "Invalid status." };
  if (nextTermBegins && !/^\d{4}-\d{2}-\d{2}$/.test(nextTermBegins)) return { error: "Enter a valid resumption date." };
  return guarded(
    async () => {
      const access = await requireAccess(slug);
      await setClassResultStatus(getDb(), access, { classId, status: status as (typeof RESULT_STATUSES)[number], nextTermBegins }, (await requestMeta()).ip);
    },
    { open: "Results reopened.", reviewed: "Marked as reviewed.", approved: "Results approved and locked.", published: "Results published." }[status as (typeof RESULT_STATUSES)[number]],
    `/s/${slug}/results/class/${classId}`,
  );
}

const reportSchema = z.object({
  studentId: uuid,
  classTeacherComment: z.string().max(600).nullable().optional(),
  principalComment: z.string().max(600).nullable().optional(),
  ratings: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
});

export async function saveTermReportAction(slug: string, input: unknown): Promise<Result> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { error: "That couldn't be saved. Check the comment and ratings." };
  return guarded(async () => {
    const access = await requireAccess(slug);
    await saveTermReport(getDb(), access, parsed.data);
  }, "Saved");
}

export async function generatePinsAction(slug: string, count: number, maxUses: number): Promise<{ error?: string; batch?: string; term?: string; pins?: { serial: string; pin: string }[] }> {
  try {
    const access = await requireAccess(slug);
    const result = await generatePins(getDb(), access, { count: Math.floor(Number(count)), maxUses: Math.floor(Number(maxUses)) }, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/results/pins`);
    return result;
  } catch (error) {
    return { error: userMessage(error) };
  }
}
