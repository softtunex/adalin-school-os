import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Avatar, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatNaira, formatNairaCompact } from "@/lib/money";
import { can } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { INVOICE_PAGE_SIZE, listInvoices } from "@/lib/services/invoices";
import { GenerateInvoicesButton } from "../fees-client";
import { FeesTabs, formatDate, gated, InvoiceStatusBadge, TermFilter } from "../shared";
import { termGate } from "@/components/term-gate";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ term?: string; q?: string; class?: string; status?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const gate = await termGate(access, { title: "Invoices", icon: "receipt", what: "Invoices", feature: "fees_basic" });
  if (gate) return gate;
  const db = getDb();
  const page = Number(sp.page) || 1;
  const result = await gated(slug, "fees_basic", () => Promise.all([listInvoices(db, access, { termId: sp.term, q: sp.q, classId: sp.class, status: sp.status, page }), listClassOptions(db, access)]));
  if ("locked" in result) {
    return (
      <>
        <Topbar title="Invoices" context={access.school.name} />
        <PageBody>{result.locked}</PageBody>
      </>
    );
  }
  const [list, classes] = result.data;
  const s = list.summary;
  const base = `/s/${slug}/fees`;
  const filtered = Boolean(sp.q || sp.class || sp.status);
  const exportQs = new URLSearchParams(Object.entries({ term: sp.term, q: sp.q, class: sp.class, status: sp.status }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <Topbar title="Invoices" context={access.school.name} actions={can(access, "fees:invoice") ? <GenerateInvoicesButton slug={slug} term={list.term} classes={classes} /> : null} />
      <PageBody>
        <FeesTabs slug={slug} current="invoices" termId={sp.term} />
        <StatGrid>
          <StatCard label="Invoices" value={s.invoices} icon="file" tone="blue" caption={list.term.label} />
          <StatCard label="Paid in full" value={s.paid} icon="checkCircle" tone="success" caption={s.invoices ? `${Math.round((s.paid / s.invoices) * 100)}% of invoices` : "None yet"} />
          <StatCard label="Part paid" value={s.partial} icon="banknote" tone="warning" caption={`${s.unpaid} not started`} />
          <StatCard label="Outstanding" value={formatNairaCompact(s.outstanding)} icon="alert" tone={s.overdue ? "danger" : "neutral"} caption={s.overdue ? `${s.overdue} overdue` : "Nothing overdue"} />
        </StatGrid>

        <TableCard
          title="All invoices"
          toolbar={
            <>
              <SearchInput placeholder="Name, admission or invoice no…" />
              <TermFilter terms={list.terms} />
              <FilterSelect label="Class" param="class" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
              <FilterSelect
                label="Status"
                param="status"
                options={[
                  { value: "owing", label: "Owing" },
                  { value: "overdue", label: "Overdue" },
                  { value: "unpaid", label: "Unpaid" },
                  { value: "partial", label: "Part paid" },
                  { value: "paid", label: "Paid" },
                  { value: "void", label: "Void" },
                ]}
              />
              <ToolbarLink href={`${base}/invoices/export${exportQs ? `?${exportQs}` : ""}`} icon="download">
                Export CSV
              </ToolbarLink>
            </>
          }
          footer={<Pagination page={page} pageSize={INVOICE_PAGE_SIZE} total={list.total} noun="invoices" />}
        >
          {list.rows.length === 0 ? (
            <EmptyState
              icon="file"
              title={filtered ? "No invoices match these filters" : `No invoices for ${list.term.label} yet`}
              action={
                !filtered && can(access, "fees:manage") ? (
                  <ButtonLink href={`${base}/structure`} variant="secondary">
                    Check the fee structure
                  </ButtonLink>
                ) : null
              }
            >
              {filtered ? "Try a different search or clear the filters." : "Set what each class pays, then raise every student's invoice in one go."}
            </EmptyState>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line border-t border-line md:hidden">
                {list.rows.map((r) => (
                  <li key={r.invoice.id}>
                    <Link href={`${base}/invoices/${r.invoice.id}`} className="flex items-center gap-3 px-4 py-3">
                      <Avatar name={`${r.student.firstName} ${r.student.lastName}`} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">
                          {r.student.firstName} {r.student.lastName}
                        </span>
                        <span className="block truncate fs-13 text-muted">
                          {r.invoice.number} · {r.className ?? "No class"}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="tabular fs-14.5 font-semibold text-ink">{formatNaira(Math.max(0, r.balance))}</span>
                        <InvoiceStatusBadge status={r.invoice.status} overdue={r.overdue} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <Th>Student</Th>
                      <Th>Invoice</Th>
                      <Th className="text-right">Amount</Th>
                      <Th className="text-right">Paid</Th>
                      <Th className="text-right">Balance</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((r) => (
                      <tr key={r.invoice.id} className="group hover:bg-paper">
                        <Td>
                          <Link href={`${base}/invoices/${r.invoice.id}`} className="flex items-center gap-3">
                            <Avatar name={`${r.student.firstName} ${r.student.lastName}`} size={34} />
                            <span className="min-w-0">
                              <span className="block font-medium text-ink group-hover:text-blue">
                                {r.student.firstName} {r.student.lastName}
                              </span>
                              <span className="block fs-13 text-muted">{r.className ?? "No class"}</span>
                            </span>
                          </Link>
                        </Td>
                        <Td>
                          <span className="block font-mono fs-13.5">{r.invoice.number}</span>
                          <span className="block fs-13 text-muted">
                            {r.invoice.title}
                            {r.invoice.dueOn ? ` · due ${formatDate(r.invoice.dueOn)}` : ""}
                          </span>
                        </Td>
                        <Td className="tabular text-right">{formatNaira(r.invoice.chargesKobo - r.invoice.discountKobo)}</Td>
                        <Td className="tabular text-right text-body">{formatNaira(r.invoice.paidKobo)}</Td>
                        <Td className="tabular text-right font-semibold">{r.invoice.status === "void" ? "—" : formatNaira(Math.max(0, r.balance))}</Td>
                        <Td>
                          <InvoiceStatusBadge status={r.invoice.status} overdue={r.overdue} />
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
