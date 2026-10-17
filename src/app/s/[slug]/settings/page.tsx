import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { SUPPORT_WHATSAPP } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { FEATURES, LIMITS, type FeatureKey, type LimitKey } from "@/lib/plans/catalog";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";
import { CREDIT_PACKS, getMessaging } from "@/lib/services/credits";
import { listBanks, paystackMode } from "@/lib/services/paystack";
import { listPlans } from "@/lib/services/school-profile";
import { AdmissionSettings } from "../admissions/admission-settings";
import { HrSettingsForm } from "../hr/hr-settings-form";
import { PayrollSettingsForm } from "../payroll/payroll-client";
import { DisciplineSettingsForm } from "../discipline/discipline-client";
import { LibrarySettingsForm } from "../library/library-client";
import { librarySettings } from "@/lib/services/library";
import { InventorySettingsForm } from "../inventory/inventory-client";
import { inventorySettings } from "@/lib/services/inventory";
import { HealthSettingsForm } from "../sick-bay/sick-bay-client";
import { healthSettings } from "@/lib/services/health";
import { TransportSettingsForm } from "../transport/transport-client";
import { transportSettings } from "@/lib/services/transport";
import { HostelSettingsForm } from "../hostel/hostel-client";
import { hostelSettings } from "@/lib/services/hostel";
import { DocumentSettingsForm } from "../documents/documents-client";
import { documentSettings } from "@/lib/services/documents";
import { disciplineSettings } from "@/lib/services/discipline";
import { payrollSettings } from "@/lib/services/payroll";
import { LEAVE_KINDS } from "@/lib/db/schema";
import { hrSettings, LEAVE_LABEL } from "@/lib/services/hr";
import { LogoCard } from "./logo-card";
import { BuyCredits, CommsSettingsForm } from "./messaging-forms";
import { FeeRulesForm, SettlementForm } from "./payments-forms";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; bought?: string; failed?: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["school:update", "school:billing", "fees:manage", "comms:announce", "admissions:manage", "staff:leave", "expenses:payroll", "operations:discipline", "operations:library", "operations:inventory", "operations:health", "operations:transport", "operations:hostel", "documents:issue"]);
  const canProfile = can(access, "school:update") || can(access, "school:billing");
  const sp = await searchParams;
  const canAdmissions = can(access, "admissions:manage") && hasFeature(access.plan, "admissions");
  const canHr = (can(access, "staff:update") || can(access, "staff:leave")) && hasFeature(access.plan, "staff_attendance");
  const canPayroll = can(access, "expenses:payroll") && hasFeature(access.plan, "payroll");
  const canDiscipline = can(access, "operations:discipline") && hasFeature(access.plan, "discipline");
  const canLibrary = can(access, "operations:library") && hasFeature(access.plan, "library");
  const canInventory = can(access, "operations:inventory") && hasFeature(access.plan, "inventory");
  const canHealth = can(access, "operations:health") && hasFeature(access.plan, "health");
  const canTransport = can(access, "operations:transport") && hasFeature(access.plan, "transport");
  const canHostel = can(access, "operations:hostel") && hasFeature(access.plan, "hostel");
  const canDocuments = can(access, "documents:issue") && hasFeature(access.plan, "documents");
  const tab = sp.tab ?? (canProfile ? "profile" : can(access, "fees:manage") ? "payments" : can(access, "comms:announce") ? "messaging" : "admissions");
  const s = access.school;
  const base = `/s/${slug}/settings`;

  return (
    <>
      <Topbar title="Settings" context={access.school.name} />
      <PageBody>
        <Tabs
          current={tab}
          tabs={[
            ...(canProfile ? [{ key: "profile", label: "School profile", href: base }] : []),
            ...(can(access, "academics:view") ? [{ key: "grading", label: "Grading & assessment", href: `/s/${slug}/academics?tab=assessment` }] : []),
            ...(can(access, "fees:manage") || can(access, "school:billing") ? [{ key: "payments", label: "Payments", href: `${base}?tab=payments` }] : []),
            ...(can(access, "comms:announce") ? [{ key: "messaging", label: "Messaging", href: `${base}?tab=messaging` }] : []),
            ...(canAdmissions ? [{ key: "admissions", label: "Admissions", href: `${base}?tab=admissions` }] : []),
            ...(canHr ? [{ key: "hr", label: "Staff & HR", href: `${base}?tab=hr` }] : []),
            ...(canPayroll ? [{ key: "payroll", label: "Payroll", href: `${base}?tab=payroll` }] : []),
            ...(canDiscipline ? [{ key: "behaviour", label: "Behaviour", href: `${base}?tab=behaviour` }] : []),
            ...(canLibrary ? [{ key: "library", label: "Library", href: `${base}?tab=library` }] : []),
            ...(canInventory ? [{ key: "inventory", label: "Inventory", href: `${base}?tab=inventory` }] : []),
            ...(canHealth ? [{ key: "health", label: "Sick bay", href: `${base}?tab=health` }] : []),
            ...(canTransport ? [{ key: "transport", label: "Transport", href: `${base}?tab=transport` }] : []),
            ...(canHostel ? [{ key: "hostel", label: "Boarding", href: `${base}?tab=hostel` }] : []),
            ...(canDocuments ? [{ key: "documents", label: "Documents", href: `${base}?tab=documents` }] : []),
            ...(canProfile ? [{ key: "plan", label: "Plan & billing", href: `${base}?tab=plan` }] : []),
          ]}
        />

        {tab === "documents" && canDocuments ? (
          <DocumentSettingsForm slug={slug} settings={documentSettings(s.documentSettings)} editable />
        ) : tab === "hostel" && canHostel ? (
          <HostelSettingsForm slug={slug} settings={hostelSettings(s.hostelSettings)} editable />
        ) : tab === "transport" && canTransport ? (
          <TransportSettingsForm slug={slug} settings={transportSettings(s.transportSettings)} editable />
        ) : tab === "health" && canHealth ? (
          <HealthSettingsForm slug={slug} settings={healthSettings(s.healthSettings)} editable />
        ) : tab === "inventory" && canInventory ? (
          <InventorySettingsForm slug={slug} settings={inventorySettings(s.inventorySettings)} editable />
        ) : tab === "library" && canLibrary ? (
          <LibrarySettingsForm slug={slug} settings={librarySettings(s.librarySettings)} editable />
        ) : tab === "behaviour" && canDiscipline ? (
          <DisciplineSettingsForm slug={slug} settings={disciplineSettings(s.disciplineSettings)} editable />
        ) : tab === "payroll" && canPayroll ? (
          <PayrollSettingsForm slug={slug} settings={payrollSettings(s.payrollSettings)} editable />
        ) : tab === "hr" && canHr ? (
          <HrSettingsForm
            slug={slug}
            settings={hrSettings(s.hrSettings)}
            kinds={LEAVE_KINDS.map((k) => ({ kind: k, label: LEAVE_LABEL[k] }))}
            editable={can(access, "staff:update") || can(access, "staff:leave")}
          />
        ) : tab === "admissions" && canAdmissions ? (
          <AdmissionSettings slug={slug} access={access} />
        ) : tab === "messaging" && can(access, "comms:announce") ? (
          <MessagingTab slug={slug} access={access} bought={sp.bought} failed={!!sp.failed} />
        ) : tab === "payments" && (can(access, "fees:manage") || can(access, "school:billing")) ? (
          <PaymentsTab slug={slug} access={access} />
        ) : !canProfile ? null : tab === "plan" ? (
          <PlanTab currentKey={access.plan.key} canBill={can(access, "school:billing")} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div>
              <h2 className="fs-16 font-semibold">School profile</h2>
              <p className="mt-1 fs-14 text-muted">Shown on report cards, receipts and the parent app. Complete it to tick off the first setup step.</p>
            </div>
            <div className="flex flex-col gap-5">
            {can(access, "school:update") ? <LogoCard slug={slug} name={s.name} logoUrl={s.logoUrl} /> : null}
            <Card className="p-5 sm:p-6">
              <ProfileForm
                slug={slug}
                readOnly={!can(access, "school:update")}
                profile={{
                  name: s.name,
                  motto: s.motto ?? "",
                  schoolType: s.schoolType ?? "",
                  curriculum: s.curriculum ?? "",
                  email: s.email ?? "",
                  phone: s.phone ?? "",
                  address: s.address ?? "",
                  city: s.city ?? "",
                  state: s.state ?? "",
                  country: s.country,
                  admissionPrefix: s.admissionPrefix ?? "",
                }}
              />
            </Card>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

async function PaymentsTab({ slug, access }: { slug: string; access: Access }) {
  const mode = paystackMode();
  const banks = await listBanks().catch(() => []);
  const fs = access.school.feeSettings;
  const online = hasFeature(access.plan, "fees_online");
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <h2 className="fs-16 font-semibold">Payments</h2>
        <p className="fs-14 text-muted">Your school&apos;s bank account and how fee collection works.</p>
        <div className="flex flex-col gap-1.5 rounded-chunk border border-line p-3 fs-13.5">
          <span className="flex items-center justify-between gap-2">
            Online payment
            <Badge tone={!online ? "neutral" : mode === "live" && access.school.paystackSubaccount ? "success" : mode === "off" ? "neutral" : "blue"}>
              {!online ? "Standard plan" : mode === "off" ? "Not switched on" : !access.school.paystackSubaccount ? "Needs bank account" : mode === "test" ? "Test mode" : "Live"}
            </Badge>
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <SettlementForm slug={slug} banks={banks} mode={mode} current={fs.bank ?? null} editable={can(access, "school:billing")} />
        <FeeRulesForm
          slug={slug}
          standard={hasFeature(access.plan, "debtors")}
          editable={can(access, "fees:manage")}
          settings={{ withholdResults: !!fs.withholdResults, autoReminders: !!fs.autoReminders, reminderEveryDays: fs.reminderEveryDays ?? 7, invoiceNote: fs.invoiceNote ?? "" }}
        />
      </div>
    </div>
  );
}

async function MessagingTab({ slug, access, bought, failed }: { slug: string; access: Access; bought?: string; failed: boolean }) {
  const sms = hasFeature(access.plan, "sms");
  const c = access.school.commsSettings;
  const data = sms ? await getMessaging(getDb(), access) : null;
  const sent = data?.byChannel.filter((r) => r.status === "sent").reduce((n, r) => n + r.n, 0) ?? 0;
  const failedN = data?.byChannel.filter((r) => r.status === "failed").reduce((n, r) => n + r.n, 0) ?? 0;
  const used = data?.byChannel.reduce((n, r) => n + (r.credits ?? 0), 0) ?? 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div>
        <h2 className="fs-16 font-semibold">Messaging</h2>
        <p className="mt-1 fs-14 text-muted">SMS credits, automatic alerts to parents, and when parents can message staff.</p>
      </div>
      <div className="flex flex-col gap-5">
        {bought ? <Alert tone="success">{bought === "1" ? "Payment received. Your credits have been added." : `${Number(bought).toLocaleString()} credits added.`}</Alert> : null}
        {failed ? <Alert tone="danger">That payment didn&apos;t go through. You haven&apos;t been charged.</Alert> : null}
        {data ? (
          <Card className="flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="fs-14 text-muted">SMS credits</p>
                <p className="tabular fs-32 font-semibold leading-none text-ink">{data.unlimited ? "Unlimited" : data.balance.toLocaleString()}</p>
              </div>
              <p className="fs-13.5 text-muted">
                Last 30 days: {sent.toLocaleString()} sent · {used.toLocaleString()} credits{failedN ? ` · ${failedN} failed` : ""}
              </p>
            </div>
            {!data.unlimited ? (
              <BuyCredits
                slug={slug}
                canBuy={can(access, "comms:credits")}
                packs={CREDIT_PACKS.map((p) => ({ key: p.key, credits: p.credits, price: formatNaira(p.priceKobo), each: `₦${(p.priceKobo / 100 / p.credits).toFixed(2).replace(/\.00$/, "")}` }))}
              />
            ) : null}
            <p className="fs-13 text-muted">One credit is one SMS of up to 160 characters. Messages that fail to send are refunded automatically.</p>
          </Card>
        ) : (
          <UpgradeCard slug={slug} feature="sms" text="Text parents about absences, results and fees, even those not on the app." />
        )}
        <CommsSettingsForm
          slug={slug}
          sms={sms}
          editable={can(access, "comms:announce")}
          settings={{
            senderId: c.senderId ?? "",
            absenceAlerts: c.absenceAlerts !== false,
            resultAlerts: c.resultAlerts !== false,
            paymentAlerts: c.paymentAlerts !== false,
            smsAlerts: !!c.smsAlerts,
            parentMessaging: c.parentMessaging !== false,
            studentResults: !!c.studentResults,
            hours: c.messagingHours ?? null,
          }}
        />
        {data && data.recent.length ? (
          <Card className="overflow-hidden">
            <h2 className="px-5 pt-4 fs-16 font-semibold">Recently sent</h2>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {data.recent.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 fs-14">
                  <Badge tone={m.channel === "email" ? "blue" : "violet"}>{m.channel === "email" ? "Email" : m.channel === "whatsapp" ? "WhatsApp" : "SMS"}</Badge>
                  <span className="tabular min-w-0 flex-1 truncate text-body">
                    {m.to} · {m.subject ?? m.body}
                  </span>
                  <span className={m.status === "failed" ? "text-danger" : "text-muted"} title={m.error ?? undefined}>
                    {m.status === "failed" ? (m.error ?? "Failed") : m.status === "queued" ? "Sending" : "Sent"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

async function PlanTab({ currentKey, canBill }: { currentKey: string; canBill: boolean }) {
  const plans = await listPlans(getDb());
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="fs-16 font-semibold">Plans</h2>
          <p className="mt-1 fs-14 text-muted">Priced per student, per term. You only pay for students on roll.</p>
        </div>
        {canBill ? (
          <p className="fs-14 text-muted">
            To change plan, message us on WhatsApp: <span className="select-all font-semibold text-ink">{SUPPORT_WHATSAPP}</span>
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {plans.map((p, i) => {
          const current = p.key === currentKey;
          const previous = plans[i - 1];
          const added = previous ? p.features.filter((f) => !previous.features.includes(f)) : p.features;
          return (
            <Card key={p.key} className={cn("flex flex-col gap-3 p-5", current && "border-brand shadow-[0_4px_0_var(--brand)]")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="fs-17 font-semibold">{p.name}</h3>
                {current ? <Badge tone="brand">Current</Badge> : null}
              </div>
              <p className="tabular fs-24 font-semibold tracking-[-0.02em] text-ink">
                {p.pricePerStudentKobo === null ? "Custom" : p.pricePerStudentKobo === 0 ? "Free" : formatNaira(p.pricePerStudentKobo)}
                {p.pricePerStudentKobo ? <span className="block fs-13 font-normal tracking-normal text-muted">per student / term</span> : null}
              </p>
              <ul className="flex flex-col gap-1.5 border-t border-line pt-3 fs-13.5">
                {Object.entries(p.limits).map(([k, n]) =>
                  k === "audit_days" ? null : (
                    <li key={k} className="font-medium text-ink">
                      Up to {n} {LIMITS[k as LimitKey].toLowerCase()}
                    </li>
                  ),
                )}
                {previous ? <li className="text-muted">Everything in {previous.name}, plus:</li> : null}
                {added.map((f) => (
                  <li key={f} className="flex gap-1.5 text-body">
                    <Icon name="check" size={15} strokeWidth={2.6} className="mt-0.5 shrink-0 text-success" />
                    {FEATURES[f as FeatureKey] ?? f}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
