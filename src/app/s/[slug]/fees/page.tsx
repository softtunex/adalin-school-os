import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, Progress, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatNaira, formatNairaCompact } from "@/lib/money";
import { can } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { getFeesOverview } from "@/lib/services/finance-report";
import { METHOD_LABEL } from "@/lib/services/payments";
import { CollectionsChart } from "./collections-chart";
import { GenerateInvoicesButton } from "./fees-client";
import { FeesTabs, formatDate, gated, TermFilter } from "./shared";

export const metadata: Metadata = { title: "Fees" };

export default async function FeesOverviewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ term?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const db = getDb();
  const result = await gated(slug, "fees_basic", () => Promise.all([getFeesOverview(db, access, sp.term), listClassOptions(db, access)]));

  if ("locked" in result) {
    return (
      <>
        <Topbar title="Fees" context={access.school.name} />
        <PageBody>{result.locked}</PageBody>
      </>
    );
  }

  const [o, classOptions] = result.data;
  const s = o.summary;
  const base = `/s/${slug}/fees`;
  const canInvoice = can(access, "fees:invoice");
  const methodTotal = o.methods.reduce((n, m) => n + m.amount, 0);

  return (
    <>
      <Topbar
        title="Fees"
        context={access.school.name}
        actions={canInvoice && s.invoices > 0 ? <GenerateInvoicesButton slug={slug} term={o.term} classes={classOptions} variant="secondary" /> : null}
      />
      <PageBody>
        <div className="flex flex-col gap-4">
          <FeesTabs slug={slug} current="overview" termId={sp.term} />
          <div className="flex flex-wrap items-center gap-2">
            <TermFilter terms={o.terms} />
          </div>
        </div>

        {s.invoices === 0 ? (
          <Card className="overflow-hidden">
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="fs-22 font-semibold">Start collecting fees for {o.term.label}</h2>
                <p className="mt-1 max-w-[60ch] fs-15 text-muted">Three steps: set what each class pays, raise every student&apos;s invoice in one go, then record payments as they come in. Parents get a link to pay online on the Standard plan.</p>
                <ol className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    { n: 1, t: "Set the fee structure", d: "Tuition, levies and extras per class", href: `${base}/structure` },
                    { n: 2, t: "Raise invoices", d: "One click for the whole school", href: null },
                    { n: 3, t: "Record payments", d: "Receipts are numbered for you", href: null },
                  ].map((step) => (
                    <li key={step.n} className="flex gap-3 rounded-chunk border border-line p-4">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand fs-14 font-bold text-white shadow-[0_2px_0_var(--brand-deep)]">{step.n}</span>
                      <span>
                        <span className="block fs-14.5 font-semibold text-ink">{step.href ? <Link href={step.href} className="hover:text-blue">{step.t}</Link> : step.t}</span>
                        <span className="block fs-13.5 text-muted">{step.d}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex flex-col gap-2.5">
                {can(access, "fees:manage") ? (
                  <ButtonLink href={`${base}/structure`} variant="secondary">
                    Set fee structure
                  </ButtonLink>
                ) : null}
                {canInvoice ? <GenerateInvoicesButton slug={slug} term={o.term} classes={classOptions} /> : null}
              </div>
            </div>
          </Card>
        ) : (
          <>
            <StatGrid>
              <StatCard label="Expected this term" value={formatNairaCompact(s.expected)} icon="file" tone="blue" caption={`${s.invoices} invoices${s.discounts ? ` · ${formatNairaCompact(s.discounts)} in discounts` : ""}`} />
              <StatCard
                label="Collected"
                value={formatNairaCompact(s.collected)}
                sub={`${s.rate}%`}
                icon="banknote"
                tone="success"
                progress={{ value: s.rate, tone: "success" }}
                caption={`${s.paid} fully paid · ${s.partial} part paid`}
              />
              <StatCard label="Outstanding" value={formatNairaCompact(s.outstanding)} icon="alert" tone={s.outstanding ? "warning" : "success"} caption={s.overdue ? `${s.overdue} overdue` : `${s.unpaid + s.partial} still owing`} />
              <StatCard label="Collected today" value={formatNairaCompact(o.today.amount)} icon="trending" tone="brand" caption={`${o.today.n} payment${o.today.n === 1 ? "" : "s"}`} />
            </StatGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Card className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="fs-16 font-semibold">Collections, last 30 days</h2>
                  <p className="tabular fs-14 text-muted">{formatNaira(o.series.reduce((n, d) => n + d.amount, 0))} in total</p>
                </div>
                <CollectionsChart series={o.series} />
              </Card>
              <Card className="flex flex-col gap-4 p-5">
                <h2 className="fs-16 font-semibold">How parents paid this term</h2>
                {o.methods.length === 0 ? (
                  <p className="fs-14.5 text-muted">No payments yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3.5">
                    {o.methods.map((m) => (
                      <li key={m.method} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-3 fs-14.5">
                          <span className="text-ink">{METHOD_LABEL[m.method]}</span>
                          <span className="tabular text-body">
                            {formatNaira(m.amount)} <span className="text-muted">· {m.n}</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full rounded-full bg-blue" style={{ width: `${methodTotal ? (m.amount / methodTotal) * 100 : 0}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <TableCard title="By class">
                <Table>
                  <thead>
                    <tr>
                      <Th>Class</Th>
                      <Th className="text-right">Expected</Th>
                      <Th className="text-right">Collected</Th>
                      <Th className="w-[28%]">Progress</Th>
                      <Th className="text-right">Owing</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.byClass.map((c) => {
                      const pct = c.expected ? (c.collected / c.expected) * 100 : 0;
                      return (
                        <tr key={c.classId ?? "none"}>
                          <Td>
                            <Link href={`${base}/invoices?class=${c.classId ?? ""}${sp.term ? `&term=${sp.term}` : ""}`} className="font-medium hover:text-blue">
                              {c.name ?? "No class"}
                            </Link>
                          </Td>
                          <Td className="tabular text-right">{formatNaira(c.expected)}</Td>
                          <Td className="tabular text-right">{formatNaira(c.collected)}</Td>
                          <Td>
                            <div className="flex items-center gap-2.5">
                              <div className="-mt-4 flex-1">
                                <Progress value={pct} tone={pct >= 100 ? "success" : pct >= 50 ? "blue" : "warning"} />
                              </div>
                              <span className="tabular w-11 text-right fs-13 text-muted">{Math.round(pct)}%</span>
                            </div>
                          </Td>
                          <Td className="text-right">{c.owing ? <Badge tone="warning">{c.owing}</Badge> : <Badge tone="success">0</Badge>}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableCard>
              <Card className="flex flex-col p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="fs-16 font-semibold">Latest payments</h2>
                  <Link href={`${base}/payments`} className="fs-14 font-medium text-blue">
                    View all
                  </Link>
                </div>
                {o.recent.length === 0 ? (
                  <EmptyState icon="banknote" title="No payments yet">
                    Open an invoice to record a payment.
                  </EmptyState>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {o.recent.map((r) => (
                      <li key={r.payment.id} className="flex items-center gap-3 py-2.5">
                        <Avatar name={`${r.firstName} ${r.lastName}`} size={34} />
                        <Link href={`${base}/invoices/${r.invoiceId}`} className="min-w-0 flex-1">
                          <span className="block truncate fs-14.5 font-medium text-ink">
                            {r.firstName} {r.lastName}
                          </span>
                          <span className="block truncate fs-13 text-muted">
                            {r.className ?? "No class"} · {METHOD_LABEL[r.payment.method]} · {formatDate(r.payment.paidOn)}
                          </span>
                        </Link>
                        <span className={`tabular fs-14.5 font-semibold ${r.payment.status === "reversed" ? "text-muted line-through" : "text-success"}`}>{formatNaira(r.payment.amountKobo)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            {s.outstanding > 0 ? (
              <Card className="flex flex-wrap items-center gap-3 p-4 fs-14.5 text-body">
                <Icon name="info" size={18} className="text-blue" />
                <span className="flex-1">
                  {s.unpaid + s.partial} {s.unpaid + s.partial === 1 ? "family still owes" : "families still owe"} {formatNaira(s.outstanding)} this term.
                </span>
                <ButtonLink href={`${base}/debtors${sp.term ? `?term=${sp.term}` : ""}`} size="sm" variant="secondary">
                  See debtors
                </ButtonLink>
              </Card>
            ) : null}
          </>
        )}
      </PageBody>
    </>
  );
}
