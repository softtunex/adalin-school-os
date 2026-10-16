import { getDb } from "@/lib/db/client";
import { confirmApplicationFee } from "@/lib/services/admissions";

/** Paystack sends the parent back here after paying the application fee. The webhook settles it too. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref") ?? "";
  let ok = false;
  try {
    ok = await confirmApplicationFee(getDb(), reference);
  } catch (error) {
    console.error("[apply] callback could not confirm", reference, error);
  }
  return Response.redirect(new URL(`/apply/${slug}/status/${token}?${ok ? "paid=1" : "failed=1"}`, request.url), 303);
}
