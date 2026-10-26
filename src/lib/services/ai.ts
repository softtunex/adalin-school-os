import { and, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { aiUsage, schools, type AiSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { aiProvider, AiUnavailable, complete, type AiMessage, type AiTask } from "../ai/provider";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

/*
 * AI helpers for a school: the on/off switch, the daily allowance per plan, and a record of every
 * request (who, which helper, how many tokens; never the text). Teachers always review what comes back.
 */

export const DEFAULT_AI: Required<AiSettings> = { enabled: true, kolaForFamilies: true };

export function aiSettings(s: AiSettings | null | undefined): Required<AiSettings> {
  return { ...DEFAULT_AI, ...s };
}

/** AI requests a school can make in a day (Lagos time), by plan. */
export const AI_DAILY: Record<string, number> = { standard: 100, premium: 300, enterprise: 1000 };
const AI_DAILY_OTHER = 50;

/** Who is asking: a staff member (their Access) or a parent, with the school whose allowance it uses. */
export type AiActor = { user: { id: string }; school: { id: string; aiSettings: AiSettings | null }; plan: { key: string; features: string[] } };

export type AiFeature = "questions" | "questions_photo" | "comment" | "kola" | "import";

export function aiDailyLimit(planKey: string) {
  return AI_DAILY[planKey] ?? AI_DAILY_OTHER;
}

const startOfLagosDay = sql`(date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')`;

export async function aiUsedToday(db: DB, schoolId: string) {
  const [row] = await withTenant(db, schoolId, (tx) =>
    tx.select({ n: count() }).from(aiUsage).where(and(eq(aiUsage.schoolId, schoolId), gte(aiUsage.createdAt, startOfLagosDay))),
  );
  return row?.n ?? 0;
}

/** Whether this person's school can use AI right now, and if not, why (in words for the screen). */
export function aiAvailability(access: AiActor): { ok: true } | { ok: false; reason: string; upgrade?: boolean } {
  if (!access.plan.features.includes("ai")) return { ok: false, reason: "AI helpers are on the Standard plan and above.", upgrade: true };
  if (!aiSettings(access.school.aiSettings).enabled) return { ok: false, reason: "AI helpers are switched off in Settings." };
  if (!aiProvider()) return { ok: false, reason: "AI isn't set up on this server yet." };
  return { ok: true };
}

/** Runs one AI request for the school: checks the plan, the switch and today's allowance, then records it. */
export async function runAi(db: DB, access: AiActor, feature: AiFeature, task: AiTask, messages: AiMessage[], opts: { maxTokens?: number; temperature?: number; json?: boolean } = {}) {
  const status = aiAvailability(access);
  if (!status.ok) throw new AppError(status.reason, status.upgrade ? "upgrade" : "forbidden");
  const limit = aiDailyLimit(access.plan.key);
  if ((await aiUsedToday(db, access.school.id)) >= limit) {
    throw new AppError(`Your school has used today's ${limit} AI requests. They reset at midnight.`, "rate_limited");
  }
  const log = (row: { model: string; inputTokens: number; outputTokens: number; ok: boolean }) =>
    withTenant(db, access.school.id, (tx) => tx.insert(aiUsage).values({ schoolId: access.school.id, userId: access.user.id, feature, ...row }));
  try {
    const result = await complete(task, messages, opts);
    await log({ model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, ok: true });
    if (!result.text) throw new AppError("AI didn't come back with anything. Please try again.", "invalid");
    return result.text;
  } catch (error) {
    if (error instanceof AiUnavailable) {
      await log({ model: task, inputTokens: 0, outputTokens: 0, ok: false });
      throw new AppError(error.message, "rate_limited");
    }
    throw error;
  }
}

export const aiSettingsSchema = z.object({ enabled: z.boolean(), kolaForFamilies: z.boolean() });

export async function saveAiSettings(db: DB, access: Access, input: z.infer<typeof aiSettingsSchema>, ip?: string | null) {
  requirePermission(access, "school:update");
  await db.update(schools).set({ aiSettings: input }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "ai.settings",
      summary: `AI helpers ${input.enabled ? "on" : "off"}${input.enabled ? `, Kola for parents ${input.kolaForFamilies ? "on" : "off"}` : ""}`,
    }),
  );
}

/** Today's use, for the Settings tab. */
export async function aiUsageSummary(db: DB, access: Access) {
  return { used: await aiUsedToday(db, access.school.id), limit: aiDailyLimit(access.plan.key) };
}
