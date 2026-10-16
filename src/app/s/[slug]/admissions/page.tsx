import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { appUrl, requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { APPLICANT_STATUSES } from "@/lib/db/schema";
import { formatWhen } from "@/lib/dates";
import { formatNaira, formatNairaCompact } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";
import { APPLICANT_PAGE_SIZE, getApplyPage, listApplicants, STATUS_LABEL } from "@/lib/services/admissions";
import { paystackMode } from "@/lib/services/paystack";
import { STATUS_TONE } from "./shared";
import { AdmissionSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Admissions" };

type SP = { tab?: string; status?: string; level?: string; paid?: string; q?: string; page?: string };

export default async function AdmissionsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["admissions:view"]);
  if (!hasFeature(access.plan, "admissions")) {
    return (
      <>
        <Topbar title="Admissions" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="admissions" text="Take applications online with the form fee paid by card or transfer, run your entrance exam, send offer letters and enrol in one click." />
        </PageBody>
      </>
    );
  }
  const tab = sp.tab === "settings" ? "settings" : "applicants";
  const base = `/s/${slug}/admissions`;
  return (
    <>
      <Topbar title="Admissions" context={access.school.name} />
      <PageBody>
        <Tabs
          current={tab}
          tabs={[
            { key: "applicants", label: "Applicants", href: base },
            { key: "settings", label: "Form and settings", href: `${base}?tab=settings` },
          ]}
        />
        {tab === "settings" ? <Settings slug={slug} access={access} /> : <Applicants slug={slug} access={access} sp={sp} />}
      </PageBody>
    </>
  );
}

async function Applicants({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const page = Number(sp.page) || 1;
  const db = getDb();
  const [list, form] = await Promise.all([listApplicants(db, access, { status: sp.status, levelId: sp.level, paid: sp.paid, q: sp.q, page }), getApplyPage(db, slug)]);
  const filtered = Boolean(sp.status || sp.level || sp.paid || sp.q);
  const base = `/s/${slug}/admissions`;
  const offers = (list.pipeline.offered ?? 0) + (list.pipeline.accepted ?? 0);
  const exportQs = new URLSearchParams(Object.entries({ status: sp.status, level: sp.level, paid: sp.paid, q: sp.q }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <StatGrid>
        <StatCard label="Applications" value={list.stats.all} icon="userPlus" tone="brand" caption={`${list.stats.thisWeek} this week`} />
        <StatCard label="Offers out" value={offers} icon="send" tone="blue" caption={`${list.pipeline.accepted ?? 0} accepted`} />
        <StatCard label="Enrolled" value={list.pipeline.enrolled ?? 0} icon="graduation" tone="success" caption="Now students" />
        <StatCard label="Form fees collected" value={formatNairaCompact(list.stats.fees)} icon="banknote" tone="violet" caption={`${list.stats.unpaid} not paid yet`} />
      </StatGrid>
      {!form?.open ? (
        <p className="rounded-chunk border border-warning/40 bg-warning-wash px-4 py-3 fs-14.5 text-warning-deep">
          Your admission form is closed.{" "}
          <Link href={`${base}?tab=settings`} className="font-semibold underline">
            Open it in settings
          </Link>
        </p>
      ) : null}
      <nav aria-label="Pipeline" className="flex flex-wrap gap-2">
        {[["", "All", list.stats.all] as const, ...APPLICANT_STATUSES.map((s) => [s, STATUS_LABEL[s], list.pipeline[s] ?? 0] as const)].map(([key, label, n]) => {
          const on = (sp.status ?? "") === key;
          const qs = new URLSearchParams(Object.entries({ status: key, level: sp.level, paid: sp.paid, q: sp.q }).filter(([, v]) => v) as [string, string][]).toString();
          return (
            <Link
              key={key || "all"}
              href={`${base}${qs ? `?${qs}` : ""}`}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 fs-13.5 font-medium", on ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong bg-canvas text-body hover:bg-paper")}
            >
              {label} <span className="tabular text-muted">{n}</span>
            </Link>
          );
        })}
      </nav>
      <TableCard
        title="Applicants"
        toolbar={
          <>
            <SearchInput placeholder="Name, reference or phone…" />
            <FilterSelect label="Class" param="level" options={list.levels.map((l) => ({ value: l.id, label: l.name }))} />
            <FilterSelect
              label="Form fee"
              param="paid"
              options={[
                { value: "yes", label: "Paid" },
                { value: "no", label: "Not paid" },
              ]}
            />
            <ToolbarLink href={`${base}/export${exportQs ? `?${exportQs}` : ""}`} icon="download">
              Export
            </ToolbarLink>
          </>
        }
        footer={<Pagination page={page} pageSize={APPLICANT_PAGE_SIZE} total={list.total} noun="applicants" />}
      >
        {list.rows.length === 0 ? (
          <EmptyState icon="userPlus" title={filtered ? "No applicants match these filters" : "No applications yet"}>
            {filtered ? "Try a different search or clear the filters." : "Share your admission link from Form and settings. Applications appear here as parents send them."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Applicant</Th>
                <Th>Class</Th>
                <Th>Parent</Th>
                <Th>Form fee</Th>
                <Th className="text-right">Exam</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(({ a, levelName }) => (
                <tr key={a.id} className="hover:bg-paper">
                  <Td>
                    <Link href={`${base}/${a.id}`} className="block font-medium text-ink hover:text-brand-ink">
                      {a.firstName} {a.lastName}
                    </Link>
                    <span className="block font-mono fs-12.5 text-muted">
                      {a.ref} · {formatWhen(a.createdAt)}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-body">{levelName ?? "—"}</Td>
                  <Td>
                    <span className="block text-body">{a.guardianName}</span>
                    <span className="block fs-13 text-muted">{a.guardianPhone}</span>
                  </Td>
                  <Td>{a.feeKobo === 0 ? <span className="fs-13.5 text-muted">Free</span> : a.feePaid ? <Badge tone="success">Paid</Badge> : <Badge tone="warning">Not paid</Badge>}</Td>
                  <Td className="tabular text-right text-body">{a.examScore ?? "—"}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[a.status]} dot>
                      {STATUS_LABEL[a.status]}
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

async function Settings({ slug, access }: { slug: string; access: Access }) {
  const db = getDb();
  const [form, list] = await Promise.all([getApplyPage(db, slug), listApplicants(db, access, { limit: 1 })]);
  const s = access.school.admissionSettings;
  const mode = paystackMode();
  const payNote =
    mode === "off" || (!access.school.paystackSubaccount && mode !== "test")
      ? "Parents will pay at the school. To take the fee online, add your bank account in Settings → Payments."
      : `Paid online by card, transfer or USSD, straight into your school account${s.feeKobo ? ` (currently ${formatNaira(s.feeKobo)})` : ""}.`;
  return (
    <AdmissionSettingsForm
      slug={slug}
      link={`${await appUrl()}/apply/${slug}`}
      levels={list.levels}
      settings={{ open: !!form?.open, levelIds: s.levelIds ?? [], fee: s.feeKobo ? String(s.feeKobo / 100) : "", intro: s.intro ?? "", examInfo: s.examInfo ?? "" }}
      editable={can(access, "admissions:manage")}
      payNote={payNote}
    />
  );
}
