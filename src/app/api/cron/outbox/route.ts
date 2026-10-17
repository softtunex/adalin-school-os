import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { drainOutbox } from "@/lib/services/outbox";
import { drainWebhooks } from "@/lib/services/webhooks";

/** Safety net for messages and webhooks queued while a request ended early, and webhook retries. Protected by CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getDb();
  return Response.json({ messages: await drainOutbox(db, undefined, 500), webhooks: await drainWebhooks(db, { limit: 300 }) });
}
