import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/data";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th, type Tone } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { EXPENSE_CATEGORIES } from "@/lib/db/schema";
import { formatNaira, formatNairaCompact } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";
import { lagosToday } from "@/lib/services/attendance";
import { EXPENSE_PAGE_SIZE, listExpenses } from "@/lib/services/expenses";
import { getIncomeStatement } from "@/lib/services/finance-report";
import { DateRange } from "../fees/payments/date-range";
import { formatDate } from "../fees/shared";
import { AddExpenseButton, ExpenseActions } from "./expenses-client";

export const metadata: Metadata = { title: "Expenses" };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};
const METHOD: Record<string, string> = { cash: "Cash", transfer: "Transfer", pos: "POS", cheque: "Cheque" };

type SP = { tab?: string; from?: string; to?: string; category?: string; status?: string; q?: string; page?: string };

export default async function ExpensesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["expenses:view", "fees:report"]);
  const tab = sp.tab === "statement" ? "statement" : "expenses";
  const today = lagosToday();
  const base = `/s/${slug}/expenses`;

  if (!hasFeature(access.plan, "expenses")) {
    return (
      <>
        <Topbar title="Expenses" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="expenses" text="Record what the school spends, get approvals, and see income against spending for any period." />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={tab === "statement" ? "Income statement" : "Expenses"}
        context={access.school.name}
        actions={tab === "expenses" && can(access, "expenses:create") ? <AddExpenseButton slug={slug} today={today} approves={can(access, "expenses:approve")} /> : null}
      />
      <PageBody>
        <Tabs
          current={tab}
          tabs={[
            ...(can(access, "expenses:view") ? [{ key: "expenses", label: "Expenses", href: base }] : []),
            { key: "statement", label: "Income statement", href: `${base}?tab=statement` },
          ]}
        />
        {tab === "statement" || !can(access, "expenses:view") ? <Statement access={access} sp={sp} today={today} base={base} /> : <ExpenseList slug={slug} access={access} sp={sp} today={today} />}
      </PageBody>
    </>
  );
}

async function ExpenseList({ slug, access, sp, today }: { slug: string; access: Access; sp: SP; today: string }) {
  const page = Number(sp.page) || 1;
  const list = await listExpenses(getDb(), access, { from: sp.from, to: sp.to, category: sp.category, status: sp.status, q: sp.q, page });
  const filtered = Boolean(sp.q || sp.category || sp.status || sp.from || sp.to);
  const top = list.topCategories[0];
  const canApprove = can(access, "expenses:approve");

  return (
    <>
      <StatGrid>
        <StatCard label="Spent this month" value={formatNairaCompact(list.thisMonth)} icon="receipt" tone="brand" caption="Approved expenses" />
        <StatCard label="Awaiting approval" value={list.pending.n} icon="alert" tone={list.pending.n ? "warning" : "success"} caption={list.pending.n ? formatNaira(list.pending.amount) : "Nothing waiting"} />
        <StatCard label="Biggest cost this month" value={top ? top.category : "—"} icon="trending" tone="violet" caption={top ? formatNaira(top.amount) : "No spending yet"} />
        <StatCard label={filtered ? "Shown" : "All recorded"} value={formatNairaCompact(list.amount)} icon="file" tone="blue" caption={`${list.total} expense${list.total === 1 ? "" : "s"}`} />
      </StatGrid>
      <TableCard
        title="Expenses"
        toolbar={
          <>
            <SearchInput placeholder="Description, vendor, reference…" />
            <DateRange from={sp.from} to={sp.to} max={today} />
            <FilterSelect label="Category" param="category" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <FilterSelect label="Status" param="status" options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          </>
        }
        footer={<Pagination page={page} pageSize={EXPENSE_PAGE_SIZE} total={list.total} noun="expenses" />}
      >
        {list.rows.length === 0 ? (
          <EmptyState icon="receipt" title={filtered ? "No expenses match these filters" : "No expenses recorded yet"}>
            {filtered ? "Try a different search or clear the filters." : "Record diesel, repairs, salaries and every other cost, and see them against fee income in the income statement."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Expense</Th>
                <Th>Category</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th className="w-12">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(({ expense: e, recordedByName }) => (
                <tr key={e.id} className="hover:bg-paper">
                  <Td className="tabular whitespace-nowrap text-body">{formatDate(e.spentOn)}</Td>
                  <Td>
                    <span className="block font-medium text-ink">{e.description}</span>
                    <span className="block fs-13 text-muted">
                      {[e.vendor, METHOD[e.method], e.reference, recordedByName ? `by ${recordedByName}` : null].filter(Boolean).join(" · ")}
                    </span>
                    {e.status === "rejected" && e.rejectionReason ? <span className="block fs-13 text-danger">{e.rejectionReason}</span> : null}
                  </Td>
                  <Td className="text-body">{e.category}</Td>
                  <Td className={cn("tabular text-right font-semibold", e.status === "rejected" && "text-muted line-through")}>{formatNaira(e.amountKobo)}</Td>
                  <Td>
                    <Badge tone={STATUS[e.status].tone} dot>
                      {STATUS[e.status].label}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <ExpenseActions
                      slug={slug}
                      expense={{ id: e.id, description: e.description, status: e.status }}
                      canDecide={canApprove}
                      canDelete={canApprove || (e.status === "pending" && e.recordedBy === access.membershipId)}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </>
  );
}

function shift(iso: string, months: number) {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function Statement({ access, sp, today, base }: { access: Access; sp: SP; today: string; base: string }) {
  const presets = [
    { key: "month", label: "This month", from: `${today.slice(0, 8)}01`, to: today },
    { key: "last", label: "Last month", from: shift(today, -1), to: (() => { const d = new Date(`${today.slice(0, 8)}01T12:00:00Z`); d.setUTCDate(0); return d.toISOString().slice(0, 10); })() },
    { key: "quarter", label: "Last 3 months", from: shift(today, -2), to: today },
    { key: "year", label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
  const from = sp.from ?? presets[3].from;
  const to = sp.to ?? today;
  const st = await getIncomeStatement(getDb(), access, { from, to });
  const maxRow = Math.max(1, ...st.income.map((r) => r.amount), ...st.expenses.map((r) => r.amount));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <Link
              key={p.key}
              href={`${base}?tab=statement&from=${p.from}&to=${p.to}`}
              className={cn("inline-flex h-10 items-center rounded-chunk border px-3.5 fs-14 font-medium", active ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong bg-canvas text-ink hover:bg-paper")}
            >
              {p.label}
            </Link>
          );
        })}
        <DateRange from={from} to={to} max={today} />
      </div>
      <StatGrid>
        <StatCard label="Fee income" value={formatNairaCompact(st.totalIncome)} icon="banknote" tone="success" caption={`${formatDate(from)} to ${formatDate(to)}`} />
        <StatCard label="Expenses" value={formatNairaCompact(st.totalExpenses)} icon="receipt" tone="danger" caption="Approved only" />
        <StatCard label={st.net >= 0 ? "Surplus" : "Deficit"} value={formatNairaCompact(Math.abs(st.net))} icon="trending" tone={st.net >= 0 ? "brand" : "danger"} caption={st.totalIncome ? `${Math.round((st.net / st.totalIncome) * 100)}% of income` : "No income in this period"} />
        <StatCard label="Spend per ₦100 earned" value={st.totalIncome ? `₦${Math.round((st.totalExpenses / st.totalIncome) * 100)}` : "—"} icon="percent" tone="violet" caption="Lower is healthier" />
      </StatGrid>
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
          <h2 className="fs-18 font-semibold">
            {access.school.name}: income and expenditure
          </h2>
          <p className="fs-14 text-muted">
            {formatDate(from)} to {formatDate(to)}
          </p>
        </div>
        <Section title="Income" rows={st.income.map((r) => ({ label: r.label, amount: r.amount }))} total={st.totalIncome} max={maxRow} tone="bg-success" empty="No fee payments in this period." />
        <Section title="Expenditure" rows={st.expenses.map((r) => ({ label: r.category, amount: r.amount, note: `${r.n} item${r.n === 1 ? "" : "s"}` }))} total={st.totalExpenses} max={maxRow} tone="bg-danger" empty="No approved expenses in this period." />
        <div className="mt-5 flex items-baseline justify-between border-t-2 border-ink pt-4">
          <span className="fs-17 font-semibold text-ink">{st.net >= 0 ? "Surplus for the period" : "Deficit for the period"}</span>
          <span className={cn("tabular fs-20 font-semibold", st.net >= 0 ? "text-success" : "text-danger")}>{formatNaira(Math.abs(st.net))}</span>
        </div>
        <p className="mt-4 fs-13 text-muted">Fee income is shared across fee items in proportion to each invoice. Reversed payments and unapproved expenses are left out.</p>
      </Card>
    </>
  );
}

function Section({ title, rows, total, max, tone, empty }: { title: string; rows: { label: string; amount: number; note?: string }[]; total: number; max: number; tone: string; empty: string }) {
  return (
    <div className="mt-5">
      <h3 className="fs-13 font-medium uppercase tracking-[0.06em] text-muted">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 fs-14.5 text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line py-2.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
              <span className="fs-14.5 text-ink">
                {r.label}
                {r.note ? <span className="ml-1.5 fs-13 text-muted">{r.note}</span> : null}
              </span>
              <span className="order-3 col-span-2 h-1.5 overflow-hidden rounded-full bg-sunken sm:order-none sm:col-span-1">
                <span className={cn("block h-full rounded-full", tone)} style={{ width: `${(r.amount / max) * 100}%` }} />
              </span>
              <span className="tabular text-right fs-14.5 text-ink">{formatNaira(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between py-2.5 fs-15 font-semibold text-ink">
        <span>Total {title.toLowerCase()}</span>
        <span className="tabular">{formatNaira(total)}</span>
      </div>
    </div>
  );
}
