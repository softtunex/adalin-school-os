import { getDb } from "@/lib/db/client";
import { deliverSoon } from "@/lib/deliver";
import { settleCreditPurchase } from "@/lib/services/credits";
import { handlePaystackEvent, verifyWebhookSignature } from "@/lib/services/paystack";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-paystack-signature"))) return new Response("Invalid signature", { status: 401 });
  try {
    const event = JSON.parse(raw);
    if (event?.event === "charge.success" && String(event.data?.reference ?? "").startsWith("sosc_")) await settleCreditPurchase(getDb(), event.data);
    else await handlePaystackEvent(getDb(), event);
    deliverSoon();
  } catch (error) {
    // Paystack retries on non-2xx; a mismatch we can't fix shouldn't be retried forever.
    console.error("[paystack] webhook", error);
    return new Response("Not processed", { status: 200 });
  }
  return new Response("ok");
}
