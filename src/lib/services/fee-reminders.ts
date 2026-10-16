import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { plans, schools } from "../db/schema";
import { withTenant } from "../db/tenant";
import { recordAudit } from "./audit";
import { getCurrentTerm } from "./academics";
import { collectReminders, type Reminder } from "./invoices";

/**
 * The daily job: for every school with automatic reminders on (and a plan that includes
 * them), emails guardians of students who owe this term, at most once per the school's
 * chosen interval. Sending is passed in so tests and the cron route can choose how.
 */
export async function runAutoReminders(db: DB, baseUrl: string, send: (r: Reminder) => Promise<unknown>) {
  const rows = await db.select({ school: schools, plan: plans }).from(schools).innerJoin(plans, eq(plans.key, schools.planKey)).where(eq(schools.status, "active"));
  const report: { school: string; reminded: number; emails: number }[] = [];
  for (const { school, plan } of rows) {
    if (!school.feeSettings.autoReminders || !plan.features.includes("debtors")) continue;
    const days = Math.min(30, Math.max(3, school.feeSettings.reminderEveryDays ?? 7));
    const result = await withTenant(db, school.id, async (tx) => {
      const current = await getCurrentTerm(tx);
      if (!current) return null;
      const out = await collectReminders(
        tx,
        { id: school.id, name: school.name, planFeatures: plan.features, feeSettings: school.feeSettings, paystackSubaccount: school.paystackSubaccount },
        { termId: current.term.id, olderThanHours: days * 24 - 2, baseUrl },
      );
      if (out.reminded) await recordAudit(tx, school.id, null, { action: "fees.reminders_auto", summary: `Sent automatic fee reminders for ${out.reminded} invoice${out.reminded === 1 ? "" : "s"}` });
      return out;
    });
    if (!result?.reminded) continue;
    for (const email of result.emails) await send(email);
    report.push({ school: school.slug, reminded: result.reminded, emails: result.emails.length });
  }
  return report;
}
