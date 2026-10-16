import type { Metadata } from "next";
import Link from "next/link";
import { AttendanceScene } from "@/components/illustrations/art";
import { Illustration } from "@/components/illustrations";
import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, StatCard, StatGrid } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { lagosToday, listAttendanceClasses } from "@/lib/services/attendance";
import { DatePicker } from "./date-picker";
import { formatTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Attendance" };

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function AttendancePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["attendance:take", "attendance:edit_past", "attendance:report"]);
  const today = lagosToday();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const classes = await listAttendanceClasses(getDb(), access, date);
  const taken = classes.filter((c) => c.taken);
  const marked = taken.reduce((n, c) => n + c.present + c.late + c.absent + c.excused, 0);
  const presentish = taken.reduce((n, c) => n + c.present + c.late, 0);
  const absent = taken.reduce((n, c) => n + c.absent, 0);
  const late = taken.reduce((n, c) => n + c.late, 0);
  const isToday = date === today;
  const base = `/s/${slug}/attendance`;

  return (
    <>
      <Topbar title="Attendance" context={longDate.format(new Date(`${date}T00:00:00Z`))} actions={<DatePicker value={date} max={today} />} />
      <PageBody>
        {classes.length === 0 ? (
          <Card className="overflow-hidden">
            <div className="grid items-center lg:grid-cols-[1fr_360px]">
              <EmptyState icon="calendarCheck" title="No classes to take attendance for">
                Attendance is taken by each class&apos;s form teacher. Ask your admin to make you the class teacher of your class in Academics.
              </EmptyState>
              <div className="hidden bg-success-wash p-8 lg:block">
                <Illustration name="attendance" fallback={<AttendanceScene className="w-full" />} className="w-full" />
              </div>
            </div>
          </Card>
        ) : (
          <>
            <StatGrid>
              <StatCard
                label="Registers taken"
                value={`${taken.length} / ${classes.length}`}
                icon="clipboard"
                tone="brand"
                progress={{ value: (taken.length / classes.length) * 100, tone: taken.length === classes.length ? "success" : "brand" }}
                caption={taken.length === classes.length ? "Every class is done" : `${classes.length - taken.length} still to take`}
              />
              <StatCard label="In school" value={marked ? `${Math.round((presentish / marked) * 100)}%` : "—"} icon="checkCircle" tone="success" caption={marked ? `${presentish} of ${marked} students` : "No registers yet"} />
              <StatCard label="Absent" value={absent} icon="userX" tone={absent ? "danger" : "neutral"} caption={absent ? "Parents can be alerted" : "Nobody absent"} />
              <StatCard label="Late" value={late} icon="history" tone={late ? "warning" : "neutral"} caption="Counted as present" />
            </StatGrid>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {classes.map((c) => {
                const total = c.present + c.late + c.absent + c.excused;
                return (
                  <Card key={c.id} className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="fs-17 font-semibold">{c.name}</h2>
                        <p className="fs-13.5 text-muted">{c.students} students</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {c.isMine ? <Badge tone="brand">Your class</Badge> : null}
                        {c.taken ? (
                          <Badge tone="success" dot>
                            Taken
                          </Badge>
                        ) : (
                          <Badge tone="warning" dot>
                            Not taken
                          </Badge>
                        )}
                      </div>
                    </div>
                    {c.taken && total ? (
                      <>
                        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-sunken">
                          <div className="bg-success" style={{ width: `${(c.present / total) * 100}%` }} />
                          <div className="bg-warning" style={{ width: `${(c.late / total) * 100}%` }} />
                          <div className="bg-blue" style={{ width: `${(c.excused / total) * 100}%` }} />
                          <div className="bg-danger" style={{ width: `${(c.absent / total) * 100}%` }} />
                        </div>
                        <p className="tabular mt-2 fs-13 text-body">
                          {c.present} present · {c.late} late · {c.absent} absent{c.excused ? ` · ${c.excused} excused` : ""}
                        </p>
                        <p className="mt-0.5 fs-12.5 text-muted">
                          By {c.takenBy ?? "staff"} at {c.takenAt ? formatTime(c.takenAt) : ""}
                        </p>
                      </>
                    ) : (
                      <p className="mt-4 fs-13.5 text-muted">{isToday ? "Everyone starts as present. It takes a few seconds." : "No register was taken on this day."}</p>
                    )}
                    <div className="mt-auto pt-5">
                      <ButtonLink href={`${base}/${c.id}${isToday ? "" : `?date=${date}`}`} variant={c.taken ? "secondary" : "primary"} className="w-full">
                        <Icon name={c.taken ? "edit" : "checkCircle"} size={18} />
                        {c.taken ? "View or edit register" : "Take register"}
                      </ButtonLink>
                    </div>
                  </Card>
                );
              })}
            </div>
            {!isToday ? (
              <Link href={base} className="self-start fs-14 font-medium text-blue hover:underline">
                Back to today
              </Link>
            ) : null}
          </>
        )}
      </PageBody>
    </>
  );
}
