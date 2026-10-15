import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeSwitch } from "@/components/theme-switch";
import { Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getTheme } from "@/lib/theme";
import { NameForm, PasswordForm, SignOutEverywhere } from "./account-forms";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();
  const theme = await getTheme();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col gap-8 px-5 py-8">
      <div className="flex items-center justify-between">
        <Logo href="/schools" />
        <Link href="/schools" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-blue hover:underline">
          Back to school <Icon name="arrowRight" size={16} />
        </Link>
      </div>
      <div>
        <h1 className="text-[30px] font-black tracking-[-0.03em]">Your account</h1>
        <p className="mt-1 text-[15.5px] text-muted">{user.email}</p>
      </div>
      <Card className="p-5">
        <h2 className="text-[17px] font-extrabold">Name</h2>
        <NameForm name={user.name} />
      </Card>
      <Card className="p-5">
        <h2 className="text-[17px] font-extrabold">Password</h2>
        <PasswordForm />
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-[17px] font-extrabold">Appearance</h2>
          <p className="text-[14.5px] text-muted">Light, dark, or follow your device.</p>
        </div>
        <div className="w-40">
          <ThemeSwitch initial={theme} />
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-[17px] font-extrabold">Sessions</h2>
        <p className="mt-1 text-[14.5px] text-muted">Lost a phone or used a shared computer? Sign out of every device at once.</p>
        <SignOutEverywhere />
      </Card>
    </div>
  );
}
