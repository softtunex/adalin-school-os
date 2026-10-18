import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Avatar, Badge, Card, type Tone } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { getChildHomework } from "@/lib/services/assignments";
import { getChildConduct } from "@/lib/services/discipline";
import { HealthPanel } from "@/components/health-panel";
import { getChildHealth } from "@/lib/services/health";
import { BusPanel } from "@/components/bus-panel";
import { getChildBus } from "@/lib/services/transport";
import { BoardingPanel } from "@/components/boarding-panel";
import { getChildBoarding } from "@/lib/services/hostel";
import { ConductList } from "@/components/conduct-list";
import { getChildDetail } from "@/lib/services/parent-portal";
import { formatDue } from "@/lib/dates";
import { FileLinks } from "@/components/file-uploader";
import { HOMEWORK_STATUS } from "@/app/learn/assignments/status";
import { WeekList } from "@/components/week-list";
import { AnnouncementItem } from "../../parts";

export const metadata: Metadata = { title: "Your child" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABSENCE: Record<string, { label: string; tone: Tone }> = { absent: { label: "Absent", tone: "danger" }, late: { label: "Late", tone: "warning" }, excused: { label: "Excused", tone: "blue" } };
const INVOICE: Record<string, { label: string; tone: Tone }> = { unpaid: { label: "Unpaid", tone: "danger" }, partial: { label: "Part paid", tone: "warning" }, paid: { label: "Paid", tone: "success" } };

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function ChildPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  let d: Awaited<ReturnType<typeof getChildDetail>>;
  try {
    d = await getChildDetail(getDb(), user, id);
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "upgrade") return <Alert tone="blue">{error.message}</Alert>;
      notFound();
    }
    throw error;
  }
  const homework = await getChildHomework(getDb(), user.id, id);
  const conduct = await getChildConduct(getDb(), user.id, id);
  const health = await getChildHealth(getDb(), user.id, id);
  const bus = await getChildBus(getDb(), user.id, id);
  const boarding = await getChildBoarding(getDb(), user.id, id);
  const tab = ["attendance", "timetable", "homework", "conduct", "health", "bus", "hostel", "results", "fees", "news"].includes(rawTab ?? "") ? rawTab! : "home";
  const name = [d.link.firstName, d.link.middleName, d.link.lastName].filter(Boolean).join(" ");
  const base = `/p/children/${id}`;
  const att = d.attendance && d.attendance.days ? Math.round((d.attendance.present / d.attendance.days) * 100) : null;
  const canMessage = d.link.school.features.includes("messaging");

  return (
    <div className="flex flex-col gap-5">
      {tab === "home" ? (
        <Link href="/p" className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> Home
        </Link>
      ) : null}
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <Avatar name={`${d.link.firstName} ${d.link.lastName}`} size={64} />
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="fs-22 font-bold tracking-[-0.01em]">{name}</h1>
          <p className="fs-14.5 text-muted">
            {d.className ?? "No class yet"} · {d.link.school.name}
          </p>
          <p className="font-mono fs-13 text-muted">{d.link.admissionNo}</p>
        </div>
        {canMessage ? (
          <Link href={`/p/messages/new?student=${id}`} className={buttonClass("secondary", "sm", "w-full sm:w-auto")}>
            <Icon name="chat" size={16} /> Message the teacher
          </Link>
        ) : null}
      </Card>

      {tab === "home" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { key: "attendance", label: "Attendance", icon: "calendar" as const, value: att === null ? "—" : `${att}%`, sub: d.attendance?.days ? `${d.attendance.absent} absent · ${d.attendance.late} late` : "No register yet", alert: att !== null && att < 75 },
            { key: "fees", label: "Fees", icon: "banknote" as const, value: d.owing > 0 ? formatNaira(d.owing) : "Paid up", sub: d.owing > 0 ? "to pay" : d.invoices.length ? "Nothing owed" : "No invoices yet", alert: d.owing > 0 },
            { key: "results", label: "Results", icon: "results" as const, value: d.results.length ? String(d.results.length) : "—", sub: d.results.length ? `term${d.results.length === 1 ? "" : "s"} published` : "None published yet" },
            ...(homework ? [{ key: "homework", label: "Homework", icon: "clipboard" as const, value: String(homework ? homework.filter((h) => h.status === "to_do" || h.status === "overdue").length : 0), sub: "to do", alert: homework.some((h) => h.status === "overdue") }] : []),
            ...(d.timetable ? [{ key: "timetable", label: "Timetable", icon: "clock" as const, value: "This week", sub: "Lessons by day" }] : []),
            ...(conduct ? [{ key: "conduct", label: "Conduct", icon: "star" as const, value: `${conduct.points > 0 ? "+" : ""}${conduct.points} pts`, sub: `${conduct.merits} merit${conduct.merits === 1 ? "" : "s"} this term` }] : []),
            ...(health ? [{ key: "health", label: "Health", icon: "health" as const, value: String(health.visits.length), sub: health.visits.length === 1 ? "sick bay visit" : "sick bay visits" }] : []),
            ...(bus ? [{ key: "bus", label: "Bus", icon: "bus" as const, value: bus.route.name, sub: bus.stop ? `Stop: ${bus.stop.name}` : "Bus route" }] : []),
            ...(boarding ? [{ key: "hostel", label: "Hostel", icon: "bed" as const, value: boarding.hostel, sub: /^room/i.test(boarding.room) ? boarding.room : `Room ${boarding.room}` }] : []),
            { key: "news", label: "News", icon: "bell" as const, value: String(d.news.length), sub: d.news.length === 1 ? "update" : "updates" },
          ].map((t) => (
            <Link key={t.key} href={`${base}?tab=${t.key}`} className="group">
              <Card className={`flex h-full flex-col gap-2 p-4 transition-colors group-hover:border-brand ${"alert" in t && t.alert ? "border-danger" : ""}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="fs-14 font-semibold text-ink">{t.label}</span>
                  <Icon name={t.icon} size={20} className="text-muted group-hover:text-brand" />
                </span>
                <span className={`tabular font-bold leading-tight ${t.value.length > 9 ? "fs-17" : "fs-22"} ${"alert" in t && t.alert ? "text-danger" : "text-ink"}`}>{t.value}</span>
                <span className="fs-13 text-muted">{t.sub}</span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link href={base} className="inline-flex items-center gap-1 fs-14 font-semibold text-muted hover:text-ink">
            <Icon name="chevronLeft" size={16} /> All about {d.link.firstName}
          </Link>
        </div>
      )}

      {tab === "attendance" ? (
        <div className="flex flex-col gap-4">
          {d.attendance ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Attendance", value: att === null ? "—" : `${att}%`, tone: att !== null && att < 75 ? "text-danger" : "text-success" },
                { label: "Days present", value: d.attendance.present, tone: "text-ink" },
                { label: "Absent", value: d.attendance.absent, tone: d.attendance.absent ? "text-danger" : "text-ink" },
                { label: "Late", value: d.attendance.late, tone: d.attendance.late ? "text-warning" : "text-ink" },
              ].map((s) => (
                <Card key={s.label} className="p-4">
                  <p className="fs-13 text-muted">{s.label}</p>
                  <p className={`tabular mt-1 fs-24 font-bold ${s.tone}`}>{s.value}</p>
                </Card>
              ))}
            </div>
          ) : null}
          <Card className="p-5">
            <h2 className="fs-16 font-semibold">{d.term ? `Days missed or late, ${d.term.label}` : "Attendance"}</h2>
            {d.missed.length === 0 ? (
              <p className="mt-2 fs-14.5 text-muted">{d.attendance?.days ? `${d.link.firstName} hasn't missed a day this term.` : "Attendance shows here once the class register is taken."}</p>
            ) : (
              <ul className="mt-2 flex flex-col divide-y divide-line">
                {d.missed.map((m) => (
                  <li key={`${m.date}${m.status}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <span className="block fs-14.5 text-ink">{day(m.date)}</span>
                      {m.note ? <span className="block fs-13 text-muted">{m.note}</span> : null}
                    </span>
                    <Badge tone={ABSENCE[m.status].tone}>{ABSENCE[m.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "timetable" && d.timetable ? (
        <WeekList days={d.timetable.schedule.days} periods={d.timetable.schedule.periods} slots={d.timetable.slots} />
      ) : null}

      {tab === "homework" && homework ? (
        <Card className="p-5">
          <h2 className="fs-16 font-semibold">Homework this term</h2>
          {homework.length === 0 ? (
            <p className="mt-2 fs-14.5 text-muted">No homework set yet this term.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {[...homework].reverse().map((h) => (
                <li key={h.a.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block fs-13 font-semibold text-muted">{h.subjectName}</span>
                      <span className="block fs-15 font-semibold text-ink">{h.a.title}</span>
                      <span className="block fs-13.5 text-muted">
                        {h.status === "marked" && h.sub?.score != null && h.a.maxScore ? `Scored ${h.sub.score} / ${h.a.maxScore}` : `Due ${formatDue(h.a.dueAt)}`}
                        {h.sub?.late ? " · Handed in late" : ""}
                      </span>
                    </span>
                    <Badge tone={HOMEWORK_STATUS[h.status].tone}>{HOMEWORK_STATUS[h.status].label}</Badge>
                  </div>
                  {h.sub?.feedback ? <p className="fs-14 text-body">Teacher: &ldquo;{h.sub.feedback}&rdquo;</p> : null}
                  <FileLinks files={h.files} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "conduct" && conduct ? <ConductList conduct={conduct} name={d.link.firstName} /> : null}

      {tab === "health" && health ? <HealthPanel name={d.link.firstName} record={health.record} visits={health.visits} /> : null}

      {tab === "bus" && bus ? <BusPanel bus={bus} name={d.link.firstName} /> : null}

      {tab === "hostel" && boarding ? <BoardingPanel data={boarding} studentId={id} name={d.link.firstName} /> : null}

      {tab === "results" ? (
        <Card className="p-5">
          <h2 className="fs-16 font-semibold">Report cards</h2>
          {d.results.length === 0 ? (
            <p className="mt-2 fs-14.5 text-muted">No results have been published yet. You&apos;ll get a message as soon as they are.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {d.results.map((r) => (
                <li key={r.termId} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="grid size-10 place-items-center rounded-chunk bg-violet-wash text-violet">
                    <Icon name="results" size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block fs-15 font-semibold text-ink">
                      {r.termName}, {r.session}
                    </span>
                    <span className="block fs-13.5 text-muted">{r.className}</span>
                  </span>
                  {r.withheld ? (
                    <span className="flex flex-col items-end">
                      <Badge tone="warning">Held</Badge>
                      <span className="fs-12.5 text-muted">Clear the term&apos;s fees to view</span>
                    </span>
                  ) : (
                    <a href={`${base}/report-card/${r.termId}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                      <Icon name="download" size={16} /> Report card
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "fees" ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="fs-16 font-semibold">Fees</h2>
            <p className={`tabular fs-15 font-semibold ${d.owing > 0 ? "text-ink" : "text-success"}`}>{d.owing > 0 ? `${formatNaira(d.owing)} to pay` : "All paid up"}</p>
          </div>
          {d.invoices.length === 0 ? (
            <p className="mt-2 fs-14.5 text-muted">No invoices yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {d.invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block fs-15 font-semibold text-ink">{inv.title}</span>
                    <span className="block fs-13.5 text-muted">
                      <span className="font-mono">{inv.number}</span> · {formatNaira(inv.chargesKobo - inv.discountKobo)}, {formatNaira(inv.paidKobo)} paid
                    </span>
                  </span>
                  <Badge tone={INVOICE[inv.status]?.tone ?? "neutral"}>{INVOICE[inv.status]?.label ?? inv.status}</Badge>
                  <span className="flex w-full gap-2 sm:w-auto">
                    <a href={`/pay/${inv.payToken}/pdf`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm", "flex-1 sm:flex-none")} aria-label={`Download invoice ${inv.number}`}>
                      <Icon name="download" size={16} /> Invoice
                    </a>
                    <a href={`/pay/${inv.payToken}`} className={buttonClass(inv.balance > 0 && d.canPayOnline ? "primary" : "secondary", "sm", "flex-1 sm:flex-none")}>
                      {inv.balance > 0 && d.canPayOnline ? `Pay ${formatNaira(inv.balance)}` : "View"}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "news" ? (
        <div className="flex flex-col gap-4">
          <Card className="px-5">
            {d.news.length === 0 ? (
              <p className="py-5 fs-14.5 text-muted">No announcements yet.</p>
            ) : (
              d.news.map((n) => (
                <AnnouncementItem
                  key={n.a.id}
                  schoolId={d.link.schoolId}
                  id={n.a.id}
                  title={n.a.title}
                  body={n.a.body}
                  pinned={n.a.pinned}
                  unread={!n.readAt}
                  date={n.a.publishedAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" })}
                />
              ))
            )}
          </Card>
          {d.events.length ? (
            <Card className="p-5">
              <h2 className="fs-16 font-semibold">School calendar</h2>
              <ul className="mt-2 flex flex-col divide-y divide-line">
                {d.events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 py-2.5 fs-14.5">
                    <span className="text-ink">{e.title}</span>
                    <span className="tabular whitespace-nowrap text-muted">{e.startsOn === e.endsOn ? day(e.startsOn) : `${day(e.startsOn)} to ${day(e.endsOn)}`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
