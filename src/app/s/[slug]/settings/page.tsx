import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { SUPPORT_WHATSAPP } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/nigeria";
import { FEATURES, LIMITS, type FeatureKey, type LimitKey } from "@/lib/plans/catalog";
import { can } from "@/lib/services/access";
import { listPlans } from "@/lib/services/school-profile";
import { LogoCard } from "./logo-card";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab = "profile" } = await searchParams;
  const access = await requirePageAccess(slug, ["school:update", "school:billing"]);
  const s = access.school;
  const base = `/s/${slug}/settings`;

  return (
    <>
      <Topbar title="Settings" context={access.school.name} />
      <PageBody>
        <Tabs
          current={tab}
          tabs={[
            { key: "profile", label: "School profile", href: base },
            { key: "grading", label: "Grading & assessment", href: `/s/${slug}/academics?tab=assessment` },
            { key: "plan", label: "Plan & billing", href: `${base}?tab=plan` },
          ]}
        />

        {tab === "plan" ? (
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
