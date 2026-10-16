import { getDb } from "@/lib/db/client";
import { verifyCreditPurchase } from "@/lib/services/credits";

/** Paystack returns the buyer here after paying for message credits. The webhook settles it too. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? "";
  const slug = (url.searchParams.get("school") ?? "").replace(/[^a-z0-9-]/g, "");
  const ok = await verifyCreditPurchase(getDb(), reference).catch(() => false);
  const target = slug ? `/s/${slug}/settings?tab=messaging&${ok ? "bought=1" : "failed=1"}` : "/schools";
  return Response.redirect(new URL(target, request.url), 303);
}
