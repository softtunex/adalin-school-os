import { getDb } from "@/lib/db/client";
import { verifyBillPayment } from "@/lib/services/billing";

/** Paystack returns the proprietor here after paying a Adalin SchoolHub bill. The webhook settles it too. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? "";
  const slug = (url.searchParams.get("school") ?? "").replace(/[^a-z0-9-]/g, "");
  const ok = await verifyBillPayment(getDb(), reference).catch(() => false);
  const target = slug ? `/s/${slug}/settings?tab=plan&${ok ? "paid=1" : "failed=1"}` : "/schools";
  return Response.redirect(new URL(target, request.url), 303);
}
