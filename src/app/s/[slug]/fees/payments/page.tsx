import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Avatar, Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PAYMENT_METHODS } from "@/lib/db/schema";
import { formatNaira, formatNairaCompact } from "@/lib/money";
import { lagosToday } from "@/lib/services/attendance";
import { listPayments, METHOD_LABEL, PAYMENT_PAGE_SIZE } from "@/lib/services/payments";
import { DateRange } from "./date-range";
import { FeesTabs, formatDate, gated } from "../shared";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string; method?: string; q?: string; status?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const page = Number(sp.page) || 1;
  const result = await gated(slug, "fees_basic", () => listPayments(getDb(), access, { ...sp, page }));
  if ("locked" in result) {
    return (
      <>
        <Topbar title="Payments" context={access.school.name} />
        <PageBody>{result.locked}</PageBody>
      </>
    );
  }
  const list = result.data;
  const base = `/s/${slug}/fees`;
  const filtered = Boolean(sp.q || sp.method || sp.from || sp.to || sp.status);
  const exportQs = new URLSearchParams(Object.entries({ from: sp.from, to: sp.to, method: sp.method, q: sp.q, status: sp.status }).filter(([, v]) => v) as [string, string][]).toString();
  const top = [...list.byMethod].sort((a, b) => b.amount - a.amount)[0];

  return (
    <>
      <Topbar title="Payments" context={access.school.name} />
      <PageBody>
        <FeesTabs slug={slug} current="payments" />
        <StatGrid>
          <StatCard label={filtered ? "Payments shown" : "All payments"} value={list.total} icon="receipt" tone="blue" caption={sp.from || sp.to ? `${sp.from ? formatDate(sp.from) : "Start"} to ${sp.to ? formatDate(sp.to) : "today"}` : "Every receipt issued"} />
          <StatCard label="Amount" value={formatNairaCompact(list.amount)} icon="banknote" tone="success" caption={sp.status === "reversed" ? "Reversed payments" : "Excludes reversed payments"} />
          <StatCard label="Most used" value={top ? METHOD_LABEL[top.method] : "—"} icon="creditCard" tone="violet" caption={top ? `${top.n} payment${top.n === 1 ? "" : "s"} · ${formatNairaCompact(top.amount)}` : "No payments yet"} />
          <StatCard label="Average payment" value={list.total ? formatNairaCompact(Math.round(list.amount / list.total)) : "—"} icon="trending" tone="brand" caption="Across the payments shown" />
        </StatGrid>

        <TableCard
          title="Receipts"
          toolbar={
            <>
              <SearchInput placeholder="Receipt, reference, name…" />
              <DateRange from={sp.from} to={sp.to} max={lagosToday()} />
              <FilterSelect label="Method" param="method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
              <FilterSelect
                label="Status"
                param="status"
                options={[
                  { value: "reversed", label: "Reversed" },
                  { value: "all", label: "Any status" },
                ]}
              />
              <ToolbarLink href={`${base}/payments/export${exportQs ? `?${exportQs}` : ""}`} icon="download">
                Export CSV
              </ToolbarLink>
            </>
          }
          footer={<Pagination page={page} pageSize={PAYMENT_PAGE_SIZE} total={list.total} noun="payments" />}
        >
          {list.rows.length === 0 ? (
            <EmptyState icon="banknote" title={filtered ? "No payments match these filters" : "No payments yet"}>
              {filtered ? "Try a different search or clear the filters." : "Payments appear here as you record them on invoices, or as parents pay online."}
            </EmptyState>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line border-t border-line md:hidden">
                {list.rows.map((r) => (
                  <li key={r.payment.id}>
                    <Link href={`${base}/invoices/${r.payment.invoiceId}`} className="flex items-center gap-3 px-4 py-3">
                      <Avatar name={`${r.student.firstName} ${r.student.lastName}`} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">
                          {r.student.firstName} {r.student.lastName}
                        </span>
                        <span className="block truncate fs-13 text-muted">
                          {r.payment.receiptNo} · {METHOD_LABEL[r.payment.method]} · {formatDate(r.payment.paidOn)}
                        </span>
                      </span>
                      <span className={`tabular fs-14.5 font-semibold ${r.payment.status === "reversed" ? "text-muted line-through" : "text-ink"}`}>{formatNaira(r.payment.amountKobo)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Student</Th>
                      <Th>Receipt</Th>
                      <Th>Method</Th>
                      <Th className="text-right">Amount</Th>
                      <Th className="w-12">
                        <span className="sr-only">Receipt</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((r) => (
                      <tr key={r.payment.id} className="group hover:bg-paper">
                        <Td className="tabular whitespace-nowrap text-body">{formatDate(r.payment.paidOn)}</Td>
                        <Td>
                          <Link href={`${base}/invoices/${r.payment.invoiceId}`} className="flex items-center gap-3">
                            <Avatar name={`${r.student.firstName} ${r.student.lastName}`} size={32} />
                            <span className="min-w-0">
                              <span className="block font-medium text-ink group-hover:text-blue">
                                {r.student.firstName} {r.student.lastName}
                              </span>
                              <span className="block fs-13 text-muted">
                                {r.className ?? "No class"} · {r.invoiceNumber}
                              </span>
                            </span>
                          </Link>
                        </Td>
                        <Td>
                          <span className="block font-mono fs-13.5">{r.payment.receiptNo}</span>
                          <span className="block fs-13 text-muted">{r.payment.reference ?? (r.recordedByName ? `by ${r.recordedByName}` : "")}</span>
                        </Td>
                        <Td>
                          {METHOD_LABEL[r.payment.method]}
                          {r.payment.status === "reversed" ? (
                            <Badge tone="danger" className="ml-2">
                              Reversed
                            </Badge>
                          ) : null}
                        </Td>
                        <Td className={`tabular text-right font-semibold ${r.payment.status === "reversed" ? "text-muted line-through" : ""}`}>{formatNaira(r.payment.amountKobo)}</Td>
                        <Td className="text-right">
                          <a href={`${base}/payments/${r.payment.id}/receipt`} target="_blank" rel="noreferrer" aria-label={`Download receipt ${r.payment.receiptNo}`} className="inline-grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink">
                            <Icon name="download" size={17} />
                          </a>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </TableCard>
      </PageBody>
    </>
  );
}
