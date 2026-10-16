"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ATTENDANCE_STATUSES } from "@/lib/db/schema";
import { userMessage } from "@/lib/errors";
import { saveAttendance } from "@/lib/services/attendance";

const recordsSchema = z
  .array(z.object({ studentId: z.string().uuid(), status: z.enum(ATTENDANCE_STATUSES), note: z.string().max(200).nullable().optional() }))
  .max(500);

export async function saveRegisterAction(slug: string, classId: string, date: string, records: unknown): Promise<{ error?: string; present?: number; absent?: number }> {
  const parsed = recordsSchema.safeParse(records);
  if (!parsed.success || !z.string().uuid().safeParse(classId).success) return { error: "The register couldn't be read. Reload and try again." };
  try {
    const access = await requireAccess(slug);
    const result = await saveAttendance(getDb(), access, { classId, date, records: parsed.data }, (await requestMeta()).ip);
    revalidatePath(`/s/${slug}/attendance`);
    revalidatePath(`/s/${slug}`);
    return result;
  } catch (error) {
    return { error: userMessage(error) };
  }
}
