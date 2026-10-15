import { eq, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { schools } from "../db/schema";

export type OnboardingStep = "profile" | "staff" | "academics" | "students";

export async function markOnboarding(tx: Tx, schoolId: string, step: OnboardingStep) {
  await tx
    .update(schools)
    .set({ onboarding: sql`${schools.onboarding} || ${JSON.stringify({ [step]: true })}::jsonb` })
    .where(eq(schools.id, schoolId));
}
