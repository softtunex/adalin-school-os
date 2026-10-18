import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { plans, schools, webhookDeliveries, webhooks } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { schoolFeaturesSql } from "../plans/school-features";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

/*
 * Webhooks: Adalin SchoolHub tells a school's other systems when something happens. Each delivery is
 * signed (HMAC-SHA256 of "<timestamp>.<body>" with the webhook's secret), retried with backoff,
 * and only ever sent to public internet addresses.
 */

export const WEBHOOK_EVENTS = {
  "student.created": "A student is added (by hand, import or admission)",
  "student.status_changed": "A student graduates, leaves, is suspended or comes back",
  "payment.received": "A fee payment is recorded or paid online",
  "results.published": "A class's term results are published",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS | "ping";

export const MAX_WEBHOOKS = 5;
const MAX_ATTEMPTS = 6;
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const SWITCH_OFF_AFTER = 15;

// ---------- Queueing (inside the transaction that made the change) ----------

/** Queues an event for every webhook that wants it. Runs in the caller's transaction, so it only goes out if the change sticks. */
export async function queueWebhookEvent(tx: Tx, schoolId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const hooks = await tx
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(eq(webhooks.active, true), sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`));
  if (!hooks.length) return 0;
  const createdAt = new Date().toISOString();
  await tx.insert(webhookDeliveries).values(
    hooks.map((h) => {
      const id = randomUUID();
      return { id, schoolId, webhookId: h.id, event, payload: { id, event, created_at: createdAt, data } };
    }),
  );
  sendWebhooksSoon();
  return hooks.length;
}

/** After the response, try to send what's waiting. The outbox cron is the safety net. */
function sendWebhooksSoon() {
  void import("next/server")
    .then(({ after }) =>
      after(async () => {
        const { getDb } = await import("../db/client");
        await drainWebhooks(getDb()).catch((error) => console.error("[webhooks] delivery failed", error));
      }),
    )
    .catch(() => {
      // Outside a request (scripts, tests): the cron sends it.
    });
}

// ---------- Delivery ----------

export function signPayload(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** True for addresses on private, loopback, link-local and other non-public networks. */
export function isPrivateAddress(ip: string) {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

const allowLocal = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_DB === "1";

/** Refuses anything but https to a public address (http and local addresses on dev servers only). */
export async function assertDeliverable(raw: string, resolve: (host: string) => Promise<string[]> = defaultResolve) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("Enter a full web address, starting with https://", "invalid");
  }
  if (url.protocol !== "https:" && !(allowLocal() && url.protocol === "http:")) throw new AppError("The address must start with https://", "invalid");
  if (url.username || url.password) throw new AppError("Leave the username and password out of the address.", "invalid");
  if (allowLocal()) return url;
  const addresses = isIP(url.hostname.replace(/^\[|\]$/g, "")) ? [url.hostname.replace(/^\[|\]$/g, "")] : await resolve(url.hostname).catch(() => []);
  if (!addresses.length) throw new AppError(`${url.hostname} couldn't be found.`, "invalid");
  if (addresses.some(isPrivateAddress)) throw new AppError("That address is on a private network. Webhooks only go to the public internet.", "invalid");
  return url;
}

async function defaultResolve(host: string) {
  return (await lookup(host, { all: true })).map((a) => a.address);
}

type Sender = (url: string, init: RequestInit) => Promise<{ status: number }>;
const defaultSender: Sender = (url, init) => fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });

/** Sends what's due. Safe to run from several places at once: each delivery is claimed first. */
export async function drainWebhooks(db: DB, opts: { send?: Sender; resolve?: (host: string) => Promise<string[]>; limit?: number } = {}) {
  const send = opts.send ?? defaultSender;
  const now = new Date();
  const due = await db
    .select({ d: webhookDeliveries, hook: webhooks, features: schoolFeaturesSql })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .innerJoin(schools, eq(schools.id, webhookDeliveries.schoolId))
    .innerJoin(plans, eq(plans.key, schools.planKey))
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now)))
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(opts.limit ?? 100);
  let sent = 0;
  let failed = 0;
  for (const { d, hook, features } of due) {
    const attempt = d.attempts + 1;
    const retryAt = new Date(now.getTime() + (BACKOFF_MINUTES[attempt - 1] ?? 360) * 60_000);
    // Claim it: only one sender moves it on.
    const [claimed] = await db
      .update(webhookDeliveries)
      .set({ attempts: attempt, nextAttemptAt: retryAt })
      .where(and(eq(webhookDeliveries.id, d.id), eq(webhookDeliveries.attempts, d.attempts), eq(webhookDeliveries.status, "pending")))
      .returning({ id: webhookDeliveries.id });
    if (!claimed) continue;
    const giveUp = async (error: string, status: number | null = null) => {
      await db.update(webhookDeliveries).set({ status: "failed", error, responseStatus: status }).where(eq(webhookDeliveries.id, d.id));
      failed++;
    };
    if (!hook.active) {
      await giveUp("The webhook was switched off.");
      continue;
    }
    if (!features.includes("api_access")) {
      await giveUp("The school's plan no longer includes the API.");
      continue;
    }
    let status: number | null = null;
    let error: string | null = null;
    try {
      await assertDeliverable(hook.url, opts.resolve);
      const body = JSON.stringify(d.payload);
      const ts = Math.floor(Date.now() / 1000);
      const res = await send(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "AdalinSchoolHub-Webhooks/1",
          "X-SchoolHub-Event": d.event,
          "X-SchoolHub-Delivery": d.id,
          "X-SchoolHub-Signature": `t=${ts},v1=${signPayload(hook.signingSecret, ts, body)}`,
        },
        body,
      });
      status = res.status;
      if (status < 200 || status >= 300) error = `The address answered ${status}.`;
    } catch (e) {
      error = e instanceof AppError ? e.message : e instanceof Error && e.name === "TimeoutError" ? "No answer within 10 seconds." : "Couldn't connect.";
    }
    if (!error) {
      await db.update(webhookDeliveries).set({ status: "sent", responseStatus: status, error: null, deliveredAt: new Date() }).where(eq(webhookDeliveries.id, d.id));
      if (hook.failures) await db.update(webhooks).set({ failures: 0 }).where(eq(webhooks.id, hook.id));
      sent++;
      continue;
    }
    const [h] = await db
      .update(webhooks)
      .set({ failures: sql`${webhooks.failures} + 1` })
      .where(eq(webhooks.id, hook.id))
      .returning({ failures: webhooks.failures });
    if (h.failures >= SWITCH_OFF_AFTER) await db.update(webhooks).set({ active: false }).where(eq(webhooks.id, hook.id));
    if (attempt >= MAX_ATTEMPTS || d.event === "ping") await giveUp(error, status);
    else await db.update(webhookDeliveries).set({ responseStatus: status, error }).where(eq(webhookDeliveries.id, d.id));
  }
  return { sent, failed };
}

// ---------- Managing webhooks ----------

function requireApi(access: Access) {
  requirePermission(access, "school:api");
  requireFeature(access.plan, "api_access");
}

export const webhookSchema = z.object({
  url: z.string().trim().min(8, "Enter the address.").max(500),
  events: z.array(z.enum(Object.keys(WEBHOOK_EVENTS) as [keyof typeof WEBHOOK_EVENTS])).min(1, "Choose at least one event."),
});

export async function listWebhooks(db: DB, access: Access) {
  requireApi(access);
  return withTenant(db, access.school.id, async (tx) => {
    const hooks = await tx.select().from(webhooks).orderBy(asc(webhooks.createdAt));
    const recent = hooks.length
      ? await tx
          .select()
          .from(webhookDeliveries)
          .where(inArray(webhookDeliveries.webhookId, hooks.map((h) => h.id)))
          .orderBy(desc(webhookDeliveries.createdAt))
          .limit(30)
      : [];
    return hooks.map(({ signingSecret, ...h }) => ({ ...h, secretHint: `${signingSecret.slice(0, 10)}…`, deliveries: recent.filter((d) => d.webhookId === h.id).slice(0, 10) }));
  });
}

export async function createWebhook(db: DB, access: Access, input: z.infer<typeof webhookSchema>, ip?: string | null) {
  requireApi(access);
  const url = await assertDeliverable(input.url);
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  await withTenant(db, access.school.id, async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(webhooks);
    if (n >= MAX_WEBHOOKS) throw new AppError(`You can have up to ${MAX_WEBHOOKS} webhooks.`, "conflict");
    await tx.insert(webhooks).values({ schoolId: access.school.id, url: url.toString(), events: input.events, signingSecret: secret, createdBy: access.membershipId });
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "api.webhook_added", summary: `Added a webhook to ${url.host}` });
  });
  return { secret };
}

export async function deleteWebhook(db: DB, access: Access, webhookId: string, ip?: string | null) {
  requireApi(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [h] = await tx.delete(webhooks).where(eq(webhooks.id, webhookId)).returning();
    if (!h) throw new AppError("That webhook wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "api.webhook_removed", summary: `Removed the webhook to ${new URL(h.url).host}` });
  });
}

/** Switches a webhook back on (after it was switched off for failing) or off. */
export async function setWebhookActive(db: DB, access: Access, webhookId: string, active: boolean) {
  requireApi(access);
  await withTenant(db, access.school.id, (tx) => tx.update(webhooks).set({ active, failures: 0 }).where(eq(webhooks.id, webhookId)));
}

/** Sends a "ping" straight away so the school can check its receiver. */
export async function testWebhook(db: DB, access: Access, webhookId: string, opts: Parameters<typeof drainWebhooks>[1] = {}) {
  requireApi(access);
  const id = randomUUID();
  await withTenant(db, access.school.id, async (tx) => {
    const [h] = await tx.select({ id: webhooks.id }).from(webhooks).where(eq(webhooks.id, webhookId));
    if (!h) throw new AppError("That webhook wasn't found.", "not_found");
    await tx.insert(webhookDeliveries).values({ id, schoolId: access.school.id, webhookId, event: "ping", payload: { id, event: "ping", created_at: new Date().toISOString(), data: { school: access.school.slug } } });
  });
  await drainWebhooks(db, opts);
  const [d] = await withTenant(db, access.school.id, (tx) => tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)));
  return d;
}
