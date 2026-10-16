import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Kola } from "@/components/illustrations/art";
import { Alert, initials } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { getPayPage } from "@/lib/services/paystack";
import { PayForm } from "./pay-form";

export const metadata: Metadata = { title: "Pay school fees", robots: { index: false, follow: false } };

function date(iso: string | null) {
  return iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; cancelled?: string; failed?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const page = await getPayPage(getDb(), token);
  if (!page) notFound();
  const { school, invoice, student, term, lines, balance } = page;
  const net = invoice.chargesKobo - invoice.discountKobo;
  const isVoid = invoice.status === "void";

  return (
    <div className="flex min-h-dvh flex-col items-center bg-paper px-4 py-8 sm:py-12">
      <div className="w-full max-w-[520px]">
        <div className="flex items-center gap-3">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="size-12 rounded-full border border-line object-cover" />
          ) : (
            <span className="grid size-12 place-items-center rounded-full bg-brand fs-17 font-bold text-white shadow-[0_3px_0_var(--brand-deep)]">{initials(school.name)}</span>
          )}
          <div className="min-w-0">
            <p className="truncate fs-17 font-semibold text-ink">{school.name}</p>
            <p className="fs-13.5 text-muted">{[school.phone, school.email].filter(Boolean).join(" · ") || "School fees"}</p>
          </div>
        </div>

        {sp.paid ? (
          <Alert tone="success" title="Payment received, thank you" className="mt-6">
            The school has your payment on record{balance > 0 ? `. ${formatNaira(balance)} is still outstanding on this invoice.` : " and this invoice is now fully paid."}
          </Alert>
        ) : null}
        {sp.cancelled || sp.failed ? (
          <Alert tone="warning" title="The payment didn't go through" className="mt-6">
            You haven&apos;t been charged. You can try again below.
          </Alert>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-card border border-line bg-canvas shadow-card">
          <div className="border-b border-line p-5 sm:p-6">
            <p className="fs-13 font-medium uppercase tracking-[0.06em] text-muted">
              {invoice.title} · {term.label}
            </p>
            <p className="mt-1 fs-22 font-semibold text-ink">{student.name}</p>
            <p className="fs-14 text-muted">
              {student.className ? `${student.className} · ` : ""}
              <span className="font-mono">{invoice.number}</span>
              {invoice.dueOn ? ` · due ${date(invoice.dueOn)}` : ""}
            </p>
          </div>
          <ul className="flex flex-col px-5 py-3 sm:px-6">
            {lines.map((l) => (
              <li key={l.id} className={`flex justify-between gap-4 py-2 fs-14.5 ${l.kind === "discount" ? "text-success" : "text-body"}`}>
                <span>{l.description}</span>
                <span className="tabular">
                  {l.kind === "discount" ? "−" : ""}
                  {formatNaira(l.amountKobo)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-1.5 border-t border-line px-5 py-4 fs-14.5 sm:px-6">
            <div className="flex justify-between text-body">
              <dt>Total</dt>
              <dd className="tabular">{formatNaira(net)}</dd>
            </div>
            <div className="flex justify-between text-body">
              <dt>Paid so far</dt>
              <dd className="tabular">{formatNaira(invoice.paidKobo)}</dd>
            </div>
            <div className="flex justify-between fs-18 font-semibold text-ink">
              <dt>Balance</dt>
              <dd className="tabular">{formatNaira(Math.max(0, balance))}</dd>
            </div>
          </dl>
          <div className="border-t border-line bg-paper/60 p-5 sm:p-6">
            {isVoid ? (
              <p className="fs-14.5 text-muted">This invoice has been cancelled by the school. Please contact them for an updated one.</p>
            ) : balance <= 0 ? (
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-success text-white">
                  <Icon name="check" size={20} strokeWidth={3} />
                </span>
                <p className="fs-15 font-semibold text-ink">Fully paid. Thank you.</p>
              </div>
            ) : page.canPayOnline ? (
              <>
                {page.mode === "test" ? (
                  <Alert tone="blue" className="mb-4">
                    Test mode: no real money moves. Online payment goes live once the Paystack keys are added.
                  </Alert>
                ) : null}
                <PayForm token={token} balance={balance} balanceLabel={formatNaira(balance)} />
                <p className="mt-3 flex items-center justify-center gap-1.5 fs-13 text-muted">
                  <Icon name="lock" size={14} /> Card, bank transfer or USSD, secured by Paystack
                </p>
              </>
            ) : null}
            {!isVoid && balance > 0 && school.bank ? (
              <div className={page.canPayOnline ? "mt-5 border-t border-line pt-4" : ""}>
                <p className="fs-14 font-semibold text-ink">{page.canPayOnline ? "Or pay by bank transfer" : "Pay by bank transfer"}</p>
                <p className="mt-1 fs-14.5 text-body">
                  {school.bank.accountName}
                  <br />
                  {school.bank.name} · <span className="tabular font-mono">{school.bank.accountNumber}</span>
                </p>
                <p className="mt-1 fs-13.5 text-muted">Use {invoice.number} as the reference, then send your receipt to the school.</p>
              </div>
            ) : null}
            {!isVoid && balance > 0 && !page.canPayOnline && !school.bank ? <p className="fs-14.5 text-muted">Please contact the school to pay.</p> : null}
          </div>
        </div>
        {school.note ? <p className="mt-4 text-center fs-13 text-muted">{school.note}</p> : null}
        <div className="mt-10 flex items-center justify-center gap-2 fs-13 text-muted">
          <Kola className="h-7 w-6" /> Powered by School OS
        </div>
      </div>
    </div>
  );
}
