import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { attendanceDays, attendanceRecords, classes, classLevels, memberships, students, users, type AttendanceStatus } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { can, requirePermission, type Access } from "./access";
import { getCurrentTerm, studentScope } from "./academics";
import { recordAudit } from "./audit";

/** Today's date in Lagos as YYYY-MM-DD. */
export function lagosToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Classes this person can take attendance for: their form classes, or every class for school-wide roles. */
async function attendanceClassIds(tx: Tx, access: Access): Promise<"all" | string[]> {
  if (can(access, "attendance:edit_past")) return "all";
  if (!can(access, "attendance:take")) return [];
  const scope = await studentScope(tx, access);
  if (scope === "all") return "all";
  const form = await tx.select({ id: classes.id }).from(classes).where(eq(classes.classTeacherId, access.membershipId));
  return form.map((c) => c.id);
}

function assertDate(access: Access, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new AppError("Choose a valid date.", "invalid");
  const today = lagosToday();
  if (date > today) throw new AppError("Attendance can't be taken for a future date.", "invalid");
  if (date < today && !can(access, "attendance:edit_past")) throw new AppError("Only admins can change attendance for past days.", "forbidden");
}

export async function listAttendanceClasses(db: DB, access: Access, date: string) {
  return withTenant(db, access.school.id, async (tx) => {
    const allowed = await attendanceClassIds(tx, access);
    if (allowed !== "all" && allowed.length === 0) return [];
    const rows = await tx
      .select({ id: classes.id, name: classes.name, classTeacherId: classes.classTeacherId, levelSort: classLevels.sort })
      .from(classes)
      .innerJoin(classLevels, eq(classLevels.id, classes.levelId))
      .where(and(eq(classes.isActive, true), allowed === "all" ? undefined : inArray(classes.id, allowed)))
      .orderBy(asc(classLevels.sort), asc(classes.name));
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const [roll, days, marks] = await Promise.all([
      tx.select({ classId: students.classId, n: count() }).from(students).where(and(eq(students.status, "active"), inArray(students.classId, ids))).groupBy(students.classId),
      tx
        .select({ id: attendanceDays.id, classId: attendanceDays.classId, takenAt: attendanceDays.takenAt, takenBy: users.name })
        .from(attendanceDays)
        .leftJoin(memberships, eq(memberships.id, attendanceDays.takenBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(attendanceDays.date, date), inArray(attendanceDays.classId, ids))),
      tx
        .select({ classId: attendanceDays.classId, status: attendanceRecords.status, n: count() })
        .from(attendanceRecords)
        .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceRecords.dayId))
        .where(and(eq(attendanceDays.date, date), inArray(attendanceDays.classId, ids)))
        .groupBy(attendanceDays.classId, attendanceRecords.status),
    ]);
    return rows.map((c) => {
      const day = days.find((d) => d.classId === c.id);
      const tally = (s: AttendanceStatus) => marks.find((m) => m.classId === c.id && m.status === s)?.n ?? 0;
      return {
        id: c.id,
        name: c.name,
        isMine: c.classTeacherId === access.membershipId,
        students: roll.find((r) => r.classId === c.id)?.n ?? 0,
        taken: Boolean(day),
        takenAt: day?.takenAt ?? null,
        takenBy: day?.takenBy ?? null,
        present: tally("present"),
        late: tally("late"),
        absent: tally("absent"),
        excused: tally("excused"),
      };
    });
  });
}

export async function getAttendanceSheet(db: DB, access: Access, classId: string, date: string) {
  return withTenant(db, access.school.id, async (tx) => {
    const allowed = await attendanceClassIds(tx, access);
    if (allowed !== "all" && !allowed.includes(classId)) throw new AppError("You can't take attendance for this class.", "forbidden");
    const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
    if (!cls) throw new AppError("That class wasn't found.", "not_found");
    const roster = await tx
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo, gender: students.gender })
      .from(students)
      .where(and(eq(students.classId, classId), eq(students.status, "active")))
      .orderBy(asc(students.lastName), asc(students.firstName));
    const [day] = await tx.select().from(attendanceDays).where(and(eq(attendanceDays.classId, classId), eq(attendanceDays.date, date)));
    const records = day ? await tx.select().from(attendanceRecords).where(eq(attendanceRecords.dayId, day.id)) : [];
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    return {
      class: { id: cls.id, name: cls.name },
      date,
      taken: Boolean(day),
      takenAt: day?.takenAt ?? null,
      canEdit: date === lagosToday() || can(access, "attendance:edit_past"),
      students: roster.map((s) => ({
        ...s,
        status: (byStudent.get(s.id)?.status ?? "present") as AttendanceStatus,
        note: byStudent.get(s.id)?.note ?? null,
      })),
    };
  });
}

export async function saveAttendance(
  db: DB,
  access: Access,
  input: { classId: string; date: string; records: { studentId: string; status: AttendanceStatus; note?: string | null }[] },
  ip?: string | null,
) {
  assertDate(access, input.date);
  return withTenant(db, access.school.id, async (tx) => {
    const allowed = await attendanceClassIds(tx, access);
    if (allowed !== "all" && !allowed.includes(input.classId)) throw new AppError("You can't take attendance for this class.", "forbidden");
    const [cls] = await tx.select().from(classes).where(eq(classes.id, input.classId));
    if (!cls) throw new AppError("That class wasn't found.", "not_found");

    const ids = input.records.map((r) => r.studentId);
    if (new Set(ids).size !== ids.length) throw new AppError("A student appears twice in the register.", "invalid");
    const valid = ids.length
      ? await tx.select({ id: students.id }).from(students).where(and(inArray(students.id, ids), eq(students.classId, input.classId)))
      : [];
    if (valid.length !== ids.length) throw new AppError("The class list has changed. Reload the register and try again.", "conflict");

    const current = await getCurrentTerm(tx);
    const [day] = await tx
      .insert(attendanceDays)
      .values({ schoolId: access.school.id, classId: input.classId, date: input.date, termId: current?.term.id ?? null, takenBy: access.membershipId })
      .onConflictDoUpdate({ target: [attendanceDays.classId, attendanceDays.date], set: { takenBy: access.membershipId, takenAt: new Date() } })
      .returning();
    await tx.delete(attendanceRecords).where(eq(attendanceRecords.dayId, day.id));
    if (input.records.length) {
      await tx.insert(attendanceRecords).values(
        input.records.map((r) => ({ schoolId: access.school.id, dayId: day.id, studentId: r.studentId, status: r.status, note: r.note?.trim() || null })),
      );
    }
    const absent = input.records.filter((r) => r.status === "absent").length;
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "attendance.taken",
      summary: `Took attendance for ${cls.name} on ${input.date}: ${input.records.length - absent} in, ${absent} absent`,
      entityType: "class",
      entityId: cls.id,
    });
    return { present: input.records.length - absent, absent };
  });
}

/** Days present/absent for a student in a term, for profiles and report cards. */
export async function studentAttendanceSummary(tx: Tx, studentId: string, termId: string) {
  const rows = await tx
    .select({ status: attendanceRecords.status, n: count() })
    .from(attendanceRecords)
    .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceRecords.dayId))
    .where(and(eq(attendanceRecords.studentId, studentId), eq(attendanceDays.termId, termId)))
    .groupBy(attendanceRecords.status);
  const get = (s: AttendanceStatus) => rows.find((r) => r.status === s)?.n ?? 0;
  const present = get("present") + get("late");
  return { present, late: get("late"), absent: get("absent"), excused: get("excused"), days: present + get("absent") + get("excused") };
}

/** Per-student attendance totals for every student in a class this term (report cards, register). */
export async function classAttendanceTotals(tx: Tx, classId: string, termId: string) {
  const rows = await tx
    .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status, n: count() })
    .from(attendanceRecords)
    .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceRecords.dayId))
    .where(and(eq(attendanceDays.classId, classId), eq(attendanceDays.termId, termId)))
    .groupBy(attendanceRecords.studentId, attendanceRecords.status);
  const [{ days }] = await tx
    .select({ days: count() })
    .from(attendanceDays)
    .where(and(eq(attendanceDays.classId, classId), eq(attendanceDays.termId, termId)));
  const totals = new Map<string, { present: number; absent: number; late: number; excused: number }>();
  for (const r of rows) {
    const t = totals.get(r.studentId) ?? { present: 0, absent: 0, late: 0, excused: 0 };
    t[r.status] += r.n;
    totals.set(r.studentId, t);
  }
  return { days, totals };
}

/** Attendance rate for the school over a date range (for the overview). */
export async function schoolAttendanceRate(db: DB, access: Access, from: string, to: string) {
  requirePermission(access, "attendance:view");
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({
        total: count(),
        present: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present','late'))::int`,
      })
      .from(attendanceRecords)
      .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceRecords.dayId))
      .where(and(gte(attendanceDays.date, from), lte(attendanceDays.date, to)));
    return row.total ? Math.round((row.present / row.total) * 1000) / 10 : null;
  });
}

