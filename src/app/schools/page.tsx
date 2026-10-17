import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listUserSchools } from "@/lib/services/access";
import { listUserGroups } from "@/lib/services/groups";
import { myChildren } from "@/lib/services/parent-portal";

export const metadata: Metadata = { title: "Your schools" };

export default async function SchoolsPage({ searchParams }: { searchParams: Promise<{ pick?: string }> }) {
  const user = await requireUser();
  const { pick } = await searchParams;
  const schools = await listUserSchools(getDb(), user.id);

  if (user.username) redirect("/learn");
  const [children, groups] = await Promise.all([myChildren(getDb(), user.id), listUserGroups(getDb(), user.id)]);
  if (schools.length === 0 && children.length > 0) redirect("/p");
  if (schools.length === 1 && !pick && children.length === 0 && groups.length === 0) redirect(`/s/${schools[0].slug}`);
  const last = schools.find((s) => s.id === user.lastSchoolId);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-5 py-8">
      <div className="flex items-center justify-between">
        <Logo href="/schools" />
        <form action={logoutAction}>
          <button className="fs-14 font-bold text-muted hover:text-ink">Log out</button>
        </form>
      </div>
      <h1 className="mt-12 fs-30 font-black tracking-[-0.03em]">Choose a school</h1>
      <p className="mt-1 fs-15.5 text-muted">Signed in as {user.email}</p>

      <div className="mt-8 flex flex-col gap-3">
        {user.isPlatformAdmin ? (
          <Link href="/admin" className="group">
            <Card className="flex items-center gap-4 bg-ink p-4 text-canvas transition-colors group-hover:border-brand">
              <span className="grid size-11 place-items-center rounded-full bg-canvas/10">
                <Icon name="shield" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block fs-16 font-extrabold">Adalin admin</span>
                <span className="block fs-13 opacity-75">Every school, bills, plans and support</span>
              </span>
              <Icon name="arrowRight" />
            </Card>
          </Link>
        ) : null}
        {groups.map((g) => (
          <Link key={g.id} href={`/g/${g.id}`} className="group">
            <Card className="flex items-center gap-4 border-brand/40 bg-brand-wash p-4 transition-colors group-hover:border-brand">
              <span className="grid size-11 place-items-center rounded-full bg-canvas text-brand">
                <Icon name="building" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate fs-16 font-extrabold text-ink">{g.name}</span>
                <span className="block fs-13 font-semibold text-muted">
                  All {g.campuses} {g.campuses === 1 ? "campus" : "campuses"} side by side
                </span>
              </span>
              <Icon name="arrowRight" className="text-muted group-hover:text-brand" />
            </Card>
          </Link>
        ))}
        {schools.length === 0 ? (
          <EmptyState icon="school" title="You're not part of a school yet">
            If your school invited you, open the link in your invitation email. Otherwise, set up your own school.
          </EmptyState>
        ) : (
          schools.map((s) => (
            <Link key={s.id} href={`/s/${s.slug}`} className="group">
              <Card className="flex items-center gap-4 p-4 transition-colors group-hover:border-brand">
                <Avatar name={s.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate fs-16 font-extrabold text-ink">{s.name}</span>
                  {s.id === last?.id ? <span className="fs-13 font-semibold text-muted">Last opened</span> : null}
                </span>
                <Icon name="arrowRight" className="text-muted group-hover:text-brand" />
              </Card>
            </Link>
          ))
        )}
      </div>
      {children.length ? (
        <Link href="/p" className="group mt-3">
          <Card className="flex items-center gap-4 border-dashed p-4 transition-colors group-hover:border-brand">
            <span className="grid size-11 place-items-center rounded-full bg-brand-wash text-brand">
              <Icon name="users" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block fs-16 font-extrabold text-ink">Parent view</span>
              <span className="block fs-13 text-muted">{children.map((c) => c.firstName).join(", ")}</span>
            </span>
            <Icon name="arrowRight" className="text-muted group-hover:text-brand" />
          </Card>
        </Link>
      ) : null}
      <ButtonLink href="/schools/new" variant="secondary" className="mt-6 self-start">
        <Icon name="plus" size={18} strokeWidth={2.6} /> Add another school
      </ButtonLink>
    </div>
  );
}
