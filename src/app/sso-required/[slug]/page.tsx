import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand";
import { SsoButtons } from "@/components/sso-buttons";
import { Alert, Card } from "@/components/ui/display";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { configuredProviders, PROVIDERS, type Provider } from "@/lib/services/sso";

export const metadata: Metadata = { title: "Sign in with your work account" };

/** Where staff land when their school requires Google or Microsoft and they used a password. */
export default async function SsoRequiredPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const [school] = await getDb().select({ name: schools.name, sso: schools.ssoSettings }).from(schools).where(eq(schools.slug, slug));
  if (!school) notFound();
  const allowed = (school.sso.providers ?? []) as Provider[];
  const ready = configuredProviders().filter((p) => allowed.includes(p));
  const names = allowed.map((p) => PROVIDERS[p].name).join(" or ");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 py-8">
      <Logo href="/schools" />
      <Card className="mt-16 flex flex-col gap-4 p-6">
        <h1 className="fs-24 font-black tracking-[-0.02em] text-ink">Use your {names} account</h1>
        <p className="fs-15 text-body">
          {school.name} asks staff to log in with their work {names} account rather than a password. If it isn&apos;t connected yet, log in with your password once more and connect it under Your account, or ask
          your proprietor.
        </p>
        {ready.length ? <SsoButtons only={ready} next={`/s/${slug}`} /> : <Alert tone="warning">Sign-in with {names} isn&apos;t available right now. Ask your proprietor.</Alert>}
        <form action={logoutAction}>
          <button className="fs-14 font-semibold text-muted hover:text-ink">Log out</button>
        </form>
      </Card>
    </div>
  );
}
