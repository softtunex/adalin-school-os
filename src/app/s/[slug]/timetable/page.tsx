import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { buttonClass } from "@/components/ui/button-styles";
import { FilterSelect } from "@/components/ui/data";
import { Card, EmptyState, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { getClassTimetable, getTeacherTimetable, getTimetableSetup } from "@/lib/services/timetable";
import { TermFilter } from "../fees/shared";
import { LevelScheduleSelect, ScheduleEditor } from "./schedule-editor";
import { TimetableGrid } from "./timetable-grid";

export const metadata: Metadata = { title: "Timetable" };

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export default async function TimetablePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string; class?: string; teacher?: string; term?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["school:view"]);
  if (!access.isStaff) return null;
  if (!hasFeature(access.plan, "timetable")) {
    return (
      <>
        <Topbar title="Timetable" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="timetable" text="Build each class's week, catch teacher and room clashes, and share the timetable with parents and students." />
        </PageBody>
      </>
    );
  }
  const db = getDb();
  const manager = can(access, "teaching:timetable");
  const view = sp.view === "setup" && manager ? "setup" : sp.view === "teacher" || !manager ? "teacher" : "class";
  const base = `/s/${slug}/timetable`;
  const tabs = [
    ...(manager ? [{ key: "class", label: "Classes", href: base }] : []),
    { key: "teacher", label: manager ? "Teachers" : "My timetable", href: `${base}?view=teacher` },
    ...(manager ? [{ key: "setup", label: "Bell schedule", href: `${base}?view=setup` }] : []),
  ];

  let body: React.ReactNode = null;
  let printHref = `/print/${slug}/timetable`;

  if (view === "class") {
    const classes = await listClassOptions(db, access);
    const classId = classes.some((c) => c.id === sp.class) ? sp.class! : classes[0]?.id;
    if (!classId) {
      body = (
        <Card>
          <EmptyState icon="layers" title="No classes yet">
            Set up classes in Academics first.
          </EmptyState>
        </Card>
      );
    } else {
      const t = await getClassTimetable(db, access, classId, sp.term);
      printHref += `?class=${classId}&term=${t.term.id}`;
      const placed = t.subjects.reduce((n, s) => n + s.lessons, 0);
      const capacity = t.schedule.periods.filter((p) => p.kind === "lesson").length * t.schedule.days.length;
      body = (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="Class" param="class" includeAll={false} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
            <TermFilter terms={t.terms} />
            <span className="ml-auto fs-14 text-muted">
              {placed} of {capacity} lessons placed
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
            <TimetableGrid
              slug={slug}
              termId={t.term.id}
              classId={classId}
              days={t.schedule.days}
              periods={t.schedule.periods}
              slots={t.slots}
              subjects={t.subjects}
              staff={t.staff}
              editable={t.editable}
            />
            <Card className="h-fit p-5">
              <h2 className="fs-15.5 font-semibold">Lessons a week</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {t.subjects.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 fs-14">
                    <span className={s.lessons ? "text-ink" : "text-muted"}>{s.name}</span>
                    <span className={`tabular font-semibold ${s.lessons ? "text-ink" : "text-muted"}`}>{s.lessons}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      );
    }
  } else if (view === "teacher") {
    const t = await getTeacherTimetable(db, access, sp.teacher, sp.term);
    printHref += `?teacher=${t.teacherId}&term=${t.term.id}`;
    const lessonPeriods = t.schedule.periods;
    // Lessons on another bell schedule land in whichever period of this one they overlap.
    const slots = t.lessons.flatMap((l) => {
      const p = lessonPeriods.find((x) => minutes(x.startsAt) < minutes(l.endsAt) && minutes(l.startsAt) < minutes(x.endsAt) && x.kind === "lesson");
      return p ? [{ ...l, periodId: p.id, subjectCode: null, teacherName: null }] : [];
    });
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          {t.staff.length ? <FilterSelect label="Teacher" param="teacher" includeAll={false} options={[...t.staff].sort((a, b) => (a.id === t.teacherId ? -1 : b.id === t.teacherId ? 1 : 0)).map((s) => ({ value: s.id, label: s.name }))} /> : null}
          <TermFilter terms={t.terms} />
          <span className="ml-auto fs-14 text-muted">{t.lessons.length} lessons a week</span>
        </div>
        {t.lessons.length ? (
          <TimetableGrid slug={slug} termId={t.term.id} days={t.schedule.days} periods={lessonPeriods} slots={slots} subjects={[]} staff={[]} editable={false} mode="teacher" />
        ) : (
          <Card>
            <EmptyState icon="calendar" title="No lessons on the timetable yet">
              {manager ? "Lessons appear here as you build each class's week." : "Your lessons appear here once the timetable is set."}
            </EmptyState>
          </Card>
        )}
      </>
    );
  } else {
    const setup = await getTimetableSetup(db, access);
    body = (
      <div className="flex flex-col gap-5">
        {setup.schedules.map((s) => (
          <ScheduleEditor key={s.id} slug={slug} editable={manager} schedule={{ id: s.id, name: s.name, days: s.days, periods: s.periods.map((p) => ({ id: p.id, label: p.label, startsAt: p.startsAt, endsAt: p.endsAt, kind: p.kind })) }} />
        ))}
        <details className="rounded-card border border-dashed border-line-strong bg-canvas">
          <summary className="cursor-pointer list-none px-5 py-4 fs-15 font-semibold text-blue [&::-webkit-details-marker]:hidden">+ Add another bell schedule (e.g. a shorter nursery day)</summary>
          <div className="px-1 pb-1">
            <ScheduleEditor slug={slug} editable={manager} schedule={{ name: "Nursery day", days: [1, 2, 3, 4, 5], periods: [{ label: "1", startsAt: "08:00", endsAt: "08:30", kind: "lesson" }] }} />
          </div>
        </details>
        <TableCard title="Which classes follow which schedule">
          <Table minWidth="min-w-[480px]">
            <thead>
              <tr>
                <Th>Class level</Th>
                <Th>Bell schedule</Th>
              </tr>
            </thead>
            <tbody>
              {setup.levels.map((l) => (
                <tr key={l.id}>
                  <Td className="font-medium">{l.name}</Td>
                  <Td>
                    <LevelScheduleSelect slug={slug} levelId={l.id} value={l.scheduleId} schedules={setup.schedules} editable={manager} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableCard>
      </div>
    );
  }

  return (
    <>
      <Topbar
        title="Timetable"
        context={access.school.name}
        actions={
          view !== "setup" ? (
            <a href={printHref} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <Icon name="download" size={18} /> Print
            </a>
          ) : null
        }
      />
      <PageBody>
        <Tabs current={view} tabs={tabs} />
        {body}
      </PageBody>
    </>
  );
}
