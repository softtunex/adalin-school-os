import { UpgradeCard } from "@/components/upgrade-card";
import { Alert } from "@/components/ui/display";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { configuredProviders, PROVIDERS, type Provider, type SsoSettings } from "@/lib/services/sso";
import { SsoSettingsForm } from "./sso-form";

/** Sign-in rules: require staff to use Google or Microsoft (Enterprise). */
export function SsoTab({ slug, access }: { slug: string; access: Access }) {
  if (!hasFeature(access.plan, "sso")) {
    return <UpgradeCard slug={slug} feature="sso" text="Have staff log in with their school Google or Microsoft account, and switch off passwords for them." />;
  }
  const ready = configuredProviders();
  const settings = access.school.ssoSettings as SsoSettings;
  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      {ready.length === 0 ? <Alert tone="warning">Google and Microsoft sign-in aren&apos;t switched on for Adalin SchoolHub yet. Adalin is setting this up; you can choose your rule now.</Alert> : null}
      <SsoSettingsForm
        slug={slug}
        initial={{ required: Boolean(settings.required), providers: settings.providers ?? [] }}
        providers={(Object.keys(PROVIDERS) as Provider[]).map((p) => ({ key: p, name: PROVIDERS[p].name, ready: ready.includes(p) }))}
      />
    </div>
  );
}
