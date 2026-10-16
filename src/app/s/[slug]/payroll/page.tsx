import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { Avatar, Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatNaira, formatNairaCompact } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { lagosToday } from "@/lib/services/attendance";
import { listPayProfiles, listRuns, monthLabel } from "@/lib/services/payroll";
import { PayProfileButton, PrepareRun } from "./payroll-client";
import { RUN_STATUS } from "./shared";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const access = await requirePageAccess(slug, ["expenses:payroll"]);
  if (!hasFeature(access.plan, "payroll")) {
    return (
      <>
        <Topbar title="Payroll" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="payroll" text="Run salaries every month with PAYE, pension and NHF worked out for you, payslips for every staff member and a bank schedule ready to upload." />
        </PageBody>
      </>
    );
  }
  const tab = rawTab === "staff" ? "staff" : "runs";
  const base = `/s/${slug}/payroll`;
  return (
    <>
      <Topbar title="Payroll" context={access.school.name} />
      <PageBody>
        <Tabs
          current={tab}
          tabs={[
            { key: "runs", label: "Monthly payroll", href: base },
            { key: "staff", label: "Staff pay details", href: `${base}?tab=staff` },
          ]}
        />
        {tab === "staff" ? <Staff slug={slug} access={access} /> : <Runs slug={slug} access={access} />}
      </PageBody>
    </>
  );
}

async function Runs({ slug, access }: { slug: string; access: Access }) {
  const db = getDb();
  const [{ runs, year }, profiles] = await Promise.all([listRuns(db, access), listPayProfiles(db, access)]);
  const month = lagosToday().slice(0, 7);
  return (
    <>
      <StatGrid>
        <StatCard label="Monthly salary bill" value={formatNairaCompact(profiles.stats.monthlyGross)} icon="banknote" tone="brand" caption={`${profiles.stats.onPayroll} of ${profiles.stats.staff} staff set up`} />
        <StatCard label="Net paid this year" value={formatNairaCompact(year.net)} icon="checkCircle" tone="success" caption="Paid payrolls" />
        <StatCard label="PAYE this year" value={formatNairaCompact(year.paye)} icon="receipt" tone="blue" caption="To remit to the state" />
        <StatCard label="Pension this year" value={formatNairaCompact(year.pension)} icon="trending" tone="violet" caption="Staff and school share" />
      </StatGrid>
      <PrepareRun slug={slug} defaultMonth={month} />
      <TableCard title="Payrolls">
        {runs.length === 0 ? (
          <EmptyState icon="banknote" title="No payroll yet">
            {profiles.stats.onPayroll ? "Prepare this month's payroll above. You can adjust anyone's pay before approving." : "Start with Staff pay details: add each person's salary and bank account."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th className="text-right">Gross</Th>
                <Th className="text-right">PAYE</Th>
                <Th className="text-right">Net pay</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-paper">
                  <Td>
                    <Link href={`/s/${slug}/payroll/${r.id}`} className="font-medium text-ink hover:text-brand-ink">
                      {monthLabel(r.month)}
                    </Link>
                  </Td>
                  <Td className="tabular text-right text-body">{formatNaira(r.grossKobo)}</Td>
                  <Td className="tabular text-right text-body">{formatNaira(r.payeKobo)}</Td>
                  <Td className="tabular text-right font-semibold text-ink">{formatNaira(r.netKobo)}</Td>
                  <Td>
                    <Badge tone={RUN_STATUS[r.status].tone} dot>
                      {RUN_STATUS[r.status].label}
                    </Badge>
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

async function Staff({ slug, access }: { slug: string; access: Access }) {
  const p = await listPayProfiles(getDb(), access);
  return (
    <>
      <StatGrid>
        <StatCard label="On payroll" value={`${p.stats.onPayroll}/${p.stats.staff}`} icon="users" tone="brand" caption="Staff with a salary set" />
        <StatCard label="Monthly gross" value={formatNairaCompact(p.stats.monthlyGross)} icon="banknote" tone="blue" caption="Before deductions" />
        <StatCard label="Monthly take-home" value={formatNairaCompact(p.stats.monthlyNet)} icon="checkCircle" tone="success" caption="After PAYE, pension, NHF" />
        <StatCard label="Missing bank details" value={p.stats.missingBank} icon="alert" tone={p.stats.missingBank ? "warning" : "success"} caption={p.stats.missingBank ? "Can't be on the bank schedule" : "All set"} />
      </StatGrid>
      <TableCard title="Staff pay details">
        <Table>
          <thead>
            <tr>
              <Th>Staff</Th>
              <Th className="text-right">Basic</Th>
              <Th className="text-right">Gross</Th>
              <Th className="text-right">Take-home</Th>
              <Th>Bank</Th>
              <Th className="w-28">
                <span className="sr-only">Edit</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.membershipId} className="hover:bg-paper">
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} size={34} />
                    <span>
                      <span className="block font-medium text-ink">{r.name}</span>
                      <span className="block fs-13 text-muted">{r.jobTitle}</span>
                    </span>
                  </div>
                </Td>
                <Td className="tabular text-right text-body">{r.profile?.basicKobo ? formatNaira(r.profile.basicKobo) : <span className="text-muted">Not set</span>}</Td>
                <Td className="tabular text-right text-body">{r.pay && r.profile?.basicKobo ? formatNaira(r.pay.gross) : "—"}</Td>
                <Td className="tabular text-right font-semibold text-ink">{r.pay && r.profile?.basicKobo ? formatNaira(r.pay.net) : "—"}</Td>
                <Td className="text-body">{r.profile?.accountNumber ? `${r.profile.bankName ?? "Bank"} · ${r.profile.accountNumber}` : <span className="text-muted">None</span>}</Td>
                <Td className="text-right">
                  <PayProfileButton
                    slug={slug}
                    label={r.profile ? "Edit" : "Set pay"}
                    profile={{
                      membershipId: r.membershipId,
                      name: r.name,
                      basic: r.profile?.basicKobo ?? 0,
                      allowances: r.profile?.allowances ?? [],
                      deductions: r.profile?.deductions ?? [],
                      pension: r.profile?.pension ?? p.settings.pension,
                      nhf: r.profile?.nhf ?? p.settings.nhf,
                      paye: r.profile?.paye ?? p.settings.paye,
                      annualRent: r.profile?.annualRentKobo ?? 0,
                      bankName: r.profile?.bankName ?? "",
                      accountNumber: r.profile?.accountNumber ?? "",
                      accountName: r.profile?.accountName ?? "",
                    }}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableCard>
    </>
  );
}
