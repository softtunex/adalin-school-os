import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { sendEmail } from "@/lib/mail";
import { runAutoReminders } from "@/lib/services/fee-reminders";

/** Daily job (Vercel Cron). Protected by CRON_SECRET, which Vercel sends as a bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const baseUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const report = await runAutoReminders(getDb(), baseUrl, sendEmail);
  return Response.json({ ok: true, report });
}
