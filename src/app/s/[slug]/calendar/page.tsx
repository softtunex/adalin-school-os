import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { buttonClass } from "@/components/ui/button-styles";
import { Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { listEvents } from "@/lib/services/announcements";
import { lagosToday } from "@/lib/services/attendance";
import { AddEventButton, MonthGrid } from "./calendar-client";
import { KIND_CLASS, KIND_LABEL } from "./kinds";

export const metadata: Metadata = { title: "Calendar" };

function shift(month: string, by: number) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ month?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["school:view"]);
  if (!access.isStaff) return null;
  if (!hasFeature(access.plan, "announcements")) {
    return (
      <>
        <Topbar title="Calendar" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="announcements" />
        </PageBody>
      </>
    );
  }
  const today = lagosToday();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const events = await listEvents(getDb(), access, { from: `${month}-01`, to: last });
  const editable = can(access, "comms:announce");
  const label = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
  const base = `/s/${slug}/calendar`;

  return (
    <>
      <Topbar title="Calendar" context={access.school.name} actions={editable ? <AddEventButton slug={slug} today={today} /> : null} />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`${base}?month=${shift(month, -1)}`} className={buttonClass("secondary", "sm", "w-9 px-0")} aria-label="Previous month">
            <Icon name="chevronLeft" size={18} />
          </Link>
          <Link href={`${base}?month=${shift(month, 1)}`} className={buttonClass("secondary", "sm", "w-9 px-0")} aria-label="Next month">
            <Icon name="chevronRight" size={18} />
          </Link>
          <h2 className="ml-1 fs-20 font-semibold">{label}</h2>
          {month !== today.slice(0, 7) ? (
            <Link href={base} className="ml-2 fs-14 font-medium text-blue">
              Today
            </Link>
          ) : null}
          <span className="ml-auto flex flex-wrap gap-1.5">
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <span key={k} className={cn("rounded-md border px-2 py-0.5 fs-12 font-medium", KIND_CLASS[k])}>
                {v}
              </span>
            ))}
          </span>
        </div>
        <MonthGrid slug={slug} month={month} today={today} editable={editable} events={events.map((e) => ({ id: e.id, title: e.title, kind: e.kind, startsOn: e.startsOn, endsOn: e.endsOn, details: e.details, forParents: e.forParents }))} />
        <Card className="p-5">
          <h2 className="fs-16 font-semibold">This month</h2>
          {events.length === 0 ? (
            <p className="mt-2 fs-14.5 text-muted">{editable ? "Nothing yet. Click a day to add an event." : "Nothing on the calendar this month."}</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="tabular w-28 shrink-0 fs-14 text-muted">
                    {e.startsOn.slice(8)} {label.split(" ")[0].slice(0, 3)}
                    {e.endsOn !== e.startsOn ? ` to ${new Date(`${e.endsOn}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block fs-15 font-medium text-ink">{e.title}</span>
                    {e.details ? <span className="block fs-13.5 text-muted">{e.details}</span> : null}
                  </span>
                  <span className={cn("rounded-md border px-2 py-0.5 fs-12 font-medium", KIND_CLASS[e.kind])}>{KIND_LABEL[e.kind]}</span>
                  {!e.forParents ? <Badge>Staff only</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
