import type { Metadata } from "next";
import Link from "next/link";
import { BarList, Columns, heatStyle, LineChart, SERIES } from "@/components/charts";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect } from "@/components/ui/data";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th, type Tone } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { ButtonLink } from "@/components/ui/button";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { getCurrentTerm } from "@/lib/services/academics";
import { formatNaira, formatNairaCompact } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { getAcademicAnalytics, getAnalyticsOverview, getAtRisk, getTeacherAnalytics, PASS_MARK, RISK, type RiskReason } from "@/lib/services/analytics";
import { TermFilter } from "../fees/shared";
import { OverviewSwitch } from "../overview-switch";

export const metadata: Metadata = { title: "Analytics" };

type SP = { tab?: string; term?: string; level?: string; class?: string; kind?: string };

const REASON: Record<RiskReason["kind"], { label: string; tone: Tone }> = {
  failing: { label: "Low scores", tone: "danger" },
  dropping: { label: "Falling", tone: "warning" },
  attendance: { label: "Attendance", tone: "violet" },
  fees: { label: "Fees", tone: "neutral" },
};

/** "+3.2 since last term", green when the change is good. */
function Delta({ now, before, unit = "", invert = false }: { now: number | null; before: number | null; unit?: string; invert?: boolean }) {
  if (now === null || before === null) return <span className="text-muted">No earlier term to compare</span>;
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span className="text-muted">Same as last term</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", good ? "text-success-deep" : "text-danger")}>
      <Icon name="trending" size={14} className={d < 0 ? "-scale-y-100" : undefined} />
      {d > 0 ? "+" : ""}
      {d}
      {unit} since last term
    </span>
  );
}

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["school:analytics"]);
  if (!hasFeature(access.plan, "analytics")) {
    return (
      <>
        <Topbar title="Analytics" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="analytics" text="See results trends, weak subjects, students who need attention and how every teacher is keeping up, all in one place." />
        </PageBody>
      </>
    );
  }
  // A new school has no term yet: nothing to analyse, so say how to start rather than fail.
  const current = await withTenant(getDb(), access.school.id, (tx) => getCurrentTerm(tx));
  if (!current && !sp.term) {
    return (
      <>
        <Topbar title="Overview" context={`Analytics · ${access.school.name}`} />
        <PageBody>
          <OverviewSwitch slug={slug} access={access} current="analytics" />
          <Card>
            <EmptyState icon="trending" title="Analytics start with your first term" action={<ButtonLink href={`/s/${slug}/academics`}>Set up classes and terms</ButtonLink>}>
              Set up your classes and the current term, then add scores and attendance. Trends, weak subjects and students who need attention appear here as the term goes on.
            </EmptyState>
          </Card>
        </PageBody>
      </>
    );
  }
  const tab = ["academics", "students", "teachers"].includes(sp.tab ?? "") ? sp.tab! : "overview";
  const base = `/s/${slug}/analytics`;
  const q = (t: string) => `${base}?tab=${t}${sp.term ? `&term=${sp.term}` : ""}`;
  return (
    <>
      <Topbar title="Overview" context={`Analytics · ${access.school.name}`} />
      <PageBody>
        <OverviewSwitch slug={slug} access={access} current="analytics" />
        <Tabs
          current={tab}
          tabs={[
            { key: "overview", label: "Term summary", href: sp.term ? `${base}?term=${sp.term}` : base },
            { key: "academics", label: "Academics", href: q("academics") },
            { key: "students", label: "Students at risk", href: q("students") },
            { key: "teachers", label: "Teachers", href: q("teachers") },
          ]}
        />
        {tab === "academics" ? (
          <Academics access={access} sp={sp} />
        ) : tab === "students" ? (
          <AtRisk slug={slug} access={access} sp={sp} />
        ) : tab === "teachers" ? (
          <Teachers access={access} sp={sp} />
        ) : (
          <Overview slug={slug} access={access} sp={sp} />
        )}
      </PageBody>
    </>
  );
}

async function Overview({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const o = await getAnalyticsOverview(getDb(), access, sp.term);
  const base = `/s/${slug}/analytics`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TermFilter terms={o.terms} />
        <span className="fs-14 text-muted">Compared with {o.previous ? o.previous.label : "no earlier term"}</span>
      </div>
      <StatGrid>
        <StatCard label="Average score" value={o.average.now === null ? "—" : `${o.average.now}%`} icon="results" tone="brand" caption={<Delta now={o.average.now} before={o.average.before} unit=" pts" />} />
        <StatCard label="Pass rate" value={o.passRate.now === null ? "—" : `${o.passRate.now}%`} icon="checkCircle" tone="success" caption={<Delta now={o.passRate.now} before={o.passRate.before} unit=" pts" />} />
        <StatCard label="Attendance" value={o.attendance.now === null ? "—" : `${o.attendance.now}%`} icon="calendarCheck" tone="blue" caption={<Delta now={o.attendance.now} before={o.attendance.before} unit=" pts" />} />
        <StatCard
          label="Fees collected"
          value={o.fees.now.rate === null ? "—" : `${o.fees.now.rate}%`}
          icon="banknote"
          tone="violet"
          caption={o.fees.now.billed ? `${formatNairaCompact(o.fees.now.collected)} of ${formatNairaCompact(o.fees.now.billed)}` : "No invoices this term"}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="fs-16 font-semibold">Results over time</h2>
            <p className="fs-13.5 text-muted">School-wide average and pass rate (scores of {PASS_MARK}% and above), by term.</p>
          </div>
          {o.trend.length ? (
            <LineChart
              caption="Average score and pass rate by term"
              labels={o.trend.map((t) => t.label)}
              series={[
                { name: "Average score", values: o.trend.map((t) => t.average) },
                { name: "Pass rate", values: o.trend.map((t) => t.pass) },
              ]}
            />
          ) : (
            <EmptyState icon="results" title="No scores yet">
              Trends appear once teachers enter scores.
            </EmptyState>
          )}
        </Card>
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="fs-16 font-semibold">Students who need attention</h2>
              <p className="fs-13.5 text-muted">Low or falling scores, or poor attendance.</p>
            </div>
            <span className="tabular fs-28 font-bold leading-none text-ink">{o.atRisk.count}</span>
          </div>
          {o.atRisk.top.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {o.atRisk.top.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate fs-14.5 font-medium text-ink">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="block truncate fs-13 text-muted">
                      {s.className} · {s.reasons.map((r) => r.text).join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fs-14.5 text-muted">Nobody is flagged this term.</p>
          )}
          <Link href={`${base}?tab=students${sp.term ? `&term=${sp.term}` : ""}`} className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-brand-ink hover:underline">
            See everyone flagged <Icon name="arrowRight" size={15} />
          </Link>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-15 font-semibold">Attendance by week</h2>
          {o.attendance.weeks.length ? (
            <>
              <Columns
                values={o.attendance.weeks.map((w) => w.rate)}
                labels={o.attendance.weeks.map((w) => `Week of ${w.week}`)}
                ticks={o.attendance.weeks.map((w) => new Date(`${w.week}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" }))}
              />
              <p className="fs-13 text-muted">
                Lowest week {Math.min(...o.attendance.weeks.map((w) => w.rate))}%, highest {Math.max(...o.attendance.weeks.map((w) => w.rate))}%
              </p>
            </>
          ) : (
            <p className="fs-14 text-muted">No registers taken this term yet.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-15 font-semibold">Score sheets</h2>
          <p className="tabular fs-28 font-bold leading-none text-ink">
            {o.sheets.submitted}
            <span className="fs-16 text-muted"> / {o.sheets.expected}</span>
          </p>
          <p className="fs-13.5 text-muted">
            Submitted this term. {o.sheets.started} started. {o.sheets.expected - o.sheets.started} not started.
          </p>
          <span className="h-2 overflow-hidden rounded-full bg-sunken">
            <span className="block h-full rounded-full bg-success" style={{ width: `${o.sheets.rate ?? 0}%` }} />
          </span>
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="fs-15 font-semibold">Students and admissions</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 fs-14">
            <dt className="text-muted">Active students</dt>
            <dd className="tabular text-right font-semibold text-ink">{o.students.active}</dd>
            <dt className="text-muted">Girls · boys</dt>
            <dd className="tabular text-right font-semibold text-ink">
              {o.students.active ? `${o.students.female} · ${o.students.active - o.students.female}` : "—"}
              {o.students.active ? <span className="block fs-12.5 font-normal text-muted">{Math.round((o.students.female / o.students.active) * 100)}% · {100 - Math.round((o.students.female / o.students.active) * 100)}%</span> : null}
            </dd>
            <dt className="text-muted">New this term</dt>
            <dd className="tabular text-right font-semibold text-ink">{o.students.joined}</dd>
            <dt className="text-muted">Applications open</dt>
            <dd className="tabular text-right font-semibold text-ink">{(o.applicants.applied ?? 0) + (o.applicants.exam ?? 0) + (o.applicants.interview ?? 0)}</dd>
            <dt className="text-muted">Offers awaiting reply</dt>
            <dd className="tabular text-right font-semibold text-ink">{o.applicants.offered ?? 0}</dd>
            <dt className="text-muted">Fees outstanding</dt>
            <dd className="tabular text-right font-semibold text-ink">{formatNaira(o.fees.now.outstanding)}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}

async function Academics({ access, sp }: { access: Access; sp: SP }) {
  const a = await getAcademicAnalytics(getDb(), access, { termId: sp.term, levelId: sp.level });
  const cellValues = a.heat.flatMap((r) => r.cells.map((c) => c.average)).filter((v): v is number => v !== null);
  const lo = cellValues.length ? Math.floor(Math.min(...cellValues)) : 0;
  const hi = cellValues.length ? Math.ceil(Math.max(...cellValues)) : 100;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TermFilter terms={a.terms} />
        <FilterSelect label="Class" param="level" options={a.levels.map((l) => ({ value: l.id, label: l.name }))} />
      </div>
      {a.entries === 0 ? (
        <Card>
          <EmptyState icon="results" title="No scores for this term yet">
            Charts fill in as teachers enter CA and exam scores.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="flex flex-col gap-3 p-5 sm:p-6">
              <div>
                <h2 className="fs-16 font-semibold">Subjects, weakest first</h2>
                <p className="fs-13.5 text-muted">Average score this term, with the change since last term and the pass rate.</p>
              </div>
              <BarList
                rows={a.bySubject.map((s) => ({
                  label: s.name,
                  sub: `${s.passRate}% passed · ${s.students} student${s.students === 1 ? "" : "s"}`,
                  value: s.average,
                  tone: (s.average ?? 0) < 45 ? "bad" : (s.average ?? 0) < 55 ? "warn" : "good",
                  extra:
                    s.change !== null ? (
                      <span className={cn("tabular fs-12.5 font-medium", s.change >= 0 ? "text-success-deep" : "text-danger")}>
                        {s.change > 0 ? "+" : ""}
                        {s.change}
                      </span>
                    ) : null,
                }))}
              />
            </Card>
            <Card className="flex flex-col gap-4 p-5 sm:p-6">
              <div>
                <h2 className="fs-16 font-semibold">The weakest subjects over time</h2>
                <p className="fs-13.5 text-muted">Average score by term.</p>
              </div>
              <LineChart
                caption="Average score by term for the weakest subjects"
                labels={a.trend.map((t) => t.label)}
                series={a.watch.map((s, i) => ({ name: s.name, color: SERIES[i], values: a.trend.map((t) => t.subjects[s.id] ?? null) }))}
              />
              <div>
                <h3 className="mb-2 fs-14 font-semibold">Spread of scores this term</h3>
                <BarList max={Math.max(1, ...a.bands.map((b) => b.n))} unit="" rows={a.bands.map((b, i) => ({ label: b.label, value: b.n, tone: i === 4 ? "bad" : i === 3 ? "warn" : "neutral" }))} />
              </div>
            </Card>
          </div>
          <TableCard title="Class by subject">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-1 text-center fs-13.5">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-canvas px-2 py-1.5 text-left font-medium text-muted">Class</th>
                    {a.bySubject.map((s) => (
                      <th key={s.id} className="px-1 py-1.5 font-medium text-muted" title={s.name}>
                        {s.code || s.name.slice(0, 4)}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 font-medium text-muted">All</th>
                  </tr>
                </thead>
                <tbody>
                  {a.heat.map((row) => (
                    <tr key={row.classId}>
                      <th className="sticky left-0 whitespace-nowrap bg-canvas px-2 py-1.5 text-left font-medium text-ink">{row.className}</th>
                      {row.cells.map((c) => (
                        <td key={c.subjectId} className="tabular rounded-[6px] px-1 py-2 font-medium" style={heatStyle(c.average, lo, hi)} title={`${row.className} · ${a.bySubject.find((s) => s.id === c.subjectId)?.name}: ${c.average ?? "no scores"}`}>
                          {c.average === null ? "—" : Math.round(c.average)}
                        </td>
                      ))}
                      <td className="tabular px-2 py-2 font-semibold text-ink">{row.average === null ? "—" : Math.round(row.average)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 pb-4 fs-12.5 text-muted">Average score out of 100. Shading runs from {lo} (lightest) to {hi} (darkest). Hover a cell for the subject name.</p>
          </TableCard>
        </>
      )}
    </>
  );
}

async function AtRisk({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const r = await getAtRisk(getDb(), access, { termId: sp.term, classId: sp.class, kind: sp.kind });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TermFilter terms={r.terms} />
        <FilterSelect label="Class" param="class" options={r.classOptions.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect label="Reason" param="kind" options={(Object.keys(REASON) as RiskReason["kind"][]).map((k) => ({ value: k, label: REASON[k].label }))} />
      </div>
      <StatGrid>
        <StatCard label="Flagged" value={r.total} icon="alert" tone={r.total ? "danger" : "success"} caption="One or more warning signs" />
        <StatCard label="Low scores" value={r.counts.failing} icon="results" tone="danger" caption={`Average below ${RISK.failing}%`} />
        <StatCard label="Falling" value={r.counts.dropping} icon="trending" tone="warning" caption={`Down ${RISK.drop}+ points on last term`} />
        <StatCard label="Poor attendance" value={r.counts.attendance} icon="calendarCheck" tone="violet" caption={`Below ${RISK.attendance}% this term`} />
      </StatGrid>
      <TableCard title="Students who need attention">
        {r.rows.length === 0 ? (
          <EmptyState icon="checkCircle" title="No one flagged">
            {sp.class || sp.kind ? "Nobody matches these filters." : "No student has low or falling scores or poor attendance this term."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th className="text-right">Average</Th>
                <Th className="text-right">Last term</Th>
                <Th className="text-right">Attendance</Th>
                <Th>Why</Th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((s) => (
                <tr key={s.id} className="hover:bg-paper">
                  <Td>
                    <Link href={`/s/${slug}/students/${s.id}`} className="block font-medium text-ink hover:text-brand-ink">
                      {s.firstName} {s.lastName}
                    </Link>
                    <span className="block fs-13 text-muted">
                      {s.className} · {s.admissionNo}
                    </span>
                  </Td>
                  <Td className={cn("tabular text-right font-semibold", (s.average ?? 100) < RISK.failing ? "text-danger" : "text-ink")}>{s.average === null ? "—" : `${s.average}%`}</Td>
                  <Td className="tabular text-right text-body">{s.previous === null ? "—" : `${s.previous}%`}</Td>
                  <Td className={cn("tabular text-right", (s.attendance ?? 100) < RISK.attendance ? "font-semibold text-danger" : "text-body")}>{s.attendance === null ? "—" : `${s.attendance}%`}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {s.reasons.map((x) => (
                        <Badge key={x.kind} tone={REASON[x.kind].tone} title={x.text}>
                          {x.text}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
      <p className="fs-13 text-muted">
        Flags: average below {RISK.failing}%, down {RISK.drop} or more points on last term, or attendance below {RISK.attendance}% (after five school days). Overdue fees are shown alongside, but don&apos;t flag a student on
        their own.
      </p>
    </>
  );
}

async function Teachers({ access, sp }: { access: Access; sp: SP }) {
  const t = await getTeacherAnalytics(getDb(), access, sp.term);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TermFilter terms={t.terms} />
        {t.weeksSoFar ? <span className="fs-14 text-muted">Week {t.weeksSoFar} of term</span> : null}
      </div>
      <StatGrid>
        <StatCard label="Teachers" value={t.totals.teachers} icon="users" tone="brand" caption="With classes assigned" />
        <StatCard
          label="Score sheets submitted"
          value={`${t.totals.submitted}/${t.totals.sheets}`}
          icon="results"
          tone={t.totals.sheets && t.totals.submitted === t.totals.sheets ? "success" : "warning"}
          caption={t.totals.sheets ? `${Math.round((t.totals.submitted / t.totals.sheets) * 100)}% of subjects taught` : "Nothing assigned"}
        />
        <StatCard label="Lesson notes sent" value={t.totals.notes} icon="book" tone="blue" caption="This term" />
        <StatCard label="Homework set" value={t.totals.assignments} icon="clipboard" tone="violet" caption="This term" />
      </StatGrid>
      <TableCard title="By teacher, least done first">
        {t.rows.length === 0 ? (
          <EmptyState icon="users" title="No teaching assignments yet">
            Assign teachers to subjects in Academics to see their progress here.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Teacher</Th>
                <Th className="w-56">Scores entered</Th>
                <Th className="text-right">Sheets submitted</Th>
                <Th className="text-right">Lesson notes</Th>
                <Th className="text-right">Homework</Th>
                <Th className="text-right">CBT</Th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.membershipId} className="hover:bg-paper">
                  <Td className="font-medium text-ink">{r.name}</Td>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                        <span className={cn("block h-full rounded-full", (r.scoresEntered ?? 0) >= 90 ? "bg-success" : (r.scoresEntered ?? 0) >= 50 ? "bg-warning" : "bg-danger")} style={{ width: `${r.scoresEntered ?? 0}%` }} />
                      </span>
                      <span className="tabular w-11 text-right fs-13.5 text-body">{r.scoresEntered === null ? "—" : `${Math.round(r.scoresEntered)}%`}</span>
                    </div>
                  </Td>
                  <Td className="tabular text-right text-body">
                    <span className={r.submitted === r.sheets ? "font-semibold text-success-deep" : undefined}>
                      {r.submitted}/{r.sheets}
                    </span>
                  </Td>
                  <Td className="tabular text-right text-body">
                    {r.notesSubmitted}
                    {r.notesApproved ? <span className="text-muted"> ({r.notesApproved} approved)</span> : null}
                  </Td>
                  <Td className="tabular text-right text-body">{r.assignments}</Td>
                  <Td className="tabular text-right text-body">{r.exams}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </>
  );
}
