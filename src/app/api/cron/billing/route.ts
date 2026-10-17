import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { drainOutbox } from "@/lib/services/outbox";
import { runBilling } from "@/lib/services/billing";

/** Daily job (Vercel Cron): trials, term bills, reminders and read-only for long-overdue bills. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getDb();
  const report = await runBilling(db);
  await drainOutbox(db);
  return Response.json({ ok: true, report });
}
