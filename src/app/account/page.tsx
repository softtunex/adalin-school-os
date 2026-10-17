import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeSwitch } from "@/components/theme-switch";
import { Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getTextSize, getTheme } from "@/lib/theme";
import { TextSizeSwitch } from "@/components/text-size-switch";
import { SsoButtons, ssoError } from "@/components/sso-buttons";
import { Alert } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { configuredProviders, listSsoIdentities, PROVIDERS } from "@/lib/services/sso";
import { DisconnectSso, NameForm, PasswordForm, SignOutEverywhere } from "./account-forms";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ sso?: string }> }) {
  const user = await requireUser();
  const { sso } = await searchParams;
  const [theme, textSize, identities] = await Promise.all([getTheme(), getTextSize(), listSsoIdentities(getDb(), user.id)]);
  const connectable = configuredProviders().filter((p) => !identities.some((i) => i.provider === p));
  const failed = sso === "failed" ? await ssoError() : null;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col gap-8 px-5 py-8">
      <div className="flex items-center justify-between">
        <Logo href="/schools" />
        <Link href="/schools" className="inline-flex items-center gap-1.5 fs-14 font-bold text-blue hover:underline">
          Back to school <Icon name="arrowRight" size={16} />
        </Link>
      </div>
      <div>
        <h1 className="fs-30 font-black tracking-[-0.03em]">Your account</h1>
        <p className="mt-1 fs-15.5 text-muted">{user.email}</p>
      </div>
      <Card className="p-5">
        <h2 className="fs-17 font-extrabold">Name</h2>
        <NameForm name={user.name} />
      </Card>
      <Card className="p-5">
        <h2 className="fs-17 font-extrabold">Password</h2>
        <PasswordForm />
      </Card>
      {identities.length || connectable.length ? (
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="fs-17 font-extrabold">Google and Microsoft</h2>
            <p className="mt-1 fs-14.5 text-muted">Log in with your work Google or Microsoft account instead of a password.</p>
          </div>
          {sso === "connected" ? <Alert tone="success">Connected. You can log in with it from now on.</Alert> : null}
          {failed ? <Alert tone="danger">{failed}</Alert> : null}
          {identities.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-chunk border border-line p-3">
              <span>
                <span className="block font-semibold text-ink">{PROVIDERS[i.provider].name}</span>
                <span className="block fs-13.5 text-muted">{i.email ?? "Connected"}</span>
              </span>
              <DisconnectSso identityId={i.id} name={PROVIDERS[i.provider].name} />
            </div>
          ))}
          {connectable.length ? <SsoButtons mode="link" only={connectable} /> : null}
        </Card>
      ) : null}
      <Card className="flex flex-col gap-5 p-5">
        <h2 className="fs-17 font-semibold">Appearance</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-ink">Theme</p>
            <p className="fs-14 text-muted">Light or dark.</p>
          </div>
          <ThemeSwitch initial={theme} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-ink">Text size</p>
            <p className="fs-14 text-muted">Applies on this device and account.</p>
          </div>
          <TextSizeSwitch initial={textSize} />
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="fs-17 font-extrabold">Sessions</h2>
        <p className="mt-1 fs-14.5 text-muted">Lost a phone or used a shared computer? Sign out of every device at once.</p>
        <SignOutEverywhere />
      </Card>
    </div>
  );
}
