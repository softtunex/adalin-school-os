import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Avatar, Badge, Card, type Tone } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { getChildDetail } from "@/lib/services/parent-portal";
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
  const tab = ["attendance", "timetable", "results", "fees", "news"].includes(rawTab ?? "") ? rawTab! : "attendance";
  const name = [d.link.firstName, d.link.middleName, d.link.lastName].filter(Boolean).join(" ");
  const base = `/p/children/${id}`;
  const att = d.attendance && d.attendance.days ? Math.round((d.attendance.present / d.attendance.days) * 100) : null;
  const canMessage = d.link.school.features.includes("messaging");

  return (
    <div className="flex flex-col gap-5">
      <Link href="/p" className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-muted hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Home
      </Link>
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

      <Tabs
        current={tab}
        tabs={[
          { key: "attendance", label: "Attendance", href: base },
          ...(d.timetable ? [{ key: "timetable", label: "Timetable", href: `${base}?tab=timetable` }] : []),
          { key: "results", label: "Results", href: `${base}?tab=results`, count: d.results.length },
          { key: "fees", label: "Fees", href: `${base}?tab=fees` },
          { key: "news", label: "News", href: `${base}?tab=news` },
        ]}
      />

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
