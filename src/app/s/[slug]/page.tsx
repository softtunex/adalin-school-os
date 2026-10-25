import type { Metadata } from "next";
import Link from "next/link";
import { Kola } from "@/components/illustrations/art";
import { Illustration } from "@/components/illustrations";
import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Banner, Card, IconChip, StatCard, StatGrid, type Tone } from "@/components/ui/display";
import { Icon, type IconName } from "@/components/ui/icons";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getLimit } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { getOverview } from "@/lib/services/overview";
import { OverviewSwitch } from "./overview-switch";
import { ClockCard } from "./hr/hr-client";
import { hasFeature } from "@/lib/plans/entitlements";
import { getMyDay, lagosClock, LEAVE_LABEL } from "@/lib/services/hr";
import { formatWhen } from "@/lib/dates";

export const metadata: Metadata = { title: "Overview" };

const tz = "Africa/Lagos";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type Step = { icon: IconName; title: string; cta: string; text: string; href: string; done: boolean; show: boolean };
type QuickAction = { icon: IconName; tone: Tone; title: string; text: string; href: string; show: boolean };

export default async function OverviewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { slug } = await params;
  const { welcome } = await searchParams;
  const access = await requireAccess(slug);
  const data = await getOverview(getDb(), access);
  const myDay = access.isStaff && hasFeature(access.plan, "staff_attendance") ? await getMyDay(getDb(), access) : null;
  const firstName = access.user.name.split(/\s+/).find((p) => !/^(mr|mrs|ms|miss|dr|prof|chief)\.?$/i.test(p)) ?? access.user.name;
  const onboarding = access.school.onboarding ?? {};
  const base = `/s/${slug}`;

  const steps: Step[] = [
    { icon: "building", title: "Complete your school profile", cta: "Complete profile", text: "Address, contacts and motto appear on report cards and receipts.", href: `${base}/settings?tab=profile`, done: !!onboarding.profile, show: can(access, "school:update") },
    { icon: "bookOpen", title: "Set up classes and subjects", cta: "Set up classes", text: "One click from the Nigerian or British template. Edit anything after.", href: `${base}/academics`, done: data.classes > 0, show: can(access, "academics:manage") },
    { icon: "userPlus", title: "Invite your staff", cta: "Invite staff", text: "Teachers get a simple view of just their classes.", href: `${base}/staff`, done: data.staff > 1 || !!onboarding.staff, show: can(access, "staff:invite") },
    { icon: "graduation", title: "Add your students", cta: "Add students", text: "Type them in or import your Excel sheet in one go.", href: `${base}/students`, done: data.students > 0, show: can(access, "students:create") },
  ];
  const visible = steps.filter((s) => s.show);
  const done = visible.filter((s) => s.done).length;
  const nextStep = visible.find((s) => !s.done);

  const actions: QuickAction[] = [
    { icon: "userPlus", tone: "brand", title: "Add a student", text: "Enrol a new student", href: `${base}/students/new`, show: can(access, "students:create") },
    { icon: "upload", tone: "blue", title: "Import students", text: "From an Excel sheet", href: `${base}/students/import`, show: can(access, "students:import") },
    { icon: "mail", tone: "violet", title: "Invite staff", text: "Send a login link", href: `${base}/staff`, show: can(access, "staff:invite") },
    { icon: "bookOpen", tone: "success", title: "Classes & subjects", text: "Arms, teachers, terms", href: `${base}/academics`, show: can(access, "academics:view") },
  ];

  const studentLimit = getLimit(access.plan, "students");
  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date());

  return (
    <>
      <Topbar title="Overview" context={access.school.name} />
      <PageBody>
        <OverviewSwitch slug={slug} access={access} current="today" />
        <div className="relative flex items-center overflow-hidden rounded-card border border-brand/15 bg-brand-wash px-6 py-6 sm:px-8">
          <div aria-hidden className="absolute -right-10 -top-16 size-56 rounded-full bg-brand/10" />
          <div className="relative min-w-0 flex-1">
            <p className="fs-14 font-medium text-brand-ink">{dateLine}</p>
            <h2 className="mt-1 font-display fs-30 font-black leading-tight tracking-[-0.01em] sm:fs-34">
              {greeting()}, {firstName}!
            </h2>
            <p className="mt-1.5 max-w-[52ch] fs-15 text-body">
              {data.term && data.session
                ? `It's ${data.term.name.toLowerCase()} of the ${data.session.name} session at ${access.school.name}.`
                : `Welcome to ${access.school.name}. Let's get your school set up.`}
            </p>
          </div>
          <div className="relative -my-6 hidden w-36 shrink-0 self-end sm:block">
            <Illustration name="mascot-wave" fallback={<Kola wave className="w-full" />} className="w-full" />
          </div>
        </div>

        {myDay ? (
          <ClockCard
            slug={slug}
            compact
            clockedIn={myDay.record?.clockIn ? lagosClock(myDay.record.clockIn) : null}
            clockedOut={myDay.record?.clockOut ? lagosClock(myDay.record.clockOut) : null}
            status={myDay.record?.status ?? null}
            onLeave={myDay.onLeave ? LEAVE_LABEL[myDay.onLeave.kind] : null}
            workday={myDay.workday}
            holiday={myDay.holiday}
            closed={myDay.closed}
            resumeAt={myDay.settings.resumeAt}
          />
        ) : null}

        {nextStep ? (
          <Banner
            icon={welcome ? "sparkle" : "flame"}
            title={welcome ? `${access.school.name} is ready. Let's get it running.` : `Finish setting up ${access.school.name}`}
            action={
              <ButtonLink href={nextStep.href} className="ml-auto">
                {nextStep.cta}
                <Icon name="arrowRight" size={18} />
              </ButtonLink>
            }
          >
            {done} of {visible.length} steps done · Next: {nextStep.title.toLowerCase()}
          </Banner>
        ) : null}

        <StatGrid>
          <StatCard
            label="Students"
            value={data.students}
            icon="graduation"
            tone="brand"
            progress={studentLimit !== null ? { value: (data.students / studentLimit) * 100, tone: data.students >= studentLimit ? "danger" : "brand" } : undefined}
            caption={studentLimit !== null ? `${data.students} of ${studentLimit} on the ${access.plan.name} plan` : data.students ? `${data.female} girls · ${data.students - data.female} boys` : "None enrolled yet"}
          />
          <StatCard label="Staff" value={data.staff} icon="users" tone="blue" caption="Active staff accounts" />
          <StatCard label="Classes" value={data.classes} icon="layers" tone="success" caption={data.subjects ? `${data.subjects} subjects offered` : "Not set up yet"} />
          <StatCard
            label="Current term"
            value={data.term ? data.term.name.replace(" Term", "") : "—"}
            sub={data.term ? "term" : undefined}
            icon="calendarCheck"
            tone="violet"
            caption={data.session ? `${data.session.name} session` : "Set up in Academics"}
          />
        </StatGrid>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            {visible.length > 0 && done < visible.length ? (
              <Card>
                <div className="flex items-center justify-between gap-4 px-5 pt-5">
                  <h2 className="fs-16 font-semibold">Setup checklist</h2>
                  <span className="tabular fs-13.5 text-muted">
                    {done}/{visible.length}
                  </span>
                </div>
                <div className="mx-5 mt-3 h-2 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${(done / visible.length) * 100}%` }} />
                </div>
                <ul className="mt-3 flex flex-col px-2 pb-2">
                  {visible.map((step) => (
                    <li key={step.title}>
                      <Link href={step.href} className="flex items-center gap-4 rounded-chunk px-3 py-3 transition-colors hover:bg-paper">
                        {step.done ? (
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-white shadow-[0_2px_0_var(--success-deep)]">
                            <Icon name="check" size={20} strokeWidth={2.6} />
                          </span>
                        ) : (
                          <IconChip icon={step.icon} tone="brand" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className={step.done ? "block font-medium text-muted line-through decoration-line-strong" : "block font-medium text-ink"}>{step.title}</span>
                          <span className="block fs-13.5 text-muted">{step.text}</span>
                        </span>
                        {step.done ? <Badge tone="success">Done</Badge> : <Icon name="chevronRight" size={18} className="text-muted" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {actions.some((a) => a.show) ? (
              <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-2">
                {actions
                  .filter((a) => a.show)
                  .map((a) => (
                    <Link key={a.title} href={a.href} className="group">
                      <Card className="flex items-center gap-4 p-4 transition-[border-color,transform] group-hover:-translate-y-0.5 group-hover:border-line-strong">
                        <IconChip icon={a.icon} tone={a.tone} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink">{a.title}</span>
                          <span className="block fs-13.5 text-muted">{a.text}</span>
                        </span>
                        <Icon name="arrowRight" size={18} className="text-muted transition-transform group-hover:translate-x-0.5" />
                      </Card>
                    </Link>
                  ))}
              </section>
            ) : null}
          </div>

          {data.activity ? (
            <Card className="self-start">
              <div className="flex items-center justify-between gap-4 px-5 pt-5">
                <h2 className="fs-16 font-semibold">Recent activity</h2>
                <Link href={`${base}/audit`} className="fs-13.5 font-medium text-blue hover:underline">
                  View all
                </Link>
              </div>
              {data.activity.length === 0 ? (
                <p className="px-5 py-8 fs-14 text-muted">Changes will show up here.</p>
              ) : (
                <ol className="flex flex-col px-5 pb-3 pt-2">
                  {data.activity.map((e) => (
                    <li key={e.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
                      <Avatar name={e.actorName ?? "System"} size={32} muted />
                      <div className="min-w-0">
                        <p className="fs-14 text-ink">
                          <span className="font-medium">{e.actorName ?? "System"}</span> <span className="text-body">{e.summary.charAt(0).toLowerCase() + e.summary.slice(1)}</span>
                        </p>
                        <p className="tabular fs-12.5 text-muted">
                          {formatWhen(e.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ) : null}
        </div>
      </PageBody>
    </>
  );
}
