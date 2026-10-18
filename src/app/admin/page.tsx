import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { lagosToday } from "@/lib/services/attendance";
import { platformOverview } from "@/lib/services/platform";
import { when } from "./shared";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const o = await platformOverview(getDb());
  const today = lagosToday();
  return (
    <>
      <Topbar title="Overview" context="Every school on Adalin SchoolHub" />
      <PageBody>
        <StatGrid>
          <StatCard label="Schools" value={o.counts.total} icon="school" tone="brand" caption={`${o.counts.newThisMonth} new this month · ${o.counts.paidPlans} on paid plans`} />
          <StatCard label="Students" value={o.students.toLocaleString("en-NG")} icon="users" tone="blue" caption="Active, across all schools" />
          <StatCard label="Paid this year" value={formatNaira(o.money.paidThisYear)} icon="banknote" tone="success" caption={`${formatNaira(o.money.outstanding)} waiting`} />
          <StatCard
            label="Overdue"
            value={formatNaira(o.money.overdue)}
            icon="alert"
            tone={o.money.overdue ? "danger" : "success"}
            caption={`${o.counts.readOnly} read-only · ${o.counts.suspended} suspended`}
          />
        </StatGrid>
        {o.toDeliver ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="fs-15 text-body">
              <span className="font-semibold text-ink">
                {o.toDeliver} paid add-on {o.toDeliver === 1 ? "order" : "orders"}
              </span>{" "}
              waiting to be delivered.
            </p>
            <Link href="/admin/orders" className="fs-14.5 font-semibold text-brand hover:underline">
              See orders
            </Link>
          </Card>
        ) : null}
        <div className="grid gap-6 xl:grid-cols-2">
          <TableCard title="Overdue bills">
            {o.overdue.length === 0 ? (
              <EmptyState icon="check" title="Nothing overdue">
                Every school is paid up.
              </EmptyState>
            ) : (
              <Table minWidth="min-w-[480px]">
                <thead>
                  <tr>
                    <Th>School</Th>
                    <Th>Bill</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Due</Th>
                  </tr>
                </thead>
                <tbody>
                  {o.overdue.map(({ bill, school }) => (
                    <tr key={bill.id} className="hover:bg-paper">
                      <Td>
                        <Link href={`/admin/schools/${bill.schoolId}`} className="font-medium text-ink hover:underline">
                          {school}
                        </Link>
                      </Td>
                      <Td className="tabular text-body">{bill.number}</Td>
                      <Td className="text-right tabular font-semibold text-ink">{formatNaira(bill.totalKobo)}</Td>
                      <Td className="text-danger">{when(bill.dueOn)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </TableCard>
          <TableCard title="Trials">
            {o.trials.length === 0 ? (
              <EmptyState icon="clock" title="No schools on trial" />
            ) : (
              <Table minWidth="min-w-[420px]">
                <thead>
                  <tr>
                    <Th>School</Th>
                    <Th>Trying</Th>
                    <Th>Ends</Th>
                  </tr>
                </thead>
                <tbody>
                  {o.trials.map((t) => (
                    <tr key={t.id} className="hover:bg-paper">
                      <Td>
                        <Link href={`/admin/schools/${t.id}`} className="font-medium text-ink hover:underline">
                          {t.name}
                        </Link>
                      </Td>
                      <Td className="capitalize text-body">{t.plan}</Td>
                      <Td className={t.endsAt && t.endsAt.toISOString().slice(0, 10) <= today ? "text-danger" : "text-body"}>{when(t.endsAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </TableCard>
        </div>
        <TableCard title="Newest schools">
          <Table minWidth="min-w-[480px]">
            <thead>
              <tr>
                <Th>School</Th>
                <Th>Plan</Th>
                <Th className="text-right">Students</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {o.recent.map((s) => (
                <tr key={s.id} className="hover:bg-paper">
                  <Td>
                    <Link href={`/admin/schools/${s.id}`} className="font-medium text-ink hover:underline">
                      {s.name}
                    </Link>
                  </Td>
                  <Td className="capitalize text-body">{s.plan}</Td>
                  <Td className="text-right tabular text-body">{s.students}</Td>
                  <Td className="text-body">{when(s.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableCard>
      </PageBody>
    </>
  );
}
