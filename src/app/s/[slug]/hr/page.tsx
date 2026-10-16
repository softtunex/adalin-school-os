import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { buttonClass } from "@/components/ui/button-styles";
import { ToolbarLink } from "@/components/ui/data";
import { Avatar, Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th, type Tone } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";
import { getMonthSummary, getMyDay, getRegister, lagosClock, LEAVE_LABEL, listLeave, type DayStatus } from "@/lib/services/hr";
import { CancelLeave, ClockCard, LeaveDecision, MarkDay, RequestLeaveButton } from "./hr-client";
import { formatNaira } from "@/lib/money";
import { monthLabel, myPayslips } from "@/lib/services/payroll";

export const metadata: Metadata = { title: "Attendance and leave" };

type SP = { tab?: string; date?: string; month?: string; status?: string };

const DAY: Record<DayStatus, { label: string; tone: Tone }> = {
  present: { label: "Present", tone: "success" },
  late: { label: "Late", tone: "warning" },
  absent: { label: "Absent", tone: "danger" },
  leave: { label: "On leave", tone: "blue" },
  not_in: { label: "Not in yet", tone: "neutral" },
  off: { label: "Day off", tone: "neutral" },
};
const LEAVE_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function day(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { ...opts, timeZone: "UTC" });
}

function range(a: string, b: string) {
  return a === b ? day(a) : `${day(a)} to ${day(b)}`;
}

export default async function HrPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.isStaff) notFound();
  if (!hasFeature(access.plan, "staff_attendance")) {
    return (
      <>
        <Topbar title="Attendance and leave" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="staff_attendance" text="Staff clock in from their phones, lateness is recorded automatically, and leave requests come to you for approval with balances worked out." />
        </PageBody>
      </>
    );
  }
  const manager = can(access, "staff:attendance");
  const approver = can(access, "staff:leave");
  const pay = hasFeature(access.plan, "payroll");
  const tab = sp.tab === "register" && manager ? "register" : sp.tab === "month" && manager ? "month" : sp.tab === "leave" && approver ? "leave" : sp.tab === "pay" && pay ? "pay" : "me";
  const base = `/s/${slug}/hr`;
  return (
    <>
      <Topbar title="Attendance and leave" context={access.school.name} />
      <PageBody>
        {manager || approver || pay ? (
          <Tabs
            current={tab}
            tabs={[
              { key: "me", label: "My day", href: base },
              ...(pay ? [{ key: "pay", label: "My payslips", href: `${base}?tab=pay` }] : []),
              ...(manager ? [{ key: "register", label: "Today's register", href: `${base}?tab=register` }] : []),
              ...(manager ? [{ key: "month", label: "Monthly", href: `${base}?tab=month` }] : []),
              ...(approver ? [{ key: "leave", label: "Leave requests", href: `${base}?tab=leave` }] : []),
            ]}
          />
        ) : null}
        {tab === "pay" ? <MyPay slug={slug} access={access} /> : tab === "register" ? <Register slug={slug} access={access} date={sp.date} /> : tab === "month" ? <Month slug={slug} access={access} month={sp.month} /> : tab === "leave" ? <Leave slug={slug} access={access} status={sp.status} /> : <MyDay slug={slug} access={access} />}
      </PageBody>
    </>
  );
}

async function MyDay({ slug, access }: { slug: string; access: Access }) {
  const d = await getMyDay(getDb(), access);
  return (
    <>
      <ClockCard
        slug={slug}
        clockedIn={d.record?.clockIn ? lagosClock(d.record.clockIn) : null}
        clockedOut={d.record?.clockOut ? lagosClock(d.record.clockOut) : null}
        status={d.record?.status ?? null}
        onLeave={d.onLeave ? LEAVE_LABEL[d.onLeave.kind] : null}
        workday={d.workday}
            closed={d.closed}
        resumeAt={d.settings.resumeAt}
      />
      <StatGrid>
        <StatCard label="On time this month" value={d.month.present} icon="checkCircle" tone="success" caption={`School resumes ${d.settings.resumeAt}`} />
        <StatCard label="Late this month" value={d.month.late} icon="clock" tone={d.month.late ? "warning" : "success"} caption={`After ${d.settings.lateAfter}`} />
        <StatCard label="Absent this month" value={d.month.absent} icon="alert" tone={d.month.absent ? "danger" : "success"} caption="Marked by the school" />
        <StatCard
          label="Annual leave left"
          value={(() => {
            const a = d.balances.find((b) => b.kind === "annual")!;
            return Math.max(0, a.allowance - a.used);
          })()}
          icon="calendar"
          tone="blue"
          caption={`Of ${d.balances.find((b) => b.kind === "annual")!.allowance} days this year`}
        />
      </StatGrid>
      <TableCard
        title="My leave"
        toolbar={<RequestLeaveButton slug={slug} today={d.today} kinds={d.balances.map((b) => ({ kind: b.kind, label: b.label, left: b.kind === "unpaid" || b.allowance === 0 ? null : Math.max(0, b.allowance - b.used) }))} />}
      >
        {d.requests.length === 0 ? (
          <EmptyState icon="calendar" title="No leave requested">
            Ask for leave here. Your manager is told straight away, and you see the answer on this page.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Leave</Th>
                <Th>Dates</Th>
                <Th className="text-right">Days</Th>
                <Th>Status</Th>
                <Th className="w-24">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {d.requests.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <span className="block font-medium text-ink">{LEAVE_LABEL[r.kind]}</span>
                    {r.decisionNote ? <span className="block fs-13 text-muted">&ldquo;{r.decisionNote}&rdquo;</span> : r.reason ? <span className="block fs-13 text-muted">{r.reason}</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-body">{range(r.startsOn, r.endsOn)}</Td>
                  <Td className="tabular text-right text-body">{r.days}</Td>
                  <Td>
                    <Badge tone={LEAVE_STATUS[r.status].tone} dot>
                      {LEAVE_STATUS[r.status].label}
                    </Badge>
                  </Td>
                  <Td className="text-right">{r.status === "pending" || (r.status === "approved" && r.startsOn > d.today) ? <CancelLeave slug={slug} id={r.id} /> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
      <Card className="p-5">
        <h2 className="fs-15 font-semibold">Leave balances this year</h2>
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          {d.balances
            .filter((b) => b.allowance > 0)
            .map((b) => (
              <li key={b.kind} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 fs-14">
                <span className="text-body">{b.label}</span>
                <span className="tabular font-semibold text-ink">
                  {Math.max(0, b.allowance - b.used)}
                  <span className="font-normal text-muted"> / {b.allowance}</span>
                </span>
              </li>
            ))}
        </ul>
      </Card>
    </>
  );
}

async function MyPay({ slug, access }: { slug: string; access: Access }) {
  const slips = await myPayslips(getDb(), access);
  return (
    <TableCard title="My payslips">
      {slips.length === 0 ? (
        <EmptyState icon="banknote" title="No payslips yet">
          Your payslip appears here each month once the payroll is approved.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th className="text-right">Gross</Th>
              <Th className="text-right">Deductions</Th>
              <Th className="text-right">Take-home</Th>
              <Th className="w-28">
                <span className="sr-only">Download</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {slips.map(({ slip, month }) => (
              <tr key={slip.id} className="hover:bg-paper">
                <Td className="font-medium text-ink">{monthLabel(month)}</Td>
                <Td className="tabular text-right text-body">{formatNaira(slip.grossKobo)}</Td>
                <Td className="tabular text-right text-body">{formatNaira(slip.grossKobo - slip.netKobo)}</Td>
                <Td className="tabular text-right font-semibold text-ink">{formatNaira(slip.netKobo)}</Td>
                <Td className="text-right">
                  <a href={`/s/${slug}/payslips/${slip.id}`} target="_blank" rel="noopener" className="fs-14 font-semibold text-brand-ink hover:underline">
                    Payslip
                  </a>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}

async function Register({ slug, access, date }: { slug: string; access: Access; date?: string }) {
  const r = await getRegister(getDb(), access, date);
  return (
    <>
      <form className="flex flex-wrap items-center gap-2" action={`/s/${slug}/hr`}>
        <input type="hidden" name="tab" value="register" />
        <label className="flex h-10 items-center gap-2 rounded-chunk border border-line-strong bg-canvas pl-3 fs-14">
          <span className="text-muted">Day</span>
          <input type="date" name="date" defaultValue={r.day} max={r.today} className="h-full bg-transparent pr-2 font-medium text-ink focus:outline-none" />
        </label>
        <button className={buttonClass("secondary", "sm")}>Show</button>
        <span className="fs-14 text-muted">
          {day(r.day, { weekday: "long", day: "numeric", month: "long" })}
          {!r.workday ? " · not a workday" : ""}
        </span>
      </form>
      <StatGrid>
        <StatCard label="In on time" value={r.counts.present} icon="checkCircle" tone="success" caption={`By ${r.settings.lateAfter}`} />
        <StatCard label="Late" value={r.counts.late} icon="clock" tone={r.counts.late ? "warning" : "success"} caption={`After ${r.settings.lateAfter}`} />
        <StatCard
          label={r.dayOver ? "Absent" : "Not in yet"}
          value={r.dayOver ? r.counts.absent : r.counts.notIn}
          icon="alert"
          tone={(r.dayOver ? r.counts.absent : r.counts.notIn) ? "danger" : "success"}
          caption={r.dayOver ? "No clock-in, not on leave" : `Closes ${r.settings.closeAt}`}
        />
        <StatCard label="On leave" value={r.counts.leave} icon="calendar" tone="blue" caption="Approved leave" />
      </StatGrid>
      <TableCard title={`Staff (${r.rows.length})`}>
        {r.rows.length === 0 ? (
          <EmptyState icon="users" title="No staff yet">
            Invite staff from the Staff page.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Staff</Th>
                <Th>In</Th>
                <Th>Out</Th>
                <Th>Status</Th>
                <Th className="w-40 text-right">Change</Th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.membershipId} className="hover:bg-paper">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={x.name} size={34} />
                      <span>
                        <span className="block font-medium text-ink">{x.name}</span>
                        <span className="block fs-13 text-muted">{x.jobTitle}</span>
                      </span>
                    </div>
                  </Td>
                  <Td className="tabular text-body">{x.record?.clockIn ? lagosClock(x.record.clockIn) : "—"}</Td>
                  <Td className="tabular text-body">{x.record?.clockOut ? lagosClock(x.record.clockOut) : "—"}</Td>
                  <Td>
                    <Badge tone={DAY[x.status].tone} dot>
                      {x.status === "leave" && x.leave ? LEAVE_LABEL[x.leave.kind] : DAY[x.status].label}
                    </Badge>
                    {x.record?.method === "manager" ? <span className="ml-2 fs-12.5 text-muted">set by manager</span> : null}
                  </Td>
                  <Td>
                    <MarkDay slug={slug} membershipId={x.membershipId} date={r.day} status={x.record?.status ?? ""} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </>
  );
}

async function Month({ slug, access, month }: { slug: string; access: Access; month?: string }) {
  const m = await getMonthSummary(getDb(), access, month);
  const label = new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <form className="flex flex-wrap items-center gap-2" action={`/s/${slug}/hr`}>
        <input type="hidden" name="tab" value="month" />
        <label className="flex h-10 items-center gap-2 rounded-chunk border border-line-strong bg-canvas pl-3 fs-14">
          <span className="text-muted">Month</span>
          <input type="month" name="month" defaultValue={m.month} className="h-full bg-transparent pr-2 font-medium text-ink focus:outline-none" />
        </label>
        <button className={buttonClass("secondary", "sm")}>Show</button>
        <span className="fs-14 text-muted">
          {label} · {m.workdays} workday{m.workdays === 1 ? "" : "s"} so far
        </span>
      </form>
      <TableCard
        title="Attendance by staff member"
        toolbar={
          <ToolbarLink href={`/s/${slug}/hr/export?month=${m.month}`} icon="download">
            Export
          </ToolbarLink>
        }
      >
        {m.rows.length === 0 ? (
          <EmptyState icon="users" title="No staff yet">
            Invite staff from the Staff page.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Staff</Th>
                <Th className="text-right">On time</Th>
                <Th className="text-right">Late</Th>
                <Th className="text-right">Absent</Th>
                <Th className="text-right">Leave</Th>
                <Th className="text-right">Attendance</Th>
                <Th className="text-right">Usually in</Th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((x) => (
                <tr key={x.membershipId} className="hover:bg-paper">
                  <Td>
                    <span className="block font-medium text-ink">{x.name}</span>
                    <span className="block fs-13 text-muted">{x.jobTitle}</span>
                  </Td>
                  <Td className="tabular text-right text-body">{x.present}</Td>
                  <Td className={`tabular text-right ${x.late ? "font-semibold text-warning-deep" : "text-body"}`}>{x.late}</Td>
                  <Td className={`tabular text-right ${x.absent ? "font-semibold text-danger" : "text-body"}`}>{x.absent}</Td>
                  <Td className="tabular text-right text-body">{x.leave}</Td>
                  <Td className="tabular text-right font-semibold text-ink">{x.rate === null ? "—" : `${x.rate}%`}</Td>
                  <Td className="tabular text-right text-body">{x.usualArrival ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
      <p className="fs-13 text-muted">A workday with no clock-in, no manager mark and no approved leave counts as absent. Change any day from Today&apos;s register.</p>
    </>
  );
}

async function Leave({ slug, access, status }: { slug: string; access: Access; status?: string }) {
  const l = await listLeave(getDb(), access, { status });
  const base = `/s/${slug}/hr?tab=leave`;
  const current = status ?? "pending";
  return (
    <>
      <StatGrid>
        <StatCard label="Waiting for you" value={l.counts.pending} icon="clock" tone={l.counts.pending ? "warning" : "success"} caption={l.counts.pending ? "Oldest first" : "All decided"} />
        <StatCard label="Away now or soon" value={l.away.length} icon="calendar" tone="blue" caption="Next two weeks" />
        <StatCard label="Leave taken this year" value={l.counts.approvedDays} icon="checkCircle" tone="violet" caption="Approved working days" />
        <StatCard label="Staff on leave today" value={l.away.filter((a) => a.r.startsOn <= l.today).length} icon="users" tone="brand" caption={day(l.today, { weekday: "long", day: "numeric", month: "short" })} />
      </StatGrid>
      {l.away.length ? (
        <Card className="p-5">
          <h2 className="fs-15 font-semibold">Who&apos;s away</h2>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {l.away.map((a) => (
              <li key={a.r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 fs-14.5">
                <span className="font-medium text-ink">{a.name}</span>
                <span className="text-body">
                  {LEAVE_LABEL[a.r.kind]} · {range(a.r.startsOn, a.r.endsOn)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {[
          ["pending", "Waiting"],
          ["approved", "Approved"],
          ["rejected", "Declined"],
          ["all", "All"],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={k === "pending" ? base : `${base}&status=${k}`}
            className={`inline-flex h-9 items-center rounded-full border px-3.5 fs-13.5 font-medium ${current === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong bg-canvas text-body hover:bg-paper"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <TableCard title="Leave requests">
        {l.rows.length === 0 ? (
          <EmptyState icon="calendar" title={current === "pending" ? "Nothing waiting" : "No requests here"}>
            {current === "pending" ? "Leave requests from staff appear here for you to approve." : "Try another filter."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Staff</Th>
                <Th>Leave</Th>
                <Th>Dates</Th>
                <Th className="text-right">Days</Th>
                <Th className="text-right">{current === "pending" ? "Decide" : "Status"}</Th>
              </tr>
            </thead>
            <tbody>
              {l.rows.map((x) => (
                <tr key={x.r.id} className="hover:bg-paper">
                  <Td>
                    <span className="block font-medium text-ink">{x.name}</span>
                    <span className="block fs-13 text-muted">{x.jobTitle}</span>
                  </Td>
                  <Td>
                    <span className="block text-ink">{LEAVE_LABEL[x.r.kind]}</span>
                    {x.r.reason ? <span className="block max-w-[40ch] fs-13 text-muted">{x.r.reason}</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-body">{range(x.r.startsOn, x.r.endsOn)}</Td>
                  <Td className="tabular text-right text-body">{x.r.days}</Td>
                  <Td className="text-right">
                    {x.r.status === "pending" && x.r.membershipId !== access.membershipId ? (
                      <LeaveDecision slug={slug} id={x.r.id} name={x.name} />
                    ) : (
                      <Badge tone={LEAVE_STATUS[x.r.status].tone} dot>
                        {LEAVE_STATUS[x.r.status].label}
                      </Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </>
  );
}

