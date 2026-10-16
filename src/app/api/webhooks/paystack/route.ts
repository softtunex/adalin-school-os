import { getDb } from "@/lib/db/client";
import { handlePaystackEvent, verifyWebhookSignature } from "@/lib/services/paystack";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-paystack-signature"))) return new Response("Invalid signature", { status: 401 });
  try {
    await handlePaystackEvent(getDb(), JSON.parse(raw));
  } catch (error) {
    // Paystack retries on non-2xx; a mismatch we can't fix shouldn't be retried forever.
    console.error("[paystack] webhook", error);
    return new Response("Not processed", { status: 200 });
  }
  return new Response("ok");
}
