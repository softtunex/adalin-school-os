import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import {
  bellPeriods,
  bellSchedules,
  classes,
  classLevels,
  levelSchedules,
  levelSubjects,
  membershipRoles,
  memberships,
  PERIOD_KINDS,
  roles,
  subjects,
  teacherAssignments,
  timetableSlots,
  users,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { pickTerm } from "./fees";

const actor = (access: Access, ip?: string | null) => ({ userId: access.user.id, name: access.user.name, ip });

export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** A typical Nigerian secondary school day, used the first time a school opens the timetable. */
const DEFAULT_PERIODS: { label: string; startsAt: string; endsAt: string; kind: (typeof PERIOD_KINDS)[number] }[] = [
  { label: "Assembly", startsAt: "07:45", endsAt: "08:00", kind: "assembly" },
  { label: "1", startsAt: "08:00", endsAt: "08:40", kind: "lesson" },
  { label: "2", startsAt: "08:40", endsAt: "09:20", kind: "lesson" },
  { label: "3", startsAt: "09:20", endsAt: "10:00", kind: "lesson" },
  { label: "Short break", startsAt: "10:00", endsAt: "10:20", kind: "break" },
  { label: "4", startsAt: "10:20", endsAt: "11:00", kind: "lesson" },
  { label: "5", startsAt: "11:00", endsAt: "11:40", kind: "lesson" },
  { label: "6", startsAt: "11:40", endsAt: "12:20", kind: "lesson" },
  { label: "Long break", startsAt: "12:20", endsAt: "13:00", kind: "break" },
  { label: "7", startsAt: "13:00", endsAt: "13:40", kind: "lesson" },
  { label: "8", startsAt: "13:40", endsAt: "14:20", kind: "lesson" },
];

export async function ensureDefaultSchedule(tx: Tx, schoolId: string) {
  const [existing] = await tx.select().from(bellSchedules).limit(1);
  if (existing) return;
  const [schedule] = await tx.insert(bellSchedules).values({ schoolId, name: "School day", isDefault: true }).returning();
  await tx.insert(bellPeriods).values(DEFAULT_PERIODS.map((p, i) => ({ schoolId, scheduleId: schedule.id, ...p, sort: i })));
}

async function loadSchedules(tx: Tx) {
  const [schedules, periods, assigned] = await Promise.all([
    tx.select().from(bellSchedules).orderBy(asc(bellSchedules.createdAt)),
    tx.select().from(bellPeriods).orderBy(asc(bellPeriods.sort)),
    tx.select().from(levelSchedules),
  ]);
  return {
    schedules: schedules.map((s) => ({ ...s, periods: periods.filter((p) => p.scheduleId === s.id) })),
    levelSchedule: new Map(assigned.map((a) => [a.levelId, a.scheduleId])),
  };
}

/** The schedule a class follows: its level's, else the default. */
async function scheduleForClass(tx: Tx, classId: string) {
  const [cls] = await tx.select({ id: classes.id, name: classes.name, levelId: classes.levelId }).from(classes).where(eq(classes.id, classId));
  if (!cls) throw new AppError("That class wasn't found.", "not_found");
  const { schedules, levelSchedule } = await loadSchedules(tx);
  const schedule = schedules.find((s) => s.id === levelSchedule.get(cls.levelId)) ?? schedules.find((s) => s.isDefault) ?? schedules[0];
  return { cls, schedule };
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => minutes(a.startsAt) < minutes(b.endsAt) && minutes(b.startsAt) < minutes(a.endsAt);

// ---------- Setup ----------

export async function getTimetableSetup(db: DB, access: Access) {
  requireFeature(access.plan, "timetable");
  return withTenant(db, access.school.id, async (tx) => {
    await ensureDefaultSchedule(tx, access.school.id);
    const { schedules, levelSchedule } = await loadSchedules(tx);
    const levels = await tx.select({ id: classLevels.id, name: classLevels.name }).from(classLevels).orderBy(asc(classLevels.sort));
    return { schedules, levels: levels.map((l) => ({ ...l, scheduleId: levelSchedule.get(l.id) ?? null })) };
  });
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use times like 08:00.");

export const scheduleSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, "Name the schedule.").max(60),
    days: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one day."),
    periods: z
      .array(z.object({ id: z.string().uuid().optional(), label: z.string().trim().min(1, "Label every period.").max(30), startsAt: time, endsAt: time, kind: z.enum(PERIOD_KINDS) }))
      .min(1, "Add at least one period.")
      .max(20),
  })
  .refine((v) => v.periods.every((p) => p.startsAt < p.endsAt), { message: "Each period must end after it starts.", path: ["periods"] })
  .refine(
    (v) => {
      const sorted = [...v.periods].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return sorted.every((p, i) => i === 0 || sorted[i - 1].endsAt <= p.startsAt);
    },
    { message: "Two periods overlap. Check the times.", path: ["periods"] },
  );

/** Saves a bell schedule. Periods keep their lessons when edited; removed periods drop theirs. */
export async function saveSchedule(db: DB, access: Access, input: z.infer<typeof scheduleSchema>, ip?: string | null) {
  requirePermission(access, "teaching:timetable");
  requireFeature(access.plan, "timetable");
  return withTenant(db, access.school.id, async (tx) => {
    const [clash] = await tx.select({ id: bellSchedules.id }).from(bellSchedules).where(eq(bellSchedules.name, input.name));
    if (clash && clash.id !== input.id) throw new AppError(`There's already a schedule called ${input.name}.`, "conflict");
    const days = [...new Set(input.days)].sort();
    let scheduleId = input.id;
    if (scheduleId) {
      const [row] = await tx.update(bellSchedules).set({ name: input.name, days }).where(eq(bellSchedules.id, scheduleId)).returning();
      if (!row) throw new AppError("That schedule wasn't found.", "not_found");
    } else {
      const [first] = await tx.select({ id: bellSchedules.id }).from(bellSchedules).limit(1);
      const [row] = await tx.insert(bellSchedules).values({ schoolId: access.school.id, name: input.name, days, isDefault: !first }).returning();
      scheduleId = row.id;
    }
    const existing = await tx.select({ id: bellPeriods.id }).from(bellPeriods).where(eq(bellPeriods.scheduleId, scheduleId));
    const keep = new Set(input.periods.flatMap((p) => (p.id ? [p.id] : [])));
    const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (remove.length) await tx.delete(bellPeriods).where(inArray(bellPeriods.id, remove));
    const ordered = [...input.periods].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (const [i, p] of ordered.entries()) {
      if (p.id && existing.some((e) => e.id === p.id)) {
        await tx.update(bellPeriods).set({ label: p.label, startsAt: p.startsAt, endsAt: p.endsAt, kind: p.kind, sort: i }).where(eq(bellPeriods.id, p.id));
        // A period turned into a break no longer holds lessons.
        if (p.kind !== "lesson") await tx.delete(timetableSlots).where(eq(timetableSlots.periodId, p.id));
      } else {
        await tx.insert(bellPeriods).values({ schoolId: access.school.id, scheduleId, label: p.label, startsAt: p.startsAt, endsAt: p.endsAt, kind: p.kind, sort: i });
      }
    }
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "timetable.schedule", summary: `Saved the bell schedule "${input.name}" (${input.periods.length} periods)` });
    return scheduleId;
  });
}

export async function setLevelSchedule(db: DB, access: Access, input: { levelId: string; scheduleId: string | null }, ip?: string | null) {
  requirePermission(access, "teaching:timetable");
  await withTenant(db, access.school.id, async (tx) => {
    await tx.delete(levelSchedules).where(eq(levelSchedules.levelId, input.levelId));
    if (input.scheduleId) await tx.insert(levelSchedules).values({ schoolId: access.school.id, levelId: input.levelId, scheduleId: input.scheduleId });
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "timetable.level_schedule", summary: "Changed which bell schedule a class level follows" });
  });
}

// ---------- The class grid ----------

/** Staff who can be put on the timetable. */
async function teachingStaff(tx: Tx) {
  return tx
    .selectDistinct({ id: memberships.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff")))
    .orderBy(asc(users.name));
}

export async function getClassTimetable(db: DB, access: Access, classId: string, termId?: string | null) {
  requireFeature(access.plan, "timetable");
  return withTenant(db, access.school.id, async (tx) => {
    await ensureDefaultSchedule(tx, access.school.id);
    const { term, options } = await pickTerm(tx, termId);
    const { cls, schedule } = await scheduleForClass(tx, classId);
    const [slots, levelSubs, assignedTeachers, staff] = await Promise.all([
      tx
        .select({ slot: timetableSlots, subjectName: subjects.name, subjectCode: subjects.code, teacherName: users.name })
        .from(timetableSlots)
        .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .leftJoin(memberships, eq(memberships.id, timetableSlots.teacherId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(timetableSlots.termId, term.id), eq(timetableSlots.classId, classId))),
      tx.select({ id: subjects.id, name: subjects.name, code: subjects.code }).from(levelSubjects).innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId)).where(eq(levelSubjects.levelId, cls.levelId)).orderBy(asc(subjects.sort), asc(subjects.name)),
      tx.select({ subjectId: teacherAssignments.subjectId, membershipId: teacherAssignments.membershipId }).from(teacherAssignments).where(eq(teacherAssignments.classId, classId)),
      teachingStaff(tx),
    ]);
    const perSubject = new Map<string, number>();
    for (const s of slots) if (s.slot.subjectId) perSubject.set(s.slot.subjectId, (perSubject.get(s.slot.subjectId) ?? 0) + 1);
    return {
      term,
      terms: options,
      cls,
      schedule,
      slots: slots.map((s) => ({ ...s.slot, subjectName: s.subjectName, subjectCode: s.subjectCode, teacherName: s.teacherName })),
      subjects: levelSubs.map((s) => ({ ...s, teacherId: assignedTeachers.find((a) => a.subjectId === s.id)?.membershipId ?? null, lessons: perSubject.get(s.id) ?? 0 })),
      staff,
      editable: can(access, "teaching:timetable"),
    };
  });
}

export const slotSchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  day: z.number().int().min(1).max(7),
  periodId: z.string().uuid(),
  subjectId: z.string().uuid().nullable(),
  teacherId: z.string().uuid().nullable(),
  room: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(60).nullable().optional(),
  force: z.boolean().default(false),
});

/** Who else is busy at that time: the same teacher or room in another class, on overlapping periods. */
async function findClashes(tx: Tx, input: { termId: string; classId: string; day: number; periodId: string; teacherId: string | null; room?: string | null }, ignoreSlotIds: string[] = []) {
  const [period] = await tx.select().from(bellPeriods).where(eq(bellPeriods.id, input.periodId));
  if (!period) throw new AppError("That period wasn't found.", "not_found");
  if (!input.teacherId && !input.room) return { period, clashes: [] as string[] };
  const others = await tx
    .select({ slot: timetableSlots, period: bellPeriods, className: classes.name, teacherName: users.name })
    .from(timetableSlots)
    .innerJoin(bellPeriods, eq(bellPeriods.id, timetableSlots.periodId))
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .leftJoin(memberships, eq(memberships.id, timetableSlots.teacherId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(timetableSlots.termId, input.termId), eq(timetableSlots.day, input.day), ne(timetableSlots.classId, input.classId)));
  const clashes: string[] = [];
  for (const o of others) {
    if (ignoreSlotIds.includes(o.slot.id) || !overlaps(o.period, period)) continue;
    if (input.teacherId && o.slot.teacherId === input.teacherId) clashes.push(`${o.teacherName} already teaches ${o.className} then (${o.period.startsAt}–${o.period.endsAt}).`);
    if (input.room && o.slot.room && o.slot.room.toLowerCase() === input.room.toLowerCase()) clashes.push(`${o.slot.room} is already in use by ${o.className} then.`);
  }
  return { period, clashes };
}

export async function setSlot(db: DB, access: Access, input: z.infer<typeof slotSchema>, ip?: string | null) {
  requirePermission(access, "teaching:timetable");
  requireFeature(access.plan, "timetable");
  return withTenant(db, access.school.id, async (tx) => {
    const { schedule } = await scheduleForClass(tx, input.classId);
    if (!schedule.periods.some((p) => p.id === input.periodId)) throw new AppError("That period isn't on this class's bell schedule.", "invalid");
    if (!schedule.days.includes(input.day)) throw new AppError("This class doesn't have school that day.", "invalid");
    const { period, clashes } = await findClashes(tx, input);
    if (period.kind !== "lesson" && input.subjectId) throw new AppError(`${period.label} is a ${period.kind}, not a lesson.`, "invalid");
    if (clashes.length && !input.force) return { ok: false as const, clashes };
    const empty = !input.subjectId && !input.teacherId && !input.room && !input.note;
    await tx.delete(timetableSlots).where(and(eq(timetableSlots.termId, input.termId), eq(timetableSlots.classId, input.classId), eq(timetableSlots.day, input.day), eq(timetableSlots.periodId, input.periodId)));
    if (!empty) {
      await tx.insert(timetableSlots).values({
        schoolId: access.school.id,
        termId: input.termId,
        classId: input.classId,
        day: input.day,
        periodId: input.periodId,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        room: input.room || null,
        note: input.note || null,
      });
    }
    if (clashes.length) {
      await recordAudit(tx, access.school.id, actor(access, ip), { action: "timetable.clash_override", summary: `Saved a timetable slot despite a clash: ${clashes[0]}` });
    }
    return { ok: true as const, clashes };
  });
}

/** Drag and drop: swaps two cells in a class's week, checking both new positions for clashes. */
export async function swapSlots(db: DB, access: Access, input: { termId: string; classId: string; a: { day: number; periodId: string }; b: { day: number; periodId: string }; force?: boolean }) {
  requirePermission(access, "teaching:timetable");
  requireFeature(access.plan, "timetable");
  return withTenant(db, access.school.id, async (tx) => {
    const { schedule } = await scheduleForClass(tx, input.classId);
    const lesson = (p: string) => schedule.periods.find((x) => x.id === p)?.kind === "lesson";
    if (!lesson(input.a.periodId) || !lesson(input.b.periodId)) throw new AppError("Lessons can only move between lesson periods.", "invalid");
    const at = (c: { day: number; periodId: string }) =>
      tx
        .select()
        .from(timetableSlots)
        .where(and(eq(timetableSlots.termId, input.termId), eq(timetableSlots.classId, input.classId), eq(timetableSlots.day, c.day), eq(timetableSlots.periodId, c.periodId)))
        .then((r) => r[0] ?? null);
    const [sa, sb] = await Promise.all([at(input.a), at(input.b)]);
    const clashes = [
      ...(sa ? (await findClashes(tx, { ...input.b, termId: input.termId, classId: input.classId, teacherId: sa.teacherId, room: sa.room })).clashes : []),
      ...(sb ? (await findClashes(tx, { ...input.a, termId: input.termId, classId: input.classId, teacherId: sb.teacherId, room: sb.room })).clashes : []),
    ];
    if (clashes.length && !input.force) return { ok: false as const, clashes };
    // Park one row on day 0 first so the unique (class, day, period) index never sees two rows in one cell.
    if (sa && sb) {
      await tx.update(timetableSlots).set({ day: 0 }).where(eq(timetableSlots.id, sa.id));
      await tx.update(timetableSlots).set({ day: input.a.day, periodId: input.a.periodId }).where(eq(timetableSlots.id, sb.id));
      await tx.update(timetableSlots).set({ day: input.b.day, periodId: input.b.periodId }).where(eq(timetableSlots.id, sa.id));
    } else if (sa) {
      await tx.update(timetableSlots).set({ day: input.b.day, periodId: input.b.periodId }).where(eq(timetableSlots.id, sa.id));
    } else if (sb) {
      await tx.update(timetableSlots).set({ day: input.a.day, periodId: input.a.periodId }).where(eq(timetableSlots.id, sb.id));
    }
    return { ok: true as const, clashes };
  });
}

export async function copyTimetable(db: DB, access: Access, input: { fromTermId: string; toTermId: string }, ip?: string | null) {
  requirePermission(access, "teaching:timetable");
  requireFeature(access.plan, "timetable");
  if (input.fromTermId === input.toTermId) throw new AppError("Pick a different term to copy from.");
  return withTenant(db, access.school.id, async (tx) => {
    const source = await tx.select().from(timetableSlots).where(eq(timetableSlots.termId, input.fromTermId));
    if (!source.length) throw new AppError("That term has no timetable to copy.", "conflict");
    await tx.delete(timetableSlots).where(eq(timetableSlots.termId, input.toTermId));
    await tx.insert(timetableSlots).values(source.map((s) => ({ schoolId: s.schoolId, termId: input.toTermId, classId: s.classId, day: s.day, periodId: s.periodId, subjectId: s.subjectId, teacherId: s.teacherId, room: s.room, note: s.note })));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "timetable.copied", summary: `Copied ${source.length} timetable slots into another term` });
    return source.length;
  });
}

// ---------- Teacher and read-only views ----------

export async function getTeacherTimetable(db: DB, access: Access, membershipId?: string | null, termId?: string | null) {
  requireFeature(access.plan, "timetable");
  const manager = can(access, "teaching:timetable");
  return withTenant(db, access.school.id, async (tx) => {
    await ensureDefaultSchedule(tx, access.school.id);
    const { term, options } = await pickTerm(tx, termId);
    let target = membershipId && manager ? membershipId : access.membershipId;
    // Managers who don't teach open on the first teacher who does.
    if (manager && !membershipId) {
      const [mine] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.termId, term.id), eq(timetableSlots.teacherId, access.membershipId))).limit(1);
      if (!mine) {
        const [someone] = await tx
          .select({ teacherId: timetableSlots.teacherId, name: users.name })
          .from(timetableSlots)
          .innerJoin(memberships, eq(memberships.id, timetableSlots.teacherId))
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(timetableSlots.termId, term.id))
          .orderBy(asc(users.name))
          .limit(1);
        if (someone?.teacherId) target = someone.teacherId;
      }
    }
    const { schedules } = await loadSchedules(tx);
    const rows = await tx
      .select({ slot: timetableSlots, period: bellPeriods, className: classes.name, subjectName: subjects.name })
      .from(timetableSlots)
      .innerJoin(bellPeriods, eq(bellPeriods.id, timetableSlots.periodId))
      .innerJoin(classes, eq(classes.id, timetableSlots.classId))
      .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
      .where(and(eq(timetableSlots.termId, term.id), eq(timetableSlots.teacherId, target)));
    const staff = can(access, "teaching:timetable") ? await teachingStaff(tx) : [];
    // Teachers see their week on the default schedule's times; lessons from other schedules slot in by start time.
    const base = schedules.find((s) => s.isDefault) ?? schedules[0];
    return { term, terms: options, schedule: base, teacherId: target, staff, lessons: rows.map((r) => ({ ...r.slot, startsAt: r.period.startsAt, endsAt: r.period.endsAt, className: r.className, subjectName: r.subjectName })) };
  });
}

/** A class's week for parents and students (read only). */
export async function classWeek(tx: Tx, classId: string, termId: string) {
  await ensureDefaultSchedule(tx, (await tx.select({ s: classes.schoolId }).from(classes).where(eq(classes.id, classId)))[0].s);
  const { schedule } = await scheduleForClass(tx, classId);
  const slots = await tx
    .select({ slot: timetableSlots, subjectName: subjects.name, teacherName: users.name })
    .from(timetableSlots)
    .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .leftJoin(memberships, eq(memberships.id, timetableSlots.teacherId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(timetableSlots.termId, termId), eq(timetableSlots.classId, classId)));
  return { schedule, slots: slots.map((s) => ({ ...s.slot, subjectName: s.subjectName, teacherName: s.teacherName })) };
}

export async function timetableCoverage(db: DB, access: Access, termId?: string | null) {
  requireFeature(access.plan, "timetable");
  return withTenant(db, access.school.id, async (tx) => {
    const { term } = await pickTerm(tx, termId);
    const rows = await tx.select({ classId: timetableSlots.classId }).from(timetableSlots).where(eq(timetableSlots.termId, term.id));
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.classId, (counts.get(r.classId) ?? 0) + 1);
    return counts;
  });
}
