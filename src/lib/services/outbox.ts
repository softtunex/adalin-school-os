import { and, asc, eq, inArray, sql, sum } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { creditLedger, outboundMessages, plans, schools, type OutboundChannel } from "../db/schema";

/*
 * Outgoing SMS, WhatsApp and email. Messages are queued inside the transaction that
 * caused them (so nothing is sent for work that rolled back), then delivered after the
 * response by drainOutbox(). SMS and WhatsApp are paid for with the school's credits.
 */

export type Outgoing = { channel: OutboundChannel; to: string; subject?: string; body: string; kind: string; ref?: string };

const GSM = /^[\n\r -~£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/;

/**
 * Swaps common characters outside the basic SMS alphabet for plain ones. One "₦" or curly
 * quote would otherwise turn the whole text into a 70-character SMS and double or triple its cost.
 */
const PLAIN: [RegExp, string][] = [
  [/₦/g, "N"],
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[–—−]/g, "-"],
  [/…/g, "..."],
  [/[•·]/g, "-"],
  [/[  ]/g, " "],
];
export function smsSafe(body: string) {
  return PLAIN.reduce((text, [from, to]) => text.replace(from, to), body);
}

/** Credits an SMS costs: one per 160 plain characters (153 when split), or 70/67 with emoji or local script. */
export function smsCredits(body: string) {
  const gsm = GSM.test(body);
  const single = gsm ? 160 : 70;
  const part = gsm ? 153 : 67;
  return body.length <= single ? 1 : Math.ceil(body.length / part);
}

export async function creditBalance(tx: Tx) {
  const [{ total }] = await tx.select({ total: sum(creditLedger.delta).mapWith(Number) }).from(creditLedger);
  return total ?? 0;
}

/** Enterprise schools message without credits. */
async function unlimited(tx: Tx, schoolId: string) {
  const [row] = await tx.select({ key: plans.key }).from(schools).innerJoin(plans, eq(plans.key, schools.planKey)).where(eq(schools.id, schoolId));
  return row?.key === "enterprise";
}

/**
 * Queues messages. SMS and WhatsApp are charged up front; any that the balance can't
 * cover are recorded as failed so the school can see what didn't go.
 */
export async function enqueue(tx: Tx, schoolId: string, items: Outgoing[]) {
  if (!items.length) return { queued: 0, unpaid: 0, credits: 0 };
  const paid = items.filter((i) => i.channel !== "email");
  const free = await unlimited(tx, schoolId);
  let balance = free ? Number.POSITIVE_INFINITY : await creditBalance(tx);
  let spent = 0;
  let unpaid = 0;
  const rows = items.map((item) => {
    if (item.channel === "email") return { schoolId, ...item, subject: item.subject ?? null, ref: item.ref ?? null, credits: 0, status: "queued" as const };
    // SMS is charged and sent in the plain alphabet; WhatsApp keeps every character at no extra cost.
    const i = item.channel === "sms" ? { ...item, body: smsSafe(item.body) } : item;
    const cost = smsCredits(i.body);
    if (cost > balance) {
      unpaid++;
      return { schoolId, ...i, subject: null, ref: i.ref ?? null, credits: 0, status: "failed" as const, error: "Not enough message credits" };
    }
    balance -= cost;
    spent += free ? 0 : cost;
    return { schoolId, ...i, subject: null, ref: i.ref ?? null, credits: free ? 0 : cost, status: "queued" as const };
  });
  for (let i = 0; i < rows.length; i += 500) await tx.insert(outboundMessages).values(rows.slice(i, i + 500));
  if (spent > 0) {
    const kinds = [...new Set(paid.map((p) => p.kind))].join(", ");
    await tx.insert(creditLedger).values({ schoolId, delta: -spent, reason: `Messages sent (${kinds})` });
  }
  return { queued: rows.filter((r) => r.status === "queued").length, unpaid, credits: spent };
}

// ---------- Delivery ----------

export type Transport = (m: { channel: OutboundChannel; to: string; subject: string | null; body: string; senderId: string; schoolName?: string }) => Promise<{ ok: boolean; ref?: string; error?: string }>;

/** Termii for SMS and WhatsApp, Resend for email. Without keys, logs instead (local development). */
export const defaultTransport: Transport = async (m) => {
  if (m.channel === "email") {
    // Loaded on use: the mail module is server-only, and scripts that only queue messages never need it.
    const { sendEmail } = await import("../mail");
    const ok = await sendEmail({ to: m.to, subject: m.subject ?? "A message from your school", text: m.body, fromName: m.schoolName });
    return { ok: ok || !process.env.RESEND_API_KEY };
  }
  const key = process.env.TERMII_API_KEY;
  if (!key) {
    console.info(`[${m.channel}] to=${m.to} from=${m.senderId}\n${m.body}`);
    return { ok: true, ref: "logged" };
  }
  try {
    const res = await fetch(`${(process.env.TERMII_BASE_URL ?? "https://v3.api.termii.com").replace(/\/$/, "")}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        to: m.to.replace(/^\+/, ""),
        from: m.senderId,
        sms: m.body,
        type: "plain",
        channel: m.channel === "whatsapp" ? "whatsapp" : (process.env.TERMII_CHANNEL ?? "generic"),
      }),
    });
    const json = (await res.json().catch(() => null)) as { message_id?: string; message?: string } | null;
    return res.ok && json?.message_id ? { ok: true, ref: json.message_id } : { ok: false, error: json?.message ?? `Termii responded ${res.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error" };
  }
};

export const PLATFORM_SENDER = process.env.TERMII_SENDER_ID ?? "SchoolHub";

/**
 * Sends queued messages across all schools, oldest first. Failed SMS are refunded.
 * Runs as the owner role: delivery is platform work, not one school's request.
 */
export async function drainOutbox(db: DB, transport: Transport = defaultTransport, limit = 200) {
  const batch = await db
    .select({ m: outboundMessages, schoolName: schools.name, senderId: sql<string | null>`${schools.commsSettings}->>'senderId'` })
    .from(outboundMessages)
    .innerJoin(schools, eq(schools.id, outboundMessages.schoolId))
    .where(eq(outboundMessages.status, "queued"))
    .orderBy(asc(outboundMessages.createdAt))
    .limit(limit);
  if (!batch.length) return { sent: 0, failed: 0 };
  // Claim the batch so a second drain running at the same time skips it.
  const ids = batch.map((b) => b.m.id);
  await db.update(outboundMessages).set({ status: "sent", sentAt: new Date() }).where(and(inArray(outboundMessages.id, ids), eq(outboundMessages.status, "queued")));
  let sent = 0;
  let failed = 0;
  for (const { m, senderId, schoolName } of batch) {
    const r = await transport({ channel: m.channel, to: m.to, subject: m.subject, body: m.body, senderId: senderId || PLATFORM_SENDER, schoolName });
    if (r.ok) {
      sent++;
      if (r.ref) await db.update(outboundMessages).set({ providerRef: r.ref }).where(eq(outboundMessages.id, m.id));
    } else {
      failed++;
      await db.update(outboundMessages).set({ status: "failed", error: (r.error ?? "Failed").slice(0, 300) }).where(eq(outboundMessages.id, m.id));
      if (m.credits > 0) await db.insert(creditLedger).values({ schoolId: m.schoolId, delta: m.credits, reason: "Refund for a message that failed to send", reference: `refund:${m.id}` });
    }
  }
  return { sent, failed };
}

/** Platform-paid SMS (login codes). Never touches a school's credits. */
export async function sendPlatformSms(to: string, body: string) {
  return defaultTransport({ channel: "sms", to, subject: null, body: smsSafe(body), senderId: PLATFORM_SENDER });
}
