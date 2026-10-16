import type { Metadata } from "next";
import { Card } from "@/components/ui/display";
import { WeekList } from "@/components/week-list";
import { requireUser } from "@/lib/auth/session";
import { formatWhen } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { getStudentHome } from "@/lib/services/student-portal";
import { AnnouncementItem } from "../p/parts";

export const metadata: Metadata = { title: "Today" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function StudentToday() {
  const user = await requireUser();
  const home = await getStudentHome(getDb(), user.id);
  const att = home.attendance?.days ? Math.round((home.attendance.present / home.attendance.days) * 100) : null;
  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="fs-26 font-bold tracking-[-0.02em] sm:fs-30">
          {greeting()}, {home.me.firstName}
        </h1>
        <p className="mt-1 fs-15 text-muted">
          {home.me.className ?? "No class yet"} · {home.me.school.name}
          {home.term ? ` · ${home.term}` : ""}
        </p>
      </div>
      {att !== null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="fs-13 text-muted">Attendance this term</p>
            <p className={`tabular mt-1 fs-24 font-bold ${att >= 90 ? "text-success" : att >= 75 ? "text-ink" : "text-danger"}`}>{att}%</p>
          </Card>
          <Card className="p-4">
            <p className="fs-13 text-muted">Days absent</p>
            <p className="tabular mt-1 fs-24 font-bold text-ink">{home.attendance!.absent}</p>
          </Card>
        </div>
      ) : null}
      {home.week ? (
        <section className="flex flex-col gap-3">
          <h2 className="fs-18 font-bold">Your lessons</h2>
          <WeekList days={home.week.schedule.days} periods={home.week.schedule.periods} slots={home.week.slots} />
        </section>
      ) : null}
      {home.news.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="fs-18 font-bold">From school</h2>
          <Card className="px-5">
            {home.news.map((n) => (
              <AnnouncementItem key={n.a.id} schoolId={home.me.schoolId} id={n.a.id} title={n.a.title} body={n.a.body} pinned={n.a.pinned} unread={!n.readAt} date={formatWhen(n.a.publishedAt)} />
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
