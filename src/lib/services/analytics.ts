import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { Tx, DB } from "../db/client";
import {
  academicSessions,
  applicants,
  assessmentComponents,
  assignments,
  attendanceDays,
  attendanceRecords,
  classes,
  classLevels,
  exams,
  invoices,
  lessonNotes,
  levelSubjects,
  memberships,
  scores,
  scoreSheets,
  students,
  studentSubjects,
  subjects,
  teacherAssignments,
  terms,
  users,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, type Access } from "./access";
import { lagosToday } from "./attendance";

/*
 * School analytics for the proprietor and principal: how the school is doing this term
 * against last term, where learning is weak, which students need attention, and which
 * teachers are keeping up. Scores are read as a percentage of the CA and exam marks entered.
 */

export const PASS_MARK = 40;
export const RISK = { failing: 45, drop: 10, attendance: 80 } as const;

function requireAnalytics(access: Access) {
  if (!hasFeature(access.plan, "analytics")) throw new AppError("Analytics are on the Premium plan.", "upgrade");
  if (!can(access, "school:analytics")) throw new AppError("You don't have permission to see analytics.", "forbidden");
}

const pct = (got: number, max: number) => (max > 0 ? (got / max) * 100 : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** Terms oldest first, with the session name, so "last term" can cross a session boundary. */
async function orderedTerms(tx: Tx) {
  const rows = await tx
    .select({ id: terms.id, name: terms.name, number: terms.number, isCurrent: terms.isCurrent, startsOn: terms.startsOn, endsOn: terms.endsOn, session: academicSessions.name })
    .from(terms)
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId));
  return rows
    .sort((a, b) => a.session.localeCompare(b.session) || a.number - b.number)
    .map((t) => ({ ...t, label: `${t.name} ${t.session}`, short: `T${t.number} ${t.session.slice(2, 4)}/${t.session.slice(-2)}` }));
}
type TermRow = Awaited<ReturnType<typeof orderedTerms>>[number];

async function pickTerms(tx: Tx, termId?: string) {
  const all = await orderedTerms(tx);
  const i = termId ? all.findIndex((t) => t.id === termId) : all.findIndex((t) => t.isCurrent);
  if (i === -1) throw new AppError("Set a current term in Academics first.", "invalid");
  return { all, term: all[i], previous: i > 0 ? all[i - 1] : null };
}

/** Each student's percentage per subject for the given terms. */
async function subjectScores(tx: Tx, termIds: string[]) {
  if (!termIds.length) return [];
  const rows = await tx
    .select({
      termId: scores.termId,
      studentId: scores.studentId,
      subjectId: scores.subjectId,
      classId: scores.classId,
      got: sql<number>`sum(${scores.score})`.mapWith(Number),
      max: sql<number>`sum(${assessmentComponents.maxScore})`.mapWith(Number),
    })
    .from(scores)
    .innerJoin(assessmentComponents, eq(assessmentComponents.id, scores.componentId))
    .where(inArray(scores.termId, termIds))
    .groupBy(scores.termId, scores.studentId, scores.subjectId, scores.classId);
  return rows.map((r) => ({ ...r, pct: pct(r.got, r.max)! }));
}
type SubjectScore = Awaited<ReturnType<typeof subjectScores>>[number];

function studentAverages(rows: SubjectScore[]) {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.studentId, [...(by.get(r.studentId) ?? []), r.pct]);
  return new Map([...by].map(([k, v]) => [k, mean(v)!]));
}

async function attendanceByStudent(tx: Tx, termId: string) {
  const rows = await tx
    .select({
      studentId: attendanceRecords.studentId,
      days: count(),
      present: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late'))`.mapWith(Number),
    })
    .from(attendanceRecords)
    .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceRecords.dayId))
    .where(eq(attendanceDays.termId, termId))
    .groupBy(attendanceRecords.studentId);
  return new Map(rows.map((r) => [r.studentId, { days: r.days, rate: (r.present / r.days) * 100 }]));
}

async function owingByStudent(tx: Tx, termId: string) {
  const rows = await tx
    .select({ studentId: invoices.studentId, owing: sql<number>`sum(${invoices.chargesKobo} - ${invoices.discountKobo} - ${invoices.paidKobo})`.mapWith(Number), overdue: sql<boolean>`bool_or(${invoices.dueOn} < current_date)` })
    .from(invoices)
    .where(and(eq(invoices.termId, termId), ne(invoices.status, "void")))
    .groupBy(invoices.studentId);
  return new Map(rows.filter((r) => r.owing > 0).map((r) => [r.studentId, { owing: r.owing, overdue: !!r.overdue }]));
}

// ---------- Overview ----------

export async function getAnalyticsOverview(db: DB, access: Access, termId?: string) {
  requireAnalytics(access);
  return withTenant(db, access.school.id, async (tx) => {
    const { all, term, previous } = await pickTerms(tx, termId);
    const termIds = all.map((t) => t.id);
    const [allScores, att, prevAtt, fees, prevFees, [enrolment], admissions, sheetStats, risk] = await Promise.all([
      subjectScores(tx, termIds),
      attendanceByStudent(tx, term.id),
      previous ? attendanceByStudent(tx, previous.id) : Promise.resolve(new Map()),
      feeTotals(tx, term.id),
      previous ? feeTotals(tx, previous.id) : Promise.resolve(null),
      tx
        .select({
          active: sql<number>`count(*) filter (where ${students.status} = 'active')`.mapWith(Number),
          female: sql<number>`count(*) filter (where ${students.status} = 'active' and ${students.gender} = 'female')`.mapWith(Number),
          joined: term.startsOn
            ? sql<number>`count(*) filter (where ${students.admittedOn} >= ${term.startsOn} and (${term.endsOn}::date is null or ${students.admittedOn} <= ${term.endsOn}::date))`.mapWith(Number)
            : sql<number>`0`.mapWith(Number),
          left: sql<number>`count(*) filter (where ${students.status} in ('withdrawn', 'graduated'))`.mapWith(Number),
        })
        .from(students),
      tx.select({ status: applicants.status, n: count() }).from(applicants).groupBy(applicants.status),
      sheetCompletion(tx, term.id),
      atRiskList(tx, term, previous),
    ]);
    const now = allScores.filter((s) => s.termId === term.id);
    const before = previous ? allScores.filter((s) => s.termId === previous.id) : [];
    const rate = (m: Map<string, { days: number; rate: number }>) => {
      let days = 0;
      let present = 0;
      for (const v of m.values()) {
        days += v.days;
        present += (v.rate / 100) * v.days;
      }
      return days ? (present / days) * 100 : null;
    };
    const trend = all
      .map((t) => {
        const rows = allScores.filter((s) => s.termId === t.id);
        return { id: t.id, label: t.short, full: t.label, average: r1(mean(rows.map((r) => r.pct))), pass: rows.length ? r1((rows.filter((r) => r.pct >= PASS_MARK).length / rows.length) * 100) : null };
      })
      .filter((t) => t.average !== null);
    return {
      term,
      previous,
      terms: all,
      students: enrolment,
      applicants: Object.fromEntries(admissions.map((a) => [a.status, a.n])) as Record<string, number>,
      average: { now: r1(mean(now.map((r) => r.pct))), before: r1(mean(before.map((r) => r.pct))) },
      passRate: { now: now.length ? r1((now.filter((r) => r.pct >= PASS_MARK).length / now.length) * 100) : null, before: before.length ? r1((before.filter((r) => r.pct >= PASS_MARK).length / before.length) * 100) : null },
      attendance: { now: r1(rate(att)), before: r1(rate(prevAtt)), weeks: await weeklyAttendance(tx, term.id) },
      fees: { now: fees, before: prevFees },
      sheets: sheetStats,
      atRisk: { count: risk.length, top: risk.slice(0, 5) },
      trend,
    };
  });
}

async function feeTotals(tx: Tx, termId: string) {
  const [r] = await tx
    .select({
      billed: sql<number>`coalesce(sum(${invoices.chargesKobo} - ${invoices.discountKobo}), 0)`.mapWith(Number),
      collected: sql<number>`coalesce(sum(${invoices.paidKobo}), 0)`.mapWith(Number),
      families: count(),
      paidUp: sql<number>`count(*) filter (where ${invoices.status} = 'paid')`.mapWith(Number),
    })
    .from(invoices)
    .where(and(eq(invoices.termId, termId), ne(invoices.status, "void")));
  return { ...r, outstanding: r.billed - r.collected, rate: r.billed ? r1((r.collected / r.billed) * 100) : null };
}

async function weeklyAttendance(tx: Tx, termId: string) {
  const rows = await tx
    .select({
      week: sql<string>`to_char(date_trunc('week', ${attendanceDays.date}::timestamp), 'YYYY-MM-DD')`,
      total: count(),
      present: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late'))`.mapWith(Number),
    })
    .from(attendanceRecords)
    .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceRecords.dayId))
    .where(eq(attendanceDays.termId, termId))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.slice(-10).map((r) => ({ week: r.week, rate: r1((r.present / r.total) * 100)! }));
}

/** Score sheets submitted against those expected (every subject taught in every class). */
async function sheetCompletion(tx: Tx, termId: string) {
  const [expected, sheets] = await Promise.all([
    tx.select({ classId: classes.id, subjectId: levelSubjects.subjectId }).from(classes).innerJoin(levelSubjects, eq(levelSubjects.levelId, classes.levelId)).where(eq(classes.isActive, true)),
    tx.select({ classId: scoreSheets.classId, subjectId: scoreSheets.subjectId, status: scoreSheets.status }).from(scoreSheets).where(eq(scoreSheets.termId, termId)),
  ]);
  const started = await tx.selectDistinct({ classId: scores.classId, subjectId: scores.subjectId }).from(scores).where(eq(scores.termId, termId));
  const key = (r: { classId: string; subjectId: string }) => `${r.classId}:${r.subjectId}`;
  const exp = new Set(expected.map(key));
  const submitted = sheets.filter((s) => s.status === "submitted" && exp.has(key(s))).length;
  const inProgress = started.filter((s) => exp.has(key(s))).length;
  return { expected: exp.size, submitted, started: inProgress, rate: exp.size ? r1((submitted / exp.size) * 100) : null };
}

// ---------- Academics ----------

export async function getAcademicAnalytics(db: DB, access: Access, filter: { termId?: string; levelId?: string } = {}) {
  requireAnalytics(access);
  return withTenant(db, access.school.id, async (tx) => {
    const { all, term, previous } = await pickTerms(tx, filter.termId);
    const [classRows, subjectRows, levels, allScores] = await Promise.all([
      tx.select({ id: classes.id, name: classes.name, levelId: classes.levelId, sort: classLevels.sort }).from(classes).innerJoin(classLevels, eq(classLevels.id, classes.levelId)).orderBy(asc(classLevels.sort), asc(classes.name)),
      tx.select({ id: subjects.id, name: subjects.name, code: subjects.code }).from(subjects).orderBy(asc(subjects.sort), asc(subjects.name)),
      tx.select({ id: classLevels.id, name: classLevels.name }).from(classLevels).orderBy(asc(classLevels.sort)),
      subjectScores(tx, all.map((t) => t.id)),
    ]);
    const inLevel = (classId: string) => !filter.levelId || classRows.find((c) => c.id === classId)?.levelId === filter.levelId;
    const scoped = allScores.filter((s) => inLevel(s.classId));
    const now = scoped.filter((s) => s.termId === term.id);
    const before = previous ? scoped.filter((s) => s.termId === previous.id) : [];

    const bySubject = subjectRows
      .map((sub) => {
        const rows = now.filter((r) => r.subjectId === sub.id);
        const prev = before.filter((r) => r.subjectId === sub.id);
        const avg = mean(rows.map((r) => r.pct));
        const prevAvg = mean(prev.map((r) => r.pct));
        return {
          ...sub,
          students: rows.length,
          average: r1(avg),
          change: avg !== null && prevAvg !== null ? r1(avg - prevAvg) : null,
          passRate: rows.length ? r1((rows.filter((r) => r.pct >= PASS_MARK).length / rows.length) * 100) : null,
        };
      })
      .filter((s) => s.students > 0)
      .sort((a, b) => (a.average ?? 0) - (b.average ?? 0));

    const usedClasses = classRows.filter((c) => now.some((r) => r.classId === c.id));
    const heat = usedClasses.map((c) => ({
      classId: c.id,
      className: c.name,
      cells: bySubject.map((s) => ({ subjectId: s.id, average: r1(mean(now.filter((r) => r.classId === c.id && r.subjectId === s.id).map((r) => r.pct))) })),
      average: r1(mean(now.filter((r) => r.classId === c.id).map((r) => r.pct))),
    }));

    const bands = [
      { label: "70 and above", min: 70, max: 101 },
      { label: "60 to 69", min: 60, max: 70 },
      { label: "50 to 59", min: 50, max: 60 },
      { label: "40 to 49", min: 40, max: 50 },
      { label: "Below 40", min: -1, max: 40 },
    ].map((b) => ({ label: b.label, n: now.filter((r) => r.pct >= b.min && r.pct < b.max).length }));

    const watch = bySubject.slice(0, 6).map((s) => s.id);
    const trend = all
      .map((t) => {
        const rows = scoped.filter((r) => r.termId === t.id);
        return { label: t.short, full: t.label, overall: r1(mean(rows.map((r) => r.pct))), subjects: Object.fromEntries(watch.map((id) => [id, r1(mean(rows.filter((r) => r.subjectId === id).map((r) => r.pct)))])) };
      })
      .filter((t) => t.overall !== null);

    return { term, previous, terms: all, levels, bySubject, heat, bands, trend, watch: watch.map((id) => bySubject.find((s) => s.id === id)!), entries: now.length };
  });
}

// ---------- Students at risk ----------

export type RiskReason = { kind: "failing" | "dropping" | "attendance" | "fees"; text: string };

async function atRiskList(tx: Tx, term: TermRow, previous: TermRow | null) {
  const [roster, sc, att, owing] = await Promise.all([
    tx
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo, classId: students.classId, className: classes.name })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(eq(students.status, "active")),
    subjectScores(tx, previous ? [term.id, previous.id] : [term.id]),
    attendanceByStudent(tx, term.id),
    owingByStudent(tx, term.id),
  ]);
  const nowAvg = studentAverages(sc.filter((s) => s.termId === term.id));
  const prevAvg = previous ? studentAverages(sc.filter((s) => s.termId === previous.id)) : new Map<string, number>();
  const failingSubjects = new Map<string, number>();
  for (const s of sc) if (s.termId === term.id && s.pct < PASS_MARK) failingSubjects.set(s.studentId, (failingSubjects.get(s.studentId) ?? 0) + 1);

  const out = [];
  for (const s of roster) {
    const reasons: RiskReason[] = [];
    const avg = nowAvg.get(s.id) ?? null;
    const prev = prevAvg.get(s.id) ?? null;
    const a = att.get(s.id);
    const o = owing.get(s.id);
    if (avg !== null && avg < RISK.failing) reasons.push({ kind: "failing", text: `Average ${Math.round(avg)}%${failingSubjects.get(s.id) ? `, failing ${failingSubjects.get(s.id)} subject${failingSubjects.get(s.id) === 1 ? "" : "s"}` : ""}` });
    if (avg !== null && prev !== null && prev - avg >= RISK.drop) reasons.push({ kind: "dropping", text: `Down ${Math.round(prev - avg)} points since last term` });
    if (a && a.days >= 5 && a.rate < RISK.attendance) reasons.push({ kind: "attendance", text: `Attendance ${Math.round(a.rate)}%` });
    if (o && o.overdue) reasons.push({ kind: "fees", text: "Fees overdue" });
    // Fees alone don't make a child "at risk" academically; they count alongside another sign.
    const academic = reasons.filter((r) => r.kind !== "fees").length;
    if (academic === 0) continue;
    out.push({ ...s, average: r1(avg), previous: r1(prev), attendance: a ? r1(a.rate) : null, owing: o?.owing ?? 0, reasons, score: academic * 2 + (o?.overdue ? 1 : 0) + (avg !== null && avg < 35 ? 1 : 0) });
  }
  return out.sort((x, y) => y.score - x.score || (x.average ?? 100) - (y.average ?? 100));
}

export async function getAtRisk(db: DB, access: Access, filter: { termId?: string; classId?: string; kind?: string } = {}) {
  requireAnalytics(access);
  return withTenant(db, access.school.id, async (tx) => {
    const { all, term, previous } = await pickTerms(tx, filter.termId);
    const list = await atRiskList(tx, term, previous);
    const counts = { failing: 0, dropping: 0, attendance: 0, fees: 0 } as Record<RiskReason["kind"], number>;
    for (const s of list) for (const r of s.reasons) counts[r.kind]++;
    const classOptions = await tx.select({ id: classes.id, name: classes.name }).from(classes).innerJoin(classLevels, eq(classLevels.id, classes.levelId)).where(eq(classes.isActive, true)).orderBy(asc(classLevels.sort), asc(classes.name));
    const rows = list.filter((s) => (!filter.classId || s.classId === filter.classId) && (!filter.kind || s.reasons.some((r) => r.kind === filter.kind)));
    return { term, previous, terms: all, rows, total: list.length, counts, classOptions };
  });
}

// ---------- Teachers ----------

export async function getTeacherAnalytics(db: DB, access: Access, termId?: string) {
  requireAnalytics(access);
  return withTenant(db, access.school.id, async (tx) => {
    const { all, term } = await pickTerms(tx, termId);
    const today = lagosToday();
    const [teaching, sheets, started, notes, work, cbt, roster, picks, electiveLinks] = await Promise.all([
      tx
        .select({ membershipId: teacherAssignments.membershipId, name: users.name, classId: teacherAssignments.classId, subjectId: teacherAssignments.subjectId })
        .from(teacherAssignments)
        .innerJoin(memberships, eq(memberships.id, teacherAssignments.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.status, "active")),
      tx.select({ classId: scoreSheets.classId, subjectId: scoreSheets.subjectId, status: scoreSheets.status, submittedAt: scoreSheets.submittedAt }).from(scoreSheets).where(eq(scoreSheets.termId, term.id)),
      tx.select({ classId: scores.classId, subjectId: scores.subjectId, n: sql<number>`count(distinct ${scores.studentId})`.mapWith(Number) }).from(scores).where(eq(scores.termId, term.id)).groupBy(scores.classId, scores.subjectId),
      tx
        .select({ authorId: lessonNotes.authorId, submitted: sql<number>`count(*) filter (where ${lessonNotes.status} <> 'draft')`.mapWith(Number), approved: sql<number>`count(*) filter (where ${lessonNotes.status} = 'approved')`.mapWith(Number) })
        .from(lessonNotes)
        .where(eq(lessonNotes.termId, term.id))
        .groupBy(lessonNotes.authorId),
      tx.select({ createdBy: assignments.createdBy, n: count() }).from(assignments).where(eq(assignments.termId, term.id)).groupBy(assignments.createdBy),
      tx.select({ createdBy: exams.createdBy, n: count() }).from(exams).where(eq(exams.termId, term.id)).groupBy(exams.createdBy),
      tx.select({ classId: students.classId, n: count() }).from(students).where(eq(students.status, "active")).groupBy(students.classId),
      tx.select({ subjectId: studentSubjects.subjectId, classId: students.classId, n: count() }).from(studentSubjects).innerJoin(students, eq(students.id, studentSubjects.studentId)).where(eq(students.status, "active")).groupBy(studentSubjects.subjectId, students.classId),
      tx.select({ classId: classes.id, subjectId: levelSubjects.subjectId, isElective: levelSubjects.isElective }).from(classes).innerJoin(levelSubjects, eq(levelSubjects.levelId, classes.levelId)),
    ]);
    const rollFor = (classId: string, subjectId: string) =>
      electiveLinks.find((l) => l.classId === classId && l.subjectId === subjectId)?.isElective
        ? (picks.find((p) => p.classId === classId && p.subjectId === subjectId)?.n ?? 0)
        : (roster.find((r) => r.classId === classId)?.n ?? 0);

    const byTeacher = new Map<string, { membershipId: string; name: string; pairs: { classId: string; subjectId: string }[] }>();
    for (const t of teaching) {
      const e = byTeacher.get(t.membershipId) ?? { membershipId: t.membershipId, name: t.name, pairs: [] };
      e.pairs.push({ classId: t.classId, subjectId: t.subjectId });
      byTeacher.set(t.membershipId, e);
    }
    const weeksSoFar = term.startsOn ? Math.max(1, Math.min(16, Math.floor((Date.parse(today) - Date.parse(term.startsOn)) / (7 * 86_400_000)) + 1)) : null;
    const rows = [...byTeacher.values()]
      .map((t) => {
        let expected = 0;
        let entered = 0;
        let submitted = 0;
        for (const p of t.pairs) {
          const roll = rollFor(p.classId, p.subjectId);
          expected += roll;
          entered += Math.min(roll, started.find((s) => s.classId === p.classId && s.subjectId === p.subjectId)?.n ?? 0);
          if (sheets.some((s) => s.classId === p.classId && s.subjectId === p.subjectId && s.status === "submitted")) submitted++;
        }
        const n = notes.find((x) => x.authorId === t.membershipId);
        return {
          membershipId: t.membershipId,
          name: t.name,
          sheets: t.pairs.length,
          submitted,
          scoresEntered: expected ? r1((entered / expected) * 100) : null,
          notesSubmitted: n?.submitted ?? 0,
          notesApproved: n?.approved ?? 0,
          assignments: work.find((w) => w.createdBy === t.membershipId)?.n ?? 0,
          exams: cbt.find((c) => c.createdBy === t.membershipId)?.n ?? 0,
        };
      })
      .sort((a, b) => a.submitted / a.sheets - b.submitted / b.sheets || (a.scoresEntered ?? 0) - (b.scoresEntered ?? 0));
    const totals = {
      teachers: rows.length,
      sheets: rows.reduce((t, r) => t + r.sheets, 0),
      submitted: rows.reduce((t, r) => t + r.submitted, 0),
      notes: rows.reduce((t, r) => t + r.notesSubmitted, 0),
      assignments: rows.reduce((t, r) => t + r.assignments, 0),
    };
    return { term, terms: all, rows, totals, weeksSoFar };
  });
}
