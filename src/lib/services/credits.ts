import { randomBytes } from "node:crypto";
import { count, desc, eq, gte, sum } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { creditLedger, outboundMessages, schools, type CommsSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { creditBalance } from "./outbox";
import { paystackMode } from "./paystack";

/** Credit packs. One credit is one SMS page (160 characters). Prices in kobo. */
export const CREDIT_PACKS = [
  { key: "starter", credits: 500, priceKobo: 2_500_00 },
  { key: "term", credits: 2_000, priceKobo: 9_000_00 },
  { key: "school", credits: 5_000, priceKobo: 20_000_00 },
  { key: "bulk", credits: 20_000, priceKobo: 70_000_00 },
] as const;

export type PackKey = (typeof CREDIT_PACKS)[number]["key"];

export async function getMessaging(db: DB, access: Access) {
  requireFeature(access.plan, "sms");
  return withTenant(db, access.school.id, async (tx) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [balance, ledger, byChannel, recent] = await Promise.all([
      creditBalance(tx),
      tx.select().from(creditLedger).orderBy(desc(creditLedger.createdAt)).limit(15),
      tx
        .select({ channel: outboundMessages.channel, status: outboundMessages.status, n: count(), credits: sum(outboundMessages.credits).mapWith(Number) })
        .from(outboundMessages)
        .where(gte(outboundMessages.createdAt, since))
        .groupBy(outboundMessages.channel, outboundMessages.status),
      tx.select().from(outboundMessages).orderBy(desc(outboundMessages.createdAt)).limit(25),
    ]);
    return { balance, ledger, byChannel, recent, unlimited: access.plan.key === "enterprise" };
  });
}

/**
 * Starts a credit purchase. Credits are paid to Adalin (not the school's fee account).
 * Test mode adds them straight away so the flow can be tried without money.
 */
export async function buyCredits(db: DB, access: Access, packKey: string, baseUrl: string, ip?: string | null) {
  requirePermission(access, "comms:credits");
  requireFeature(access.plan, "sms");
  const pack = CREDIT_PACKS.find((p) => p.key === packKey);
  if (!pack) throw new AppError("Choose a credit pack.");
  const reference = `sosc_${randomBytes(12).toString("hex")}`;
  const mode = paystackMode();
  if (mode === "off") throw new AppError("Buying credits isn't switched on yet.", "conflict");
  if (mode === "test") {
    await addCredits(db, access.school.id, pack.credits, reference, `Bought ${pack.credits.toLocaleString()} credits (test mode)`, access.user.id);
    await withTenant(db, access.school.id, (tx) =>
      recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "comms.credits_bought", summary: `Bought ${pack.credits} message credits (test mode)` }),
    );
    return { url: `${baseUrl}/s/${access.school.slug}/settings?tab=messaging&bought=${pack.credits}` };
  }
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: access.user.email ?? access.school.email ?? "billing@adalintech.com",
      amount: pack.priceKobo,
      currency: "NGN",
      reference,
      callback_url: `${baseUrl}/api/credits/callback?school=${encodeURIComponent(access.school.slug)}`,
      metadata: { kind: "credits", school_id: access.school.id, credits: pack.credits, pack: pack.key, user_id: access.user.id },
    }),
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { authorization_url: string } } | null;
  if (!res.ok || !json?.status || !json.data) throw new AppError(json?.message ? `Paystack: ${json.message}` : "Paystack didn't respond. Please try again.", "conflict");
  return { url: json.data.authorization_url };
}

/** Idempotent on the payment reference, so the callback and the webhook can both call it. */
export async function addCredits(db: DB, schoolId: string, credits: number, reference: string, reason: string, userId?: string) {
  await withTenant(db, schoolId, (tx) => tx.insert(creditLedger).values({ schoolId, delta: credits, reason, reference, createdBy: userId ?? null }).onConflictDoNothing());
}

/** Settles a credit purchase from Paystack's verified transaction data. */
export async function settleCreditPurchase(db: DB, data: { reference: string; amount: number; currency: string; metadata?: { kind?: string; school_id?: string; pack?: string; user_id?: string } }) {
  const meta = data.metadata;
  if (meta?.kind !== "credits" || !meta.school_id || data.currency !== "NGN") return false;
  const pack = CREDIT_PACKS.find((p) => p.key === meta.pack);
  if (!pack || pack.priceKobo !== data.amount) return false;
  const [school] = await db.select({ id: schools.id }).from(schools).where(eq(schools.id, meta.school_id));
  if (!school) return false;
  await addCredits(db, school.id, pack.credits, data.reference, `Bought ${pack.credits.toLocaleString()} credits`, meta.user_id);
  return true;
}

export async function verifyCreditPurchase(db: DB, reference: string) {
  if (!/^sosc_[0-9a-f]{24}$/.test(reference) || paystackMode() !== "live") return false;
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { data?: { status: string; reference: string; amount: number; currency: string; metadata?: Record<string, string> } } | null;
  if (json?.data?.status !== "success") return false;
  return settleCreditPurchase(db, json.data);
}

// ---------- Settings ----------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30.");

export const commsSettingsSchema = z.object({
  senderId: z.preprocess((v) => (typeof v === "string" && !v.trim() ? undefined : v), z.string().trim().regex(/^[A-Za-z0-9 ]{3,11}$/, "Sender names are 3 to 11 letters or numbers.").optional()),
  absenceAlerts: z.boolean(),
  resultAlerts: z.boolean(),
  paymentAlerts: z.boolean(),
  smsAlerts: z.boolean(),
  parentMessaging: z.boolean(),
  studentResults: z.boolean().optional(),
  limitHours: z.boolean(),
  start: time.optional(),
  end: time.optional(),
});

export async function saveCommsSettings(db: DB, access: Access, input: z.infer<typeof commsSettingsSchema>, ip?: string | null) {
  requirePermission(access, "comms:announce");
  const settings: CommsSettings = {
    senderId: input.senderId,
    absenceAlerts: input.absenceAlerts,
    resultAlerts: input.resultAlerts,
    paymentAlerts: input.paymentAlerts,
    smsAlerts: input.smsAlerts,
    parentMessaging: input.parentMessaging,
    studentResults: input.studentResults ?? false,
    messagingHours: input.limitHours && input.start && input.end ? { start: input.start, end: input.end } : undefined,
  };
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(schools).set({ commsSettings: settings }).where(eq(schools.id, access.school.id));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "comms.settings", summary: "Updated messaging and alert settings" });
  });
}
