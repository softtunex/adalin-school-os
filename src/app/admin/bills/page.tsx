import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { SearchInput } from "@/components/ui/data";
import { EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { lagosToday } from "@/lib/services/attendance";
import { listPlatformBills } from "@/lib/services/platform";
import { BillActions } from "../admin-client";
import { BillStatus, KIND_LABEL, when } from "../shared";

export const metadata = { title: "Bills" };

export default async function AdminBills({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const sp = await searchParams;
  const view = ["open", "overdue", "paid"].includes(sp.view ?? "") ? sp.view! : "all";
  const today = lagosToday();
  const db = getDb();
  const [rows, all] = await Promise.all([listPlatformBills(db, { view, q: sp.q }), listPlatformBills(db)]);
  const sum = (f: (r: (typeof all)[number]) => boolean) => all.filter(f).reduce((t, r) => t + r.bill.totalKobo, 0);
  const open = all.filter((r) => r.bill.status === "open");
  const overdue = open.filter((r) => r.bill.dueOn < today);
  return (
    <>
      <Topbar title="Bills" context="School OS bills to schools" />
      <PageBody>
        <StatGrid>
          <StatCard label="Waiting" value={formatNaira(sum((r) => r.bill.status === "open"))} icon="clock" tone="warning" caption={`${open.length} ${open.length === 1 ? "bill" : "bills"}`} />
          <StatCard label="Overdue" value={formatNaira(sum((r) => r.bill.status === "open" && r.bill.dueOn < today))} icon="alert" tone={overdue.length ? "danger" : "success"} caption={`${overdue.length} past the due date`} />
          <StatCard label="Paid" value={formatNaira(sum((r) => r.bill.status === "paid"))} icon="banknote" tone="success" caption="All time" />
          <StatCard label="Bills" value={all.length} icon="receipt" tone="blue" caption="Raised so far" />
        </StatGrid>
        <Tabs
          current={view}
          tabs={[
            { key: "all", label: "All", href: "/admin/bills" },
            { key: "open", label: "Waiting", href: "/admin/bills?view=open", count: open.length },
            { key: "overdue", label: "Overdue", href: "/admin/bills?view=overdue", count: overdue.length },
            { key: "paid", label: "Paid", href: "/admin/bills?view=paid" },
          ]}
        />
        <TableCard toolbar={<SearchInput placeholder="School or bill number…" />}>
          {rows.length === 0 ? (
            <EmptyState icon="receipt" title="No bills here" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th>School</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th className="w-52">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ bill, school, schoolId }) => (
                  <tr key={bill.id} className="hover:bg-paper">
                    <Td>
                      <span className="tabular font-medium text-ink">{bill.number}</span>
                      <span className="block fs-13 text-muted">
                        {KIND_LABEL[bill.kind]} · {when(bill.issuedOn)}
                      </span>
                    </Td>
                    <Td>
                      <Link href={`/admin/schools/${schoolId}`} className="text-ink hover:underline">
                        {school}
                      </Link>
                    </Td>
                    <Td className="text-right tabular font-semibold text-ink">{formatNaira(bill.totalKobo)}</Td>
                    <Td className="text-body">{when(bill.dueOn)}</Td>
                    <Td>
                      <BillStatus status={bill.status} dueOn={bill.dueOn} today={today} />
                    </Td>
                    <Td>{bill.status === "open" ? <BillActions billId={bill.id} number={bill.number} /> : null}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableCard>
      </PageBody>
    </>
  );
}
