import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { getApplicationStatus } from "@/lib/services/admissions";
import { paystackMode } from "@/lib/services/paystack";
import { finishTestFeeAction } from "../../../actions";

export const metadata = { title: "Test checkout", robots: { index: false } };

/** Stands in for Paystack's checkout when no live keys are configured (never in production). */
export default async function TestFeeCheckout({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ reference?: string }> }) {
  if (paystackMode() !== "test") notFound();
  const { slug, token } = await params;
  const { reference } = await searchParams;
  if (!reference || !/^sosa_[0-9a-f]{24}$/.test(reference)) notFound();
  const s = await getApplicationStatus(getDb(), slug, token);
  if (!s || s.a.payReference !== reference || s.a.feePaid) notFound();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0b1a2b] px-4">
      <div className="w-full max-w-[380px] rounded-[18px] bg-white p-6 text-[#1d1d1f] shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-md bg-[#e7f6ec] px-2 py-1 fs-12 font-bold uppercase tracking-[0.06em] text-[#0ba360]">Test checkout</span>
          <span className="truncate fs-13 text-[#84848b]">{s.a.guardianEmail}</span>
        </div>
        <p className="mt-6 fs-14 text-[#84848b]">Application fee · {s.page.school.name}</p>
        <p className="tabular fs-32 font-semibold">{formatNaira(s.a.feeKobo)}</p>
        <p className="mt-4 rounded-lg bg-[#f4f4f5] p-3 fs-13.5 text-[#4a4a4f]">This page imitates Paystack so the flow can be tried without moving money. With live keys, parents see Paystack&apos;s real checkout here.</p>
        <form className="mt-6 flex flex-col gap-2.5">
          <Button type="submit" variant="success" size="lg" formAction={finishTestFeeAction.bind(null, slug, token, reference, true)}>
            Pay {formatNaira(s.a.feeKobo)}
          </Button>
          <Button type="submit" variant="ghost" formAction={finishTestFeeAction.bind(null, slug, token, reference, false)} className="text-[#4a4a4f]">
            Cancel
          </Button>
        </form>
      </div>
    </div>
  );
}
