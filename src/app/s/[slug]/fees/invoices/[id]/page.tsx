import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyField } from "@/components/copy-field";
import { PageBody, Topbar } from "@/components/topbar";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Avatar, Badge, Card, Progress } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { appUrl, requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { lagosToday } from "@/lib/services/attendance";
import { getInvoice } from "@/lib/services/invoices";
import { METHOD_LABEL } from "@/lib/services/payments";
import { paystackMode } from "@/lib/services/paystack";
import { RecordPaymentButton, SendRemindersButton } from "../../fees-client";
import { formatDate, InvoiceStatusBadge } from "../../shared";
import { AddLineButton, RemoveLineButton, ReversePaymentButton, VoidInvoiceButton } from "./invoice-client";

export const metadata: Metadata = { title: "Invoice" };

function phone(p: string | null) {
  return p?.startsWith("+234") && p.length === 14 ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p;
}

export default async function InvoicePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const access = await requirePageAccess(slug, ["fees:view"]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let data: Awaited<ReturnType<typeof getInvoice>>;
  try {
    data = await getInvoice(getDb(), access, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "upgrade")) notFound();
    throw error;
  }
  const { invoice, student, lines, payments, contacts, items, balance, term } = data;
  const base = `/s/${slug}/fees`;
  const today = lagosToday();
  const isVoid = invoice.status === "void";
  const overdue = !isVoid && invoice.status !== "paid" && !!invoice.dueOn && invoice.dueOn < today;
  const net = invoice.chargesKobo - invoice.discountKobo;
  const paidPct = net > 0 ? (invoice.paidKobo / net) * 100 : 100;
  const charges = lines.filter((l) => l.kind === "charge");
  const discounts = lines.filter((l) => l.kind === "discount");
  const editable = !isVoid && can(access, "fees:invoice");
  const onlineReady = hasFeature(access.plan, "fees_online") && !!access.school.paystackSubaccount && paystackMode() !== "off";
  const payUrl = `${await appUrl()}/pay/${invoice.payToken}`;
  const studentName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");

  return (
    <>
      <Topbar
        title={invoice.number}
        context={studentName}
        actions={
          <>
            <a href={`${base}/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <Icon name="download" size={18} />
              <span className="hidden sm:inline">Download PDF</span>
            </a>
            {!isVoid && balance > 0 && can(access, "fees:record_payment") ? (
              <RecordPaymentButton slug={slug} today={today} invoice={{ id: invoice.id, number: invoice.number, balance: Math.max(0, balance), balanceLabel: formatNaira(Math.max(0, balance)), hasEmail: contacts.some((c) => c.email) }} />
            ) : null}
          </>
        }
      />
      <PageBody>
        <Link href={`${base}/invoices`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} />
          All invoices
        </Link>
        {isVoid ? (
          <Alert tone="warning" title="This invoice was voided">
            {invoice.voidReason} · {invoice.voidedAt ? formatDate(invoice.voidedAt.toISOString()) : ""}
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Card className="p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
                <div>
                  <p className="fs-13 font-medium uppercase tracking-[0.06em] text-muted">Invoice</p>
                  <p className="mt-1 font-mono fs-20 font-semibold text-ink">{invoice.number}</p>
                  <p className="mt-1 fs-14.5 text-body">
                    {invoice.title} · {term.label}
                  </p>
                </div>
                <InvoiceStatusBadge status={invoice.status} overdue={overdue} />
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-line py-5 sm:grid-cols-4">
                {[
                  ["Student", <Link key="s" href={`/s/${slug}/students/${student.id}`} className="text-blue hover:underline">{studentName}</Link>],
                  ["Admission no", <span key="a" className="font-mono">{student.admissionNo}</span>],
                  ["Class", data.className ?? "No class"],
                  ["Due", invoice.dueOn ? formatDate(invoice.dueOn) : "On receipt"],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt className="fs-13 text-muted">{k}</dt>
                    <dd className="mt-0.5 fs-14.5 font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <table className="mt-2 w-full fs-14.5">
                <thead>
                  <tr className="text-left fs-13 text-muted">
                    <th className="py-2.5 font-medium">Item</th>
                    <th className="py-2.5 text-right font-medium">Amount</th>
                    {editable ? <th className="w-10" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {charges.map((l) => (
                    <tr key={l.id} className="border-t border-line">
                      <td className="py-3 text-ink">{l.description}</td>
                      <td className="tabular py-3 text-right text-ink">{formatNaira(l.amountKobo)}</td>
                      {editable ? <td className="py-1.5 text-right">{charges.length > 1 ? <RemoveLineButton slug={slug} lineId={l.id} label={l.description} /> : null}</td> : null}
                    </tr>
                  ))}
                  {discounts.map((l) => (
                    <tr key={l.id} className="border-t border-line">
                      <td className="py-3 text-success">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="percent" size={14} />
                          {l.description}
                        </span>
                      </td>
                      <td className="tabular py-3 text-right text-success">−{formatNaira(l.amountKobo)}</td>
                      {editable ? <td className="py-1.5 text-right">{can(access, "fees:discount") ? <RemoveLineButton slug={slug} lineId={l.id} label={l.description} /> : null}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="ml-auto mt-3 flex max-w-xs flex-col gap-2 border-t border-line pt-4 fs-14.5">
                {discounts.length ? (
                  <div className="flex justify-between text-body">
                    <dt>Subtotal</dt>
                    <dd className="tabular">{formatNaira(invoice.chargesKobo)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between font-semibold text-ink">
                  <dt>Total</dt>
                  <dd className="tabular">{formatNaira(net)}</dd>
                </div>
                <div className="flex justify-between text-body">
                  <dt>Paid</dt>
                  <dd className="tabular">{formatNaira(invoice.paidKobo)}</dd>
                </div>
                <div className="flex justify-between fs-16 font-semibold text-ink">
                  <dt>{balance < 0 ? "Overpaid" : "Balance"}</dt>
                  <dd className="tabular">{formatNaira(Math.abs(balance))}</dd>
                </div>
              </dl>
              {editable ? (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  <AddLineButton slug={slug} invoiceId={invoice.id} kind="charge" items={items} />
                  {can(access, "fees:discount") && hasFeature(access.plan, "debtors") ? <AddLineButton slug={slug} invoiceId={invoice.id} kind="discount" items={items} /> : null}
                  <span className="flex-1" />
                  <VoidInvoiceButton slug={slug} invoiceId={invoice.id} disabledReason={invoice.paidKobo > 0 ? "Reverse the payments before voiding" : undefined} />
                </div>
              ) : null}
            </Card>

            <Card className="p-5">
              <h2 className="fs-16 font-semibold">Payments</h2>
              {payments.length === 0 ? (
                <p className="mt-2 fs-14.5 text-muted">No payments recorded yet.</p>
              ) : (
                <ul className="mt-2 flex flex-col divide-y divide-line">
                  {payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${p.status === "reversed" ? "bg-sunken text-muted" : "bg-success-wash text-success"}`}>
                        <Icon name={p.method === "paystack" ? "creditCard" : "banknote"} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`tabular block fs-15 font-semibold ${p.status === "reversed" ? "text-muted line-through" : "text-ink"}`}>{formatNaira(p.amountKobo)}</span>
                        <span className="block fs-13 text-muted">
                          {METHOD_LABEL[p.method]} · {formatDate(p.paidOn)} · <span className="font-mono">{p.receiptNo}</span>
                          {p.reference ? ` · ref ${p.reference}` : ""}
                          {p.recordedByName ? ` · by ${p.recordedByName}` : ""}
                        </span>
                        {p.status === "reversed" ? <span className="mt-1 block fs-13 text-danger">Reversed: {p.reversalReason}</span> : null}
                      </span>
                      {p.status === "reversed" ? (
                        <Badge>Reversed</Badge>
                      ) : (
                        <span className="flex items-center gap-1">
                          <a href={`${base}/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 fs-13.5 font-medium text-blue hover:bg-blue-wash">
                            <Icon name="receipt" size={15} />
                            Receipt
                          </a>
                          {can(access, "fees:refund") ? <ReversePaymentButton slug={slug} paymentId={p.id} receiptNo={p.receiptNo} online={p.method === "paystack"} /> : null}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card className="p-5">
              <p className="fs-14 text-muted">{balance > 0 ? "Still owing" : "Balance"}</p>
              <p className={`tabular mt-1 fs-30 font-semibold leading-none tracking-[-0.02em] ${balance > 0 ? (overdue ? "text-danger" : "text-ink") : "text-success"}`}>{formatNaira(Math.max(0, balance))}</p>
              <Progress value={paidPct} tone={paidPct >= 100 ? "success" : "brand"} label="Paid" />
              <p className="mt-2 fs-13.5 text-muted">
                {formatNaira(invoice.paidKobo)} of {formatNaira(net)} paid
              </p>
            </Card>

            {!isVoid && balance > 0 ? (
              <Card className="flex flex-col gap-3 p-5">
                <h2 className="fs-16 font-semibold">Pay link</h2>
                {onlineReady ? (
                  <>
                    <p className="fs-14 text-muted">Send this to the parent. They can see the invoice and pay by card, transfer or USSD. The payment and receipt are recorded automatically.</p>
                    <CopyField value={payUrl} label="Pay link" />
                  </>
                ) : hasFeature(access.plan, "fees_online") ? (
                  <p className="fs-14 text-muted">
                    Add your school&apos;s bank account in{" "}
                    <Link href={`/s/${slug}/settings?tab=payments`} className="font-medium text-blue">
                      Settings → Payments
                    </Link>{" "}
                    to let parents pay online.
                  </p>
                ) : (
                  <p className="fs-14 text-muted">Online payment links are on the Standard plan. Parents can still pay by transfer to the account printed on the invoice.</p>
                )}
              </Card>
            ) : null}

            <Card className="flex flex-col gap-3 p-5">
              <h2 className="fs-16 font-semibold">Parents</h2>
              {contacts.length === 0 ? (
                <p className="fs-14 text-muted">No parent contact on file. Add one on the student&apos;s profile so reminders and receipts can reach home.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {contacts.map((c) => (
                    <li key={c.name} className="flex items-center gap-3">
                      <Avatar name={c.name} size={34} muted />
                      <span className="min-w-0">
                        <span className="block truncate fs-14.5 font-medium text-ink">{c.name}</span>
                        <span className="block truncate fs-13 text-muted">{[phone(c.phone), c.email].filter(Boolean).join(" · ") || "No phone or email"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!isVoid && balance > 0 && hasFeature(access.plan, "debtors") && can(access, "fees:invoice") && contacts.some((c) => c.email) ? (
                <SendRemindersButton slug={slug} invoiceIds={[invoice.id]} label="Email a reminder" size="sm" />
              ) : null}
              {invoice.lastRemindedAt ? <p className="fs-13 text-muted">Last reminded {formatDate(invoice.lastRemindedAt.toISOString())}</p> : null}
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
