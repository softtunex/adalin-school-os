import type { Metadata } from "next";
import { Card, Chip, PageHeader } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { SUPPORT_WHATSAPP } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { FEATURES, LIMITS, type FeatureKey, type LimitKey } from "@/lib/plans/catalog";
import { formatNaira } from "@/lib/nigeria";
import { can } from "@/lib/services/access";
import { listPlans } from "@/lib/services/school-profile";
import { cn } from "@/lib/cn";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["school:update", "school:billing"]);
  const s = access.school;
  const plans = await listPlans(getDb());
  const canEdit = can(access, "school:update");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Settings" description="Your school's details and plan." />

      <section aria-labelledby="profile-heading" className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div>
          <h2 id="profile-heading" className="text-[18px] font-extrabold">
            School profile
          </h2>
          <p className="mt-1 text-[14.5px] text-muted">Shown on report cards, receipts and the parent app.</p>
        </div>
        <Card className="p-5 sm:p-6">
          <ProfileForm
            slug={slug}
            readOnly={!canEdit}
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
            }}
          />
        </Card>
      </section>

      <section id="plan" aria-labelledby="plan-heading" className="flex scroll-mt-8 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="plan-heading" className="text-[18px] font-extrabold">
              Plan
            </h2>
            <p className="mt-1 text-[14.5px] text-muted">Priced per student, per term. You only pay for students on roll.</p>
          </div>
          {can(access, "school:billing") ? (
            <p className="text-[14px] text-muted">
              To change plan, message us on WhatsApp: <span className="select-all font-bold text-ink">{SUPPORT_WHATSAPP}</span>
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((p, i) => {
            const current = p.key === access.plan.key;
            const previous = plans[i - 1];
            const added = previous ? p.features.filter((f) => !previous.features.includes(f)) : p.features;
            return (
              <Card key={p.key} className={cn("flex flex-col gap-3 p-4", current && "border-brand shadow-[0_5px_0_var(--brand)]")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[17px] font-extrabold">{p.name}</h3>
                  {current ? <Chip tone="brand">Current</Chip> : null}
                </div>
                <p className="tabular text-[22px] font-black tracking-[-0.02em] text-ink">
                  {p.pricePerStudentKobo === null ? "Custom" : p.pricePerStudentKobo === 0 ? "Free" : formatNaira(p.pricePerStudentKobo)}
                  {p.pricePerStudentKobo ? <span className="block text-[12.5px] font-semibold tracking-normal text-muted">per student / term</span> : null}
                </p>
                <ul className="flex flex-col gap-1.5 text-[13.5px]">
                  {Object.entries(p.limits).map(([k, n]) =>
                    k === "audit_days" ? null : (
                      <li key={k} className="font-bold text-ink">
                        Up to {n} {LIMITS[k as LimitKey].toLowerCase()}
                      </li>
                    ),
                  )}
                  {previous ? <li className="text-muted">Everything in {previous.name}, plus:</li> : null}
                  {added.map((f) => (
                    <li key={f} className="flex gap-1.5">
                      <Icon name="check" size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-success" />
                      {FEATURES[f as FeatureKey] ?? f}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
