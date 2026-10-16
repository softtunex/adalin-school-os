import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeSwitch } from "@/components/theme-switch";
import { Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getTextSize, getTheme } from "@/lib/theme";
import { TextSizeSwitch } from "@/components/text-size-switch";
import { NameForm, PasswordForm, SignOutEverywhere } from "./account-forms";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();
  const [theme, textSize] = await Promise.all([getTheme(), getTextSize()]);
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
