import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Card, PageHeader } from "@/components/ui/display";
import { Icon, type IconName } from "@/components/ui/icons";
import { requireAccess } from "@/lib/auth/session";
import { can } from "@/lib/services/access";

export const metadata: Metadata = { title: "Today" };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type Step = { icon: IconName; title: string; text: string; href: string; done: boolean; show: boolean };

export default async function TodayPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { slug } = await params;
  const { welcome } = await searchParams;
  const access = await requireAccess(slug);
  const firstName = access.user.name.split(/\s+/).find((p) => !/^(mr|mrs|ms|miss|dr|prof)\.?$/i.test(p)) ?? access.user.name;
  const onboarding = access.school.onboarding ?? {};

  const steps: Step[] = [
    {
      icon: "school",
      title: "Complete your school profile",
      text: "Logo, address and contact details appear on report cards.",
      href: `/s/${slug}/settings`,
      done: !!onboarding.profile,
      show: can(access, "school:update"),
    },
    {
      icon: "users",
      title: "Invite your staff",
      text: "Teachers get their own simple view. Nobody sees what they don't need.",
      href: `/s/${slug}/staff`,
      done: !!onboarding.staff,
      show: can(access, "staff:invite"),
    },
  ];
  const visibleSteps = steps.filter((s) => s.show);
  const doneCount = visibleSteps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(new Date())} title={`${greeting()}, ${firstName}`} description={access.school.name} />

      {welcome ? (
        <Alert tone="success" title={`${access.school.name} is ready`}>
          Work through the checklist below to get your school running. It takes about ten minutes.
        </Alert>
      ) : null}

      {visibleSteps.length > 0 && doneCount < visibleSteps.length ? (
        <section aria-labelledby="setup-heading">
          <div className="flex items-end justify-between gap-4">
            <h2 id="setup-heading" className="text-[20px] font-extrabold">
              Get set up
            </h2>
            <p className="tabular text-[14px] font-bold text-muted">
              {doneCount} of {visibleSteps.length} done
            </p>
          </div>
          <div className="mt-4 grid gap-3">
            {visibleSteps.map((step) => (
              <Card key={step.title} className="flex flex-wrap items-center gap-4 p-4">
                <span className={step.done ? "grid size-12 place-items-center rounded-[14px] bg-success text-white" : "grid size-12 place-items-center rounded-[14px] border-2 border-brand bg-brand-wash text-brand"}>
                  <Icon name={step.done ? "check" : step.icon} size={22} strokeWidth={2.4} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-extrabold text-ink">{step.title}</p>
                  <p className="text-[14.5px] text-muted">{step.text}</p>
                </div>
                {step.done ? (
                  <span className="label-caps text-success">Done</span>
                ) : (
                  <ButtonLink href={step.href} variant="secondary" size="sm">
                    Start
                  </ButtonLink>
                )}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <Card className="p-6">
        <h2 className="text-[18px] font-extrabold">Classes, students and results are next</h2>
        <p className="mt-1 max-w-[60ch] text-[15px] text-muted">
          Your daily view fills up with attendance to mark, scores due and fees to follow up once your classes and students are set up.
        </p>
      </Card>
    </div>
  );
}
