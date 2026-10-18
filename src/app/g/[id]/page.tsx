import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand";
import { PageBody, Topbar } from "@/components/topbar";
import { ToolbarLink } from "@/components/ui/data";
import { Badge, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { groupOverview } from "@/lib/services/groups";

export const metadata: Metadata = { title: "Campuses" };

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

/** A group's campuses side by side, for its proprietor. */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const o = await groupOverview(getDb(), user.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const t = o.totals;
  return (
    <div className="min-h-dvh bg-paper">
      <div className="border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Logo href="/schools" />
          <Link href="/schools?pick=1" className="fs-14 font-semibold text-muted hover:text-ink">
            Your schools
          </Link>
        </div>
      </div>
      <Topbar title={o.group.name} context={`${o.campuses.length} ${o.campuses.length === 1 ? "campus" : "campuses"}`} />
      <PageBody>
        <StatGrid>
          <StatCard label="Students" value={t.students.toLocaleString("en-NG")} icon="users" tone="brand" caption="Active, across every campus" />
          <StatCard label="Staff" value={t.staff} icon="user" tone="violet" caption="With a Adalin SchoolHub login" />
          <StatCard label="In school today" value={pct(t.marked ? t.present / t.marked : null)} icon="calendar" tone="blue" caption={t.marked ? `${t.present} of ${t.marked} marked present or late` : "No register taken yet today"} />
          <StatCard
            label="Fees collected"
            value={formatNaira(t.collected)}
            icon="banknote"
            tone="success"
            caption={t.billed ? `${pct(t.collected / t.billed)} of ${formatNaira(t.billed)} billed this term` : "Nothing billed this term yet"}
            progress={t.billed ? { value: (t.collected / t.billed) * 100, tone: "success" } : undefined}
          />
        </StatGrid>
        <TableCard
          title="Campuses"
          toolbar={
            <ToolbarLink href={`/g/${id}/export`} icon="download">
              Export
            </ToolbarLink>
          }
        >
          <Table>
            <thead>
              <tr>
                <Th>Campus</Th>
                <Th className="text-right">Students</Th>
                <Th className="text-right">Staff</Th>
                <Th className="text-right">In today</Th>
                <Th className="text-right">Billed this term</Th>
                <Th className="text-right">Collected</Th>
                <Th className="text-right">Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {o.campuses.map((c) => (
                <tr key={c.id} className="hover:bg-paper">
                  <Td>
                    {c.member ? (
                      <Link href={`/s/${c.slug}`} className="font-medium text-ink hover:underline">
                        {c.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{c.name}</span>
                    )}
                    <span className="flex flex-wrap items-center gap-1.5 fs-13 text-muted">
                      {c.term ?? "No current term"}
                      {c.status !== "active" ? <Badge tone="warning">{c.status === "read_only" ? "Read-only" : "Suspended"}</Badge> : null}
                    </span>
                  </Td>
                  <Td className="text-right tabular text-body">{c.students}</Td>
                  <Td className="text-right tabular text-body">{c.staff}</Td>
                  <Td className="text-right tabular text-body">{pct(c.attendance)}</Td>
                  <Td className="text-right tabular text-body">{formatNaira(c.billed)}</Td>
                  <Td className="text-right tabular font-semibold text-ink">{formatNaira(c.collected)}</Td>
                  <Td className={c.outstanding ? "text-right tabular font-semibold text-danger" : "text-right tabular text-muted"}>{c.outstanding ? formatNaira(c.outstanding) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableCard>
        <p className="fs-13.5 text-muted">Each campus keeps its own records, staff and Adalin SchoolHub bill. Add or remove campuses from any campus&apos;s Settings, Campuses.</p>
      </PageBody>
    </div>
  );
}
