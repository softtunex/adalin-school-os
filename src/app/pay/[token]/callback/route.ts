import { getDb } from "@/lib/db/client";
import { confirmOnlinePayment } from "@/lib/services/paystack";

/** Paystack sends the parent back here after checkout. The webhook settles it too; whichever arrives first wins. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref") ?? "";
  let ok = false;
  try {
    ok = (await confirmOnlinePayment(getDb(), reference)).ok;
  } catch (error) {
    console.error("[pay] callback could not confirm", reference, error);
  }
  return Response.redirect(new URL(`/pay/${token}?${ok ? "paid=1" : "failed=1"}`, request.url), 303);
}
