import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { ToolbarLink } from "@/components/ui/data";
import { Badge, Card, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatWhen } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { can } from "@/lib/services/access";
import { getRun, monthLabel } from "@/lib/services/payroll";
import { EditSlip, RunActions } from "../payroll-client";
import { RUN_STATUS } from "../shared";

export const metadata: Metadata = { title: "Payroll" };

export default async function RunPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await requirePageAccess(slug, ["expenses:payroll"]);
  const d = await getRun(getDb(), access, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { run, slips } = d;
  const st = RUN_STATUS[run.status];
  const deductionsTotal = slips.reduce((t, s) => t + s.deductions.reduce((a, b) => a + b.kobo, 0), 0);
  const noBank = slips.filter((s) => !s.accountNumber).length;
  return (
    <>
      <Topbar title={`${monthLabel(run.month)} payroll`} context={access.school.name} />
      <PageBody>
        <Link href={`/s/${slug}/payroll`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> Payroll
        </Link>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="fs-20 font-semibold text-ink">{monthLabel(run.month)}</h1>
              <Badge tone={st.tone} dot>
                {st.label}
              </Badge>
            </div>
            <p className="fs-14 text-muted">
              {slips.length} staff
              {d.preparedBy ? ` · prepared by ${d.preparedBy}` : ""}
              {d.approvedBy && run.approvedAt ? ` · approved by ${d.approvedBy} ${formatWhen(run.approvedAt)}` : ""}
              {run.paidAt ? ` · paid ${formatWhen(run.paidAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RunActions slug={slug} id={run.id} status={run.status} canApprove={can(access, "school:billing")} />
          </div>
        </Card>
        <StatGrid>
          <StatCard label="Net pay" value={formatNaira(run.netKobo)} icon="banknote" tone="brand" caption={noBank ? `${noBank} without bank details` : "To transfer"} />
          <StatCard label="PAYE" value={formatNaira(run.payeKobo)} icon="receipt" tone="blue" caption="Remit to the state tax office" />
          <StatCard label="Pension" value={formatNaira(run.pensionKobo + run.employerPensionKobo)} icon="trending" tone="violet" caption={`${formatNaira(run.employerPensionKobo)} from the school`} />
          <StatCard label="Total cost" value={formatNaira(run.grossKobo + run.employerPensionKobo)} icon="results" tone="success" caption={deductionsTotal ? `Includes ${formatNaira(deductionsTotal)} other deductions` : "Gross pay plus employer pension"} />
        </StatGrid>
        <TableCard
          title="Payslips"
          toolbar={
            <>
              <ToolbarLink href={`/s/${slug}/payroll/${run.id}/export?kind=bank`} icon="download">
                Bank schedule
              </ToolbarLink>
              <ToolbarLink href={`/s/${slug}/payroll/${run.id}/export?kind=remit`} icon="download">
                PAYE and pension
              </ToolbarLink>
            </>
          }
        >
          <Table>
            <thead>
              <tr>
                <Th>Staff</Th>
                <Th className="text-right">Gross</Th>
                <Th className="text-right">PAYE</Th>
                <Th className="text-right">Pension</Th>
                <Th className="text-right">Other</Th>
                <Th className="text-right">Net</Th>
                <Th className="w-36">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id} className="hover:bg-paper">
                  <Td>
                    <span className="block font-medium text-ink">{s.name}</span>
                    <span className="block fs-13 text-muted">
                      {s.accountNumber ? `${s.bankName ?? "Bank"} · ${s.accountNumber}` : "No bank account"}
                      {s.extras.length ? ` · ${s.extras.map((e) => e.name).join(", ")}` : ""}
                    </span>
                  </Td>
                  <Td className="tabular text-right text-body">{formatNaira(s.grossKobo)}</Td>
                  <Td className="tabular text-right text-body">{formatNaira(s.payeKobo)}</Td>
                  <Td className="tabular text-right text-body">{formatNaira(s.pensionKobo)}</Td>
                  <Td className="tabular text-right text-body">{formatNaira(s.deductions.reduce((a, b) => a + b.kobo, 0) + s.nhfKobo)}</Td>
                  <Td className="tabular text-right font-semibold text-ink">{formatNaira(s.netKobo)}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {run.status === "draft" ? (
                        <EditSlip
                          slug={slug}
                          slip={{ id: s.id, name: s.name, basic: s.basicKobo, allowances: s.allowances, extras: s.extras, deductions: s.deductions, settings: s.settings }}
                        />
                      ) : null}
                      <a href={`/s/${slug}/payslips/${s.id}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1 rounded-chunk px-2 fs-14 font-semibold text-brand-ink hover:bg-brand-wash">
                        <Icon name="file" size={15} /> PDF
                      </a>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableCard>
      </PageBody>
    </>
  );
}
