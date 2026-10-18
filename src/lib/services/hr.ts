import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { calendarEvents, leaveRequests, LEAVE_KINDS, membershipRoles, memberships, roles, schools, staffAttendance, users, type HrSettings, type LeaveKind } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { notifyUsers } from "./notify";

/*
 * Staff attendance and leave. Staff clock themselves in and out; anyone not in by the end of
 * a workday shows as absent unless they're on approved leave. Leave is counted in working
 * days against yearly allowances the school sets.
 */

export const LEAVE_LABEL: Record<LeaveKind, string> = {
  annual: "Annual leave",
  sick: "Sick leave",
  casual: "Casual leave",
  maternity: "Maternity leave",
  paternity: "Paternity leave",
  compassionate: "Compassionate leave",
  study: "Study leave",
  unpaid: "Unpaid leave",
};

export const DEFAULT_HR: Required<HrSettings> = {
  resumeAt: "07:30",
  lateAfter: "07:45",
  closeAt: "16:00",
  workDays: [1, 2, 3, 4, 5],
  allowances: { annual: 15, sick: 10, casual: 5, maternity: 84, paternity: 10, compassionate: 5, study: 10, unpaid: 0 },
};

export function hrSettings(s: HrSettings): Required<HrSettings> {
  return { ...DEFAULT_HR, ...s, allowances: { ...DEFAULT_HR.allowances, ...(s.allowances ?? {}) } };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireHr(access: Access) {
  if (!hasFeature(access.plan, "staff_attendance")) throw new AppError("Staff attendance and leave are on the Standard plan.", "upgrade");
  if (!access.isStaff) throw new AppError("This is for staff accounts.", "forbidden");
}

/** "HH:MM" in Lagos for a moment. */
export function lagosClock(d = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

function isoDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Whether staff are expected in: one of the school's working days, and not a holiday on its calendar. */
export async function schoolDay(tx: Tx, s: { workDays: number[] }, day: string) {
  if (!s.workDays.includes(isoDay(day))) return { open: false as const, holiday: null };
  const [h] = await tx
    .select({ title: calendarEvents.title })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.kind, "holiday"), lte(calendarEvents.startsOn, day), gte(calendarEvents.endsOn, day)))
    .limit(1);
  return h ? { open: false as const, holiday: h.title } : { open: true as const, holiday: null };
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthEnd(first: string) {
  const d = new Date(`${first}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/** Working days from start to end inclusive. */
export function workdaysBetween(start: string, end: string, workDays: number[]) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (workDays.includes(isoDay(d))) n++;
  return n;
}

// ---------- Settings ----------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30.");
export const hrSettingsSchema = z
  .object({
    resumeAt: time,
    lateAfter: time,
    closeAt: time,
    workDays: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one workday."),
    allowances: z.partialRecord(z.enum(LEAVE_KINDS), z.number().int().min(0).max(365)),
  })
  .refine((v) => v.lateAfter >= v.resumeAt, { path: ["lateAfter"], message: "Late must be at or after resumption time." })
  .refine((v) => v.closeAt > v.lateAfter, { path: ["closeAt"], message: "Closing time must be after the late time." });

export async function saveHrSettings(db: DB, access: Access, input: z.infer<typeof hrSettingsSchema>, ip?: string | null) {
  requireHr(access);
  if (!can(access, "staff:update") && !can(access, "staff:leave")) throw new AppError("You don't have permission to change staff rules.", "forbidden");
  await db.update(schools).set({ hrSettings: input }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) => recordAudit(tx, access.school.id, actor(access, ip), { action: "hr.settings", summary: `Set staff hours (resume ${input.resumeAt}, late after ${input.lateAfter}) and leave allowances` }));
}

// ---------- Clocking in ----------

async function approvedLeaveOn(tx: Tx, membershipIds: string[], from: string, to = from) {
  if (!membershipIds.length) return [];
  return tx
    .select()
    .from(leaveRequests)
    .where(and(inArray(leaveRequests.membershipId, membershipIds), eq(leaveRequests.status, "approved"), lte(leaveRequests.startsOn, to), gte(leaveRequests.endsOn, from)));
}

export async function clockIn(db: DB, access: Access, now = new Date()) {
  requireHr(access);
  const s = hrSettings(access.school.hrSettings);
  const today = lagosToday(now);
  return withTenant(db, access.school.id, async (tx) => {
    const [existing] = await tx.select().from(staffAttendance).where(and(eq(staffAttendance.membershipId, access.membershipId), eq(staffAttendance.date, today)));
    if (existing?.clockIn) throw new AppError(`You clocked in at ${lagosClock(existing.clockIn)}.`, "conflict");
    const day = await schoolDay(tx, s, today);
    if (!day.open) throw new AppError(day.holiday ? `There's no school today: ${day.holiday}.` : "There's no school today.", "conflict");
    if ((await approvedLeaveOn(tx, [access.membershipId], today)).length) throw new AppError("You're on approved leave today.", "conflict");
    if (lagosClock(now) >= s.closeAt) throw new AppError(`The school day closed at ${s.closeAt}. Ask your manager to mark today if you were in.`, "conflict");
    const status = lagosClock(now) > s.lateAfter ? "late" : "present";
    const [row] = existing
      ? await tx.update(staffAttendance).set({ status, clockIn: now, method: "self", updatedAt: now }).where(eq(staffAttendance.id, existing.id)).returning()
      : await tx.insert(staffAttendance).values({ schoolId: access.school.id, membershipId: access.membershipId, date: today, status, clockIn: now, method: "self" }).returning();
    return row;
  });
}

export async function clockOut(db: DB, access: Access, now = new Date()) {
  requireHr(access);
  const today = lagosToday(now);
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.select().from(staffAttendance).where(and(eq(staffAttendance.membershipId, access.membershipId), eq(staffAttendance.date, today)));
    if (!row?.clockIn) throw new AppError("Clock in first.", "conflict");
    if (row.clockOut) throw new AppError(`You clocked out at ${lagosClock(row.clockOut)}.`, "conflict");
    const [out] = await tx.update(staffAttendance).set({ clockOut: now, updatedAt: now }).where(eq(staffAttendance.id, row.id)).returning();
    return out;
  });
}

/** Leave taken (approved, working days) per kind this calendar year. */
async function leaveUsed(tx: Tx, membershipId: string, year: number) {
  const rows = await tx
    .select({ kind: leaveRequests.kind, days: sql<number>`sum(${leaveRequests.days})`.mapWith(Number) })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.membershipId, membershipId), inArray(leaveRequests.status, ["approved", "pending"]), gte(leaveRequests.startsOn, `${year}-01-01`), lte(leaveRequests.startsOn, `${year}-12-31`)))
    .groupBy(leaveRequests.kind);
  return Object.fromEntries(rows.map((r) => [r.kind, r.days])) as Partial<Record<LeaveKind, number>>;
}

/** A staff member's own day: clock state, this month, leave and balances. */
export async function getMyDay(db: DB, access: Access, now = new Date()) {
  requireHr(access);
  const s = hrSettings(access.school.hrSettings);
  const today = lagosToday(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  return withTenant(db, access.school.id, async (tx) => {
    const day = await schoolDay(tx, s, today);
    const [[todayRow], month, requests, onLeave, used] = await Promise.all([
      tx.select().from(staffAttendance).where(and(eq(staffAttendance.membershipId, access.membershipId), eq(staffAttendance.date, today))),
      tx.select().from(staffAttendance).where(and(eq(staffAttendance.membershipId, access.membershipId), gte(staffAttendance.date, monthStart))).orderBy(desc(staffAttendance.date)),
      tx.select().from(leaveRequests).where(eq(leaveRequests.membershipId, access.membershipId)).orderBy(desc(leaveRequests.startsOn)).limit(20),
      approvedLeaveOn(tx, [access.membershipId], today),
      leaveUsed(tx, access.membershipId, Number(today.slice(0, 4))),
    ]);
    return {
      today,
      settings: s,
      workday: day.open,
      holiday: day.holiday,
      closed: lagosClock(now) >= s.closeAt,
      record: todayRow ?? null,
      onLeave: onLeave[0] ?? null,
      month: { present: month.filter((m) => m.status === "present").length, late: month.filter((m) => m.status === "late").length, absent: month.filter((m) => m.status === "absent").length, days: month },
      requests,
      balances: LEAVE_KINDS.map((k) => ({ kind: k, label: LEAVE_LABEL[k], allowance: s.allowances[k] ?? 0, used: used[k] ?? 0 })),
    };
  });
}

// ---------- Leave ----------

export const leaveSchema = z
  .object({
    kind: z.enum(LEAVE_KINDS),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first day."),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day."),
    reason: z.string().trim().max(1000).default(""),
  })
  .refine((v) => v.endsOn >= v.startsOn, { path: ["endsOn"], message: "The last day can't be before the first." });

/** People who approve leave: owners, principals and school admins (or custom roles with the permission). */
async function approverUserIds(tx: Tx, exceptMembershipId: string) {
  const rows = await tx
    .select({ userId: memberships.userId, membershipId: memberships.id, key: roles.key, isSystem: roles.isSystem, permissions: roles.permissions })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.status, "active"), ne(memberships.id, exceptMembershipId)));
  return [...new Set(rows.filter((r) => (r.isSystem ? ["owner", "principal", "admin"].includes(r.key) : r.permissions.includes("staff:leave"))).map((r) => r.userId))];
}

export async function requestLeave(db: DB, access: Access, input: z.infer<typeof leaveSchema>, ip?: string | null) {
  requireHr(access);
  const s = hrSettings(access.school.hrSettings);
  const days = workdaysBetween(input.startsOn, input.endsOn, s.workDays);
  if (days === 0) throw new AppError("Those dates don't include any workdays.", "invalid");
  if (input.startsOn.slice(0, 4) !== input.endsOn.slice(0, 4)) throw new AppError("Split leave that runs into the new year into two requests.", "invalid");
  return withTenant(db, access.school.id, async (tx) => {
    const [clash] = await tx
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.membershipId, access.membershipId), inArray(leaveRequests.status, ["pending", "approved"]), lte(leaveRequests.startsOn, input.endsOn), gte(leaveRequests.endsOn, input.startsOn)));
    if (clash) throw new AppError("You already have leave booked on some of those days.", "conflict");
    const allowance = s.allowances[input.kind] ?? 0;
    if (input.kind !== "unpaid" && allowance > 0) {
      const used = (await leaveUsed(tx, access.membershipId, Number(input.startsOn.slice(0, 4))))[input.kind] ?? 0;
      if (used + days > allowance) throw new AppError(`That's ${days} day${days === 1 ? "" : "s"}, but you have ${Math.max(0, allowance - used)} ${LEAVE_LABEL[input.kind].toLowerCase()} day${allowance - used === 1 ? "" : "s"} left this year.`, "invalid");
    }
    const [row] = await tx.insert(leaveRequests).values({ schoolId: access.school.id, membershipId: access.membershipId, kind: input.kind, startsOn: input.startsOn, endsOn: input.endsOn, days, reason: input.reason }).returning();
    await notifyUsers(tx, access.school.id, await approverUserIds(tx, access.membershipId), {
      kind: "leave",
      title: `${access.user.name} asked for ${days} day${days === 1 ? "" : "s"} of ${LEAVE_LABEL[input.kind].toLowerCase()}`,
      body: input.reason || `${input.startsOn} to ${input.endsOn}`,
      link: `/s/${access.school.slug}/hr?tab=leave`,
      ref: `leave:${row.id}`,
    });
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "leave.requested", summary: `Asked for ${days} day(s) of ${LEAVE_LABEL[input.kind].toLowerCase()} from ${input.startsOn}`, entityType: "leave", entityId: row.id });
    return row;
  });
}

export async function cancelLeave(db: DB, access: Access, id: string) {
  requireHr(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [r] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id));
    if (!r || r.membershipId !== access.membershipId) throw new AppError("That request wasn't found.", "not_found");
    if (r.status === "rejected" || r.status === "cancelled") throw new AppError("This request is already closed.", "conflict");
    if (r.status === "approved" && r.startsOn <= lagosToday()) throw new AppError("This leave has started. Ask your manager to change it.", "conflict");
    await tx.update(leaveRequests).set({ status: "cancelled" }).where(eq(leaveRequests.id, id));
  });
}

export const decisionSchema = z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().trim().max(500).default("") });

export async function decideLeave(db: DB, access: Access, input: z.infer<typeof decisionSchema>, ip?: string | null) {
  requireHr(access);
  requirePermission(access, "staff:leave");
  await withTenant(db, access.school.id, async (tx) => {
    const [r] = await tx
      .select({ r: leaveRequests, userId: memberships.userId, name: users.name })
      .from(leaveRequests)
      .innerJoin(memberships, eq(memberships.id, leaveRequests.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(leaveRequests.id, input.id));
    if (!r) throw new AppError("That request wasn't found.", "not_found");
    if (r.r.membershipId === access.membershipId && !access.roles.some((x) => x.key === "owner")) throw new AppError("Someone else has to decide your own leave.", "forbidden");
    if (r.r.status !== "pending") throw new AppError("This request has already been decided.", "conflict");
    if (!input.approve && !input.note) throw new AppError("Tell them why.", "invalid");
    await tx.update(leaveRequests).set({ status: input.approve ? "approved" : "rejected", decidedBy: access.membershipId, decidedAt: new Date(), decisionNote: input.note || null }).where(eq(leaveRequests.id, input.id));
    await notifyUsers(tx, access.school.id, [r.userId], {
      kind: "leave",
      title: `Your ${LEAVE_LABEL[r.r.kind].toLowerCase()} was ${input.approve ? "approved" : "declined"}`,
      body: input.note || `${r.r.startsOn} to ${r.r.endsOn}`,
      link: `/s/${access.school.slug}/hr`,
      ref: `leave-decided:${input.id}`,
    });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.approve ? "leave.approved" : "leave.rejected",
      summary: `${input.approve ? "Approved" : "Declined"} ${r.name}'s ${LEAVE_LABEL[r.r.kind].toLowerCase()} (${r.r.days} day${r.r.days === 1 ? "" : "s"})`,
      entityType: "leave",
      entityId: input.id,
    });
  });
}

export async function listLeave(db: DB, access: Access, filter: { status?: string } = {}) {
  requireHr(access);
  requirePermission(access, "staff:leave");
  const today = lagosToday();
  return withTenant(db, access.school.id, async (tx) => {
    const where = filter.status === "all" ? undefined : filter.status && ["approved", "rejected", "cancelled"].includes(filter.status) ? eq(leaveRequests.status, filter.status as "approved") : eq(leaveRequests.status, "pending");
    const [rows, away, [counts]] = await Promise.all([
      tx
        .select({ r: leaveRequests, name: users.name, jobTitle: memberships.jobTitle })
        .from(leaveRequests)
        .innerJoin(memberships, eq(memberships.id, leaveRequests.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(where)
        .orderBy(filter.status && filter.status !== "pending" ? desc(leaveRequests.startsOn) : asc(leaveRequests.startsOn))
        .limit(100),
      tx
        .select({ r: leaveRequests, name: users.name })
        .from(leaveRequests)
        .innerJoin(memberships, eq(memberships.id, leaveRequests.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(leaveRequests.status, "approved"), lte(leaveRequests.startsOn, addDays(today, 14)), gte(leaveRequests.endsOn, today)))
        .orderBy(asc(leaveRequests.startsOn)),
      tx
        .select({
          pending: sql<number>`count(*) filter (where ${leaveRequests.status} = 'pending')`.mapWith(Number),
          approvedDays: sql<number>`coalesce(sum(${leaveRequests.days}) filter (where ${leaveRequests.status} = 'approved' and ${leaveRequests.startsOn} >= ${`${today.slice(0, 4)}-01-01`}), 0)`.mapWith(Number),
        })
        .from(leaveRequests),
    ]);
    return { rows, away, counts, today };
  });
}

// ---------- Register and summaries ----------

async function staffList(tx: Tx) {
  const rows = await tx
    .select({ membershipId: memberships.id, name: users.name, jobTitle: memberships.jobTitle, role: roles.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff")));
  // One row per person; their title, or their roles when no title is set.
  const by = new Map<string, { membershipId: string; name: string; jobTitle: string }>();
  for (const r of rows) {
    const e = by.get(r.membershipId);
    if (!e) by.set(r.membershipId, { membershipId: r.membershipId, name: r.name, jobTitle: r.jobTitle ?? r.role });
    else if (!r.jobTitle && !e.jobTitle.includes(r.role)) e.jobTitle = `${e.jobTitle}, ${r.role}`;
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type DayStatus = "present" | "late" | "absent" | "leave" | "not_in" | "off";

/** Everyone's status on a day, filling in leave and (once the day is over) absence. */
export async function getRegister(db: DB, access: Access, date?: string, now = new Date()) {
  requireHr(access);
  requirePermission(access, "staff:attendance");
  const s = hrSettings(access.school.hrSettings);
  const today = lagosToday(now);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;
  const dayOver = day < today || lagosClock(now) >= s.closeAt;
  return withTenant(db, access.school.id, async (tx) => {
    const { open: workday, holiday } = await schoolDay(tx, s, day);
    const staff = await staffList(tx);
    const ids = staff.map((x) => x.membershipId);
    const [records, leave] = await Promise.all([
      ids.length ? tx.select().from(staffAttendance).where(and(eq(staffAttendance.date, day), inArray(staffAttendance.membershipId, ids))) : Promise.resolve([]),
      approvedLeaveOn(tx, ids, day),
    ]);
    const rows = staff.map((x) => {
      const rec = records.find((r) => r.membershipId === x.membershipId) ?? null;
      const lv = leave.find((l) => l.membershipId === x.membershipId) ?? null;
      const status: DayStatus = rec ? rec.status : lv ? "leave" : !workday ? "off" : dayOver ? "absent" : "not_in";
      return { ...x, record: rec, leave: lv, status };
    });
    const tally = (k: DayStatus) => rows.filter((r) => r.status === k).length;
    return { day, today, workday, holiday, dayOver, settings: s, rows, counts: { present: tally("present"), late: tally("late"), absent: tally("absent"), leave: tally("leave"), notIn: tally("not_in") } };
  });
}

export const markSchema = z.object({
  membershipId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["present", "late", "absent", "leave"]),
  note: z.string().trim().max(300).default(""),
});

export async function markStaff(db: DB, access: Access, input: z.infer<typeof markSchema>, ip?: string | null) {
  requireHr(access);
  requirePermission(access, "staff:attendance");
  if (input.date > lagosToday()) throw new AppError("You can't mark a day that hasn't happened.", "invalid");
  await withTenant(db, access.school.id, async (tx) => {
    const [m] = await tx.select({ name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.id, input.membershipId));
    if (!m) throw new AppError("That staff member wasn't found.", "not_found");
    await tx
      .insert(staffAttendance)
      .values({ schoolId: access.school.id, membershipId: input.membershipId, date: input.date, status: input.status, method: "manager", note: input.note || null, recordedBy: access.membershipId })
      .onConflictDoUpdate({
        target: [staffAttendance.membershipId, staffAttendance.date],
        set: { status: input.status, note: input.note || null, recordedBy: access.membershipId, method: "manager", updatedAt: new Date() },
      });
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "staff_attendance.marked", summary: `Marked ${m.name} ${input.status} on ${input.date}`, entityType: "membership", entityId: input.membershipId });
  });
}

/** A month per staff member: days present, late, absent (marked or missed), on leave, and usual arrival time. */
export async function getMonthSummary(db: DB, access: Access, month?: string, now = new Date()) {
  requireHr(access);
  requirePermission(access, "staff:attendance");
  const s = hrSettings(access.school.hrSettings);
  const today = lagosToday(now);
  const m = month && /^\d{4}-\d{2}$/.test(month) && month <= today.slice(0, 7) ? month : today.slice(0, 7);
  const first = `${m}-01`;
  const last = monthEnd(first);
  // Days that count: workdays up to yesterday, plus today once it's closed.
  const countUntil = last < today ? last : lagosClock(now) >= s.closeAt ? today : addDays(today, -1);
  return withTenant(db, access.school.id, async (tx) => {
    const staff = await staffList(tx);
    const ids = staff.map((x) => x.membershipId);
    const [records, leave] = await Promise.all([
      ids.length ? tx.select().from(staffAttendance).where(and(inArray(staffAttendance.membershipId, ids), gte(staffAttendance.date, first), lte(staffAttendance.date, last))) : Promise.resolve([]),
      approvedLeaveOn(tx, ids, first, last),
    ]);
    const workdays: string[] = [];
    for (let d = first; d <= countUntil && d <= last; d = addDays(d, 1)) if (s.workDays.includes(isoDay(d))) workdays.push(d);
    const rows = staff.map((x) => {
      const mine = records.filter((r) => r.membershipId === x.membershipId);
      const myLeave = leave.filter((l) => l.membershipId === x.membershipId);
      let present = 0;
      let late = 0;
      let absent = 0;
      let onLeave = 0;
      for (const d of workdays) {
        const rec = mine.find((r) => r.date === d);
        const lv = myLeave.some((l) => l.startsOn <= d && l.endsOn >= d);
        const st = rec?.status ?? (lv ? "leave" : "absent");
        if (st === "present") present++;
        else if (st === "late") late++;
        else if (st === "leave") onLeave++;
        else absent++;
      }
      const ins = mine.filter((r) => r.clockIn).map((r) => {
        const [h, mm] = lagosClock(r.clockIn!).split(":").map(Number);
        return h * 60 + mm;
      });
      const avg = ins.length ? Math.round(ins.reduce((a, b) => a + b, 0) / ins.length) : null;
      return {
        ...x,
        present,
        late,
        absent,
        leave: onLeave,
        rate: workdays.length ? Math.round(((present + late) / Math.max(1, workdays.length - onLeave)) * 100) : null,
        usualArrival: avg === null ? null : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`,
      };
    });
    return { month: m, workdays: workdays.length, rows, settings: s };
  });
}

/** Pending leave for the sidebar badge. */
export async function pendingLeaveCount(tx: Tx) {
  const [{ n }] = await tx.select({ n: count() }).from(leaveRequests).where(eq(leaveRequests.status, "pending"));
  return n;
}

