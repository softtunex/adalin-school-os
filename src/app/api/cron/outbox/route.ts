import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { drainOutbox } from "@/lib/services/outbox";

/** Safety net for messages queued while a request ended early. Protected by CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await drainOutbox(getDb(), undefined, 500));
}
