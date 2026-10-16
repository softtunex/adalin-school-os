import { and, desc, eq, gte, inArray, or, sql, asc } from "drizzle-orm";
import type { DB } from "../db/client";
import { announcementReads, announcements, calendarEvents, classes, plans, schools, students } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { getCurrentTerm } from "./academics";
import { lagosToday, studentAttendanceSummary } from "./attendance";
import { owesForTerm } from "./invoices";
import { publishedTerms } from "./parent-portal";
import { classWeek } from "./timetable";

/*
 * What a student sees. Access comes only from students.user_id = the signed-in user, and
 * every read runs inside that student's school.
 */

export type Me = {
  studentId: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  classId: string | null;
  className: string | null;
  levelId: string | null;
  school: { name: string; slug: string; logoUrl: string | null; features: string[]; studentResults: boolean; withholdResults: boolean };
};

export async function myStudentRecord(db: DB, userId: string): Promise<Me | null> {
  const [row] = await db
    .select({
      studentId: students.id,
      schoolId: students.schoolId,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNo: students.admissionNo,
      classId: students.classId,
      className: classes.name,
      levelId: classes.levelId,
      schoolName: schools.name,
      slug: schools.slug,
      logoUrl: schools.logoUrl,
      features: plans.features,
      comms: schools.commsSettings,
      fees: schools.feeSettings,
      schoolStatus: schools.status,
    })
    .from(students)
    .innerJoin(schools, eq(schools.id, students.schoolId))
    .innerJoin(plans, eq(plans.key, schools.planKey))
    .leftJoin(classes, eq(classes.id, students.classId))
    .where(and(eq(students.userId, userId), eq(students.status, "active")))
    .limit(1);
  if (!row || row.schoolStatus === "suspended") return null;
  return {
    studentId: row.studentId,
    schoolId: row.schoolId,
    firstName: row.firstName,
    lastName: row.lastName,
    admissionNo: row.admissionNo,
    classId: row.classId,
    className: row.className,
    levelId: row.levelId,
    school: { name: row.schoolName, slug: row.slug, logoUrl: row.logoUrl, features: row.features, studentResults: !!row.comms.studentResults, withholdResults: !!row.fees.withholdResults },
  };
}

export async function requireStudent(db: DB, userId: string) {
  const me = await myStudentRecord(db, userId);
  if (!me) throw new AppError("This account isn't linked to a student.", "not_found");
  return me;
}

function studentAudience(classId: string | null) {
  return or(
    inArray(announcements.audience, ["everyone", "students"]),
    classId ? and(eq(announcements.audience, "classes"), sql`${announcements.classIds} @> ${JSON.stringify([classId])}::jsonb`) : sql`false`,
  )!;
}

export async function getStudentHome(db: DB, userId: string) {
  const me = await requireStudent(db, userId);
  const today = lagosToday();
  return withTenant(db, me.schoolId, async (tx) => {
    const current = await getCurrentTerm(tx);
    const [week, attendance, news, events] = await Promise.all([
      current && me.classId && me.school.features.includes("timetable") ? classWeek(tx, me.classId, current.term.id) : Promise.resolve(null),
      current ? studentAttendanceSummary(tx, me.studentId, current.term.id) : Promise.resolve(null),
      tx
        .select({ a: announcements, readAt: announcementReads.readAt })
        .from(announcements)
        .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, userId)))
        .where(studentAudience(me.classId))
        .orderBy(desc(announcements.pinned), desc(announcements.publishedAt))
        .limit(10),
      tx.select().from(calendarEvents).where(and(eq(calendarEvents.forParents, true), gte(calendarEvents.endsOn, today))).orderBy(asc(calendarEvents.startsOn)).limit(5),
    ]);
    return { me, term: current ? `${current.term.name} · ${current.session.name}` : null, termId: current?.term.id ?? null, week: week && week.slots.length ? week : null, attendance, news, events };
  });
}

/** Published results the student may see: only when the school allows it, and not while fees are held. */
export async function getStudentResults(db: DB, userId: string) {
  const me = await requireStudent(db, userId);
  if (!me.school.studentResults) return { me, allowed: false as const, results: [] };
  return withTenant(db, me.schoolId, async (tx) => {
    const terms = await publishedTerms(tx, me.studentId);
    const out = [];
    for (const t of terms) {
      const held = me.school.withholdResults && me.school.features.includes("debtors") && (await owesForTerm(tx, me.studentId, t.termId)) > 0;
      out.push({ ...t, withheld: held });
    }
    return { me, allowed: true as const, results: out };
  });
}
