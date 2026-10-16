import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import { paymentIntents } from "@/lib/db/schema";
import { formatNaira } from "@/lib/money";
import { paystackMode } from "@/lib/services/paystack";
import { finishTestPaymentAction } from "../actions";

export const metadata = { title: "Test checkout", robots: { index: false } };

/** Stands in for Paystack's checkout when no live keys are configured (never in production). */
export default async function TestCheckoutPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ reference?: string }> }) {
  if (paystackMode() !== "test") notFound();
  const { token } = await params;
  const { reference } = await searchParams;
  if (!reference || !/^sos_[0-9a-f]{24}$/.test(reference)) notFound();
  const [intent] = await getDb().select().from(paymentIntents).where(eq(paymentIntents.reference, reference));
  if (!intent || intent.status !== "pending") notFound();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0b1a2b] px-4">
      <div className="w-full max-w-[380px] rounded-[18px] bg-white p-6 text-[#1d1d1f] shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-md bg-[#e7f6ec] px-2 py-1 fs-12 font-bold uppercase tracking-[0.06em] text-[#0ba360]">Test checkout</span>
          <span className="truncate fs-13 text-[#84848b]">{intent.email}</span>
        </div>
        <p className="mt-6 fs-14 text-[#84848b]">Pay</p>
        <p className="tabular fs-32 font-semibold">{formatNaira(intent.amountKobo)}</p>
        <p className="mt-4 rounded-lg bg-[#f4f4f5] p-3 fs-13.5 text-[#4a4a4f]">This page imitates Paystack so the payment flow can be tried without moving money. With live keys, parents see Paystack&apos;s real checkout here.</p>
        <form className="mt-6 flex flex-col gap-2.5">
          <Button type="submit" variant="success" size="lg" formAction={finishTestPaymentAction.bind(null, token, reference, true)}>
            Pay {formatNaira(intent.amountKobo)}
          </Button>
          <Button type="submit" variant="ghost" formAction={finishTestPaymentAction.bind(null, token, reference, false)} className="text-[#4a4a4f]">
            Cancel
          </Button>
        </form>
      </div>
    </div>
  );
}
