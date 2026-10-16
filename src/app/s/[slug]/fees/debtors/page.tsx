import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { EmptyState, StatCard, StatGrid, TableCard } from "@/components/ui/display";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatNairaCompact } from "@/lib/money";
import { can } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { DEBTOR_PAGE_SIZE, listDebtors } from "@/lib/services/invoices";
import { SendRemindersButton } from "../fees-client";
import { FeesTabs, formatDate, gated, TermFilter } from "../shared";
import { DebtorsTable } from "./debtors-table";

export const metadata: Metadata = { title: "Debtors" };

export default async function DebtorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ term?: string; q?: string; class?: string; when?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const db = getDb();
  const page = Number(sp.page) || 1;
  const result = await gated(slug, "debtors", () =>
    Promise.all([listDebtors(db, access, { termId: sp.term, q: sp.q, classId: sp.class, overdue: sp.when === "overdue", page }), listClassOptions(db, access)]),
  );
  if ("locked" in result) {
    return (
      <>
        <Topbar title="Debtors" context={access.school.name} />
        <PageBody>
          <FeesTabs slug={slug} current="debtors" termId={sp.term} />
          {result.locked}
        </PageBody>
      </>
    );
  }
  const [list, classes] = result.data;
  const s = list.summary;
  const canRemind = can(access, "fees:invoice");
  const filtered = Boolean(sp.q || sp.class || sp.when);
  const exportQs = new URLSearchParams(Object.entries({ term: sp.term, q: sp.q, class: sp.class, when: sp.when }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <Topbar
        title="Debtors"
        context={access.school.name}
        actions={canRemind && list.total > 0 ? <SendRemindersButton slug={slug} termId={list.term.id} label="Remind everyone" variant="primary" /> : null}
      />
      <PageBody>
        <FeesTabs slug={slug} current="debtors" termId={sp.term} />
        <StatGrid>
          <StatCard label="Families owing" value={s.unpaid + s.partial} icon="users" tone="warning" caption={`of ${s.invoices} invoices`} />
          <StatCard label="Total owed" value={formatNairaCompact(s.outstanding)} icon="alert" tone="danger" caption={list.term.label} />
          <StatCard label="Overdue" value={s.overdue} icon="calendar" tone={s.overdue ? "danger" : "success"} caption={s.overdue ? "Past their due date" : "Nobody past due"} />
          <StatCard label="Not paid anything" value={s.unpaid} icon="ban" tone="neutral" caption={`${s.partial} have part paid`} />
        </StatGrid>
        <TableCard
          title="Who owes"
          toolbar={
            <>
              <SearchInput placeholder="Name, admission or invoice no…" />
              <TermFilter terms={list.terms} />
              <FilterSelect label="Class" param="class" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
              <FilterSelect label="Show" param="when" options={[{ value: "overdue", label: "Overdue only" }]} />
              <ToolbarLink href={`/s/${slug}/fees/debtors/export${exportQs ? `?${exportQs}` : ""}`} icon="download">
                Export CSV
              </ToolbarLink>
            </>
          }
          footer={<Pagination page={page} pageSize={DEBTOR_PAGE_SIZE} total={list.total} noun="debtors" />}
        >
          {list.rows.length === 0 ? (
            <EmptyState icon="checkCircle" title={filtered ? "Nobody matches these filters" : "Nobody owes for this term"}>
              {filtered ? "Try a different search or clear the filters." : "Every invoice for this term is fully paid. Lovely."}
            </EmptyState>
          ) : (
            <DebtorsTable
              slug={slug}
              canRemind={canRemind}
              rows={list.rows.map((r) => ({
                invoiceId: r.invoice.id,
                number: r.invoice.number,
                name: `${r.student.firstName} ${r.student.lastName}`,
                admissionNo: r.student.admissionNo,
                className: r.className,
                owed: r.balance,
                paid: r.invoice.paidKobo,
                overdue: r.overdue,
                dueLabel: r.invoice.dueOn ? formatDate(r.invoice.dueOn) : null,
                contact: r.contact,
                remindedLabel: r.invoice.lastRemindedAt ? formatDate(r.invoice.lastRemindedAt.toISOString()) : null,
              }))}
            />
          )}
        </TableCard>
      </PageBody>
    </>
  );
}
