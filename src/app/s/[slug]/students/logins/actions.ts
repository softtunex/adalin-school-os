"use server";

import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { issueStudentLogins } from "@/lib/services/student-accounts";

export async function issueLoginsAction(slug: string, studentIds: string[], reset: boolean) {
  try {
    const access = await requireAccess(slug);
    const slips = await issueStudentLogins(getDb(), access, { studentIds, reset }, (await requestMeta()).ip);
    return { slips };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
