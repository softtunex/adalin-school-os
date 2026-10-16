import type { Metadata } from "next";
import Link from "next/link";
import { Kola } from "@/components/illustrations/art";
import { buttonClass } from "@/components/ui/button-styles";
import { Avatar, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { getParentHome } from "@/lib/services/parent-portal";
import { AnnouncementItem } from "./parts";

export const metadata: Metadata = { title: "Home" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function shortDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(`${d}T12:00:00Z`) : d;
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

/** Names the children instead of assuming "your child": parents and guardians alike. */
function whoLine(names: string[]) {
  if (names.length === 1) return `Here's how ${names[0]} is doing.`;
  if (names.length === 2) return `Here's how ${names[0]} and ${names[1]} are doing.`;
  return `Here's how the ${names.length} children in your care are doing.`;
}

function eventRange(a: string, b: string) {
  return a === b ? shortDate(a) : `${shortDate(a)} to ${shortDate(b)}`;
}

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ announcement?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const home = await getParentHome(getDb(), user);
  const firstName = user.name.replace(/^(mr|mrs|ms|miss|dr|chief)\.?\s+/i, "").split(" ")[0];
  const enabled = home.schools.filter((s) => s.enabled);
  const multi = home.schools.length > 1;

  if (home.childCount === 0) {
    return (
      <Card className="flex flex-col items-center px-6 py-12 text-center">
        <Kola className="h-28 w-24" />
        <h1 className="mt-4 fs-22 font-bold">We couldn&apos;t find your children yet</h1>
        <p className="mt-2 max-w-[44ch] fs-15 text-muted">Your account isn&apos;t linked to any student. Ask your child&apos;s school to add your phone number or email to their records, then sign in again with it.</p>
        <Link href="/schools?pick=1" className="mt-6 fs-14.5 font-bold text-blue">
          Work at a school? Go to your school
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="fs-26 font-bold tracking-[-0.02em] sm:fs-30">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 fs-15 text-muted">{whoLine(home.schools.flatMap((x) => x.children.map((c) => c.link.firstName)))}</p>
      </div>

      {home.schools.map((s) => (
        <section key={s.schoolId} className="flex flex-col gap-3" aria-label={s.school.name}>
          {multi || !s.enabled ? (
            <h2 className="fs-14 font-bold uppercase tracking-[0.06em] text-muted">
              {s.school.name}
              {s.enabled && s.term ? <span className="font-medium normal-case tracking-normal"> · {s.term}</span> : null}
            </h2>
          ) : null}
          {!s.enabled ? (
            <Card className="p-5 fs-14.5 text-body">
              {s.children.map((c) => c.link.firstName).join(" and ")} {s.children.length === 1 ? "is" : "are"} at {s.school.name}, which hasn&apos;t switched on the parent app yet. Ask the school about it.
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {s.children.map((c) => {
                const att = c.attendance && c.attendance.days ? Math.round((c.attendance.present / c.attendance.days) * 100) : null;
                return (
                  <Card key={c.link.studentId} className="flex flex-col overflow-hidden transition-[border-color,box-shadow] hover:border-brand/40">
                    <Link href={`/p/children/${c.link.studentId}`} className="flex items-center gap-3.5 p-5 pb-4 active:bg-paper">
                      <Avatar name={`${c.link.firstName} ${c.link.lastName}`} size={52} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate fs-18 font-bold text-ink">
                          {c.link.firstName} {c.link.lastName}
                        </span>
                        <span className="block truncate fs-14 text-muted">
                          {c.className ?? "No class yet"}
                          {!multi ? ` · ${s.school.name}` : ""}
                        </span>
                      </span>
                      <Icon name="chevronRight" className="text-muted" />
                    </Link>
                    <div className="grid grid-cols-3 border-y border-line">
                      <Link href={`/p/children/${c.link.studentId}`} className="flex flex-col gap-0.5 border-r border-line px-4 py-3 hover:bg-paper active:bg-sunken">
                        <span className="fs-12.5 font-medium text-muted">Attendance</span>
                        <span className={`tabular fs-17 font-bold ${att === null ? "text-muted" : att >= 90 ? "text-success" : att >= 75 ? "text-ink" : "text-danger"}`}>{att === null ? "—" : `${att}%`}</span>
                        {c.attendance?.days ? (
                          <span className="fs-12 text-muted">
                            {c.attendance.absent} day{c.attendance.absent === 1 ? "" : "s"} absent
                          </span>
                        ) : null}
                      </Link>
                      <Link href={`/p/children/${c.link.studentId}?tab=fees`} className="flex flex-col gap-0.5 border-r border-line px-4 py-3 hover:bg-paper active:bg-sunken">
                        <span className="fs-12.5 font-medium text-muted">Fees</span>
                        <span className={`tabular truncate fs-17 font-bold ${c.owing > 0 ? "text-ink" : "text-success"}`}>{c.owing > 0 ? formatNaira(c.owing) : "Paid"}</span>
                        {c.owing > 0 ? <span className="fs-12 text-muted">to pay</span> : null}
                      </Link>
                      <Link href={`/p/children/${c.link.studentId}?tab=results`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-paper active:bg-sunken">
                        <span className="fs-12.5 font-medium text-muted">Results</span>
                        <span className="truncate fs-15 font-bold text-ink">{c.latestResult ? c.latestResult.termName : <span className="text-muted">Not out</span>}</span>
                        {c.latestResult ? <span className="fs-12 text-blue">Report card</span> : null}
                      </Link>
                    </div>
                    <div className="flex flex-col gap-2.5 p-4 sm:flex-row">
                      {c.owing > 0 && c.payToken && s.school.features.includes("fees_online") ? (
                        <a href={`/pay/${c.payToken}`} className={buttonClass("primary", "md", "flex-1")}>
                          Pay {formatNaira(c.owing)}
                        </a>
                      ) : null}
                      <Link href={`/p/children/${c.link.studentId}`} className={buttonClass("secondary", "md", "flex-1")}>
                        See {c.link.firstName}&apos;s records
                        <Icon name="arrowRight" size={17} />
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {enabled.some((s) => s.news.length) ? (
        <section className="flex flex-col gap-3">
          <h2 className="fs-18 font-bold">From school</h2>
          <Card className="px-5">
            {enabled.flatMap((s) =>
              s.news.map((n) => (
                <AnnouncementItem
                  key={n.a.id}
                  schoolId={s.schoolId}
                  id={n.a.id}
                  title={n.a.title}
                  body={n.a.body}
                  pinned={n.a.pinned}
                  unread={!n.readAt}
                  defaultOpen={sp.announcement === n.a.id}
                  date={shortDate(n.a.publishedAt)}
                  school={multi ? s.school.name : undefined}
                />
              )),
            )}
          </Card>
        </section>
      ) : null}

      {enabled.some((s) => s.events.length) ? (
        <section className="flex flex-col gap-3">
          <h2 className="fs-18 font-bold">Coming up</h2>
          <Card className="divide-y divide-line px-5">
            {enabled.flatMap((s) =>
              s.events.map((e) => (
                <div key={e.id} className="flex items-center gap-4 py-3.5">
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-chunk border border-line bg-paper py-1">
                    <span className="fs-11 font-bold uppercase text-brand">{new Date(`${e.startsOn}T12:00:00Z`).toLocaleDateString("en-NG", { month: "short", timeZone: "UTC" })}</span>
                    <span className="tabular fs-18 font-bold leading-none text-ink">{Number(e.startsOn.slice(8))}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block fs-15 font-semibold text-ink">{e.title}</span>
                    <span className="block fs-13.5 text-muted">
                      {eventRange(e.startsOn, e.endsOn)}
                      {multi ? ` · ${s.school.name}` : ""}
                    </span>
                  </span>
                </div>
              )),
            )}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
