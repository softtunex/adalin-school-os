import { and, asc, count, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import {
  academicSessions,
  announcementReads,
  announcements,
  attendanceDays,
  attendanceRecords,
  calendarEvents,
  classes,
  classResults,
  guardians,
  invoices,
  notifications,
  plans,
  schools,
  scores,
  studentGuardians,
  students,
  terms,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { getCurrentTerm } from "./academics";
import { lagosToday, studentAttendanceSummary } from "./attendance";
import { balanceOf, owesForTerm } from "./invoices";

/*
 * What a parent sees. A parent has no staff membership: their access is exactly the
 * guardian records linked to their account, checked on every read.
 */

export type ChildLink = {
  studentId: string;
  schoolId: string;
  school: { name: string; slug: string; logoUrl: string | null; features: string[]; feeSettings: { withholdResults?: boolean } };
  firstName: string;
  middleName: string | null;
  lastName: string;
  admissionNo: string;
  classId: string | null;
  status: string;
  relationship: string;
};

/** Every child linked to this parent, across schools. Read as the owner role, filtered by the parent's own id. */
export async function myChildren(db: DB, userId: string): Promise<ChildLink[]> {
  const rows = await db
    .select({
      studentId: students.id,
      schoolId: students.schoolId,
      schoolName: schools.name,
      slug: schools.slug,
      logoUrl: schools.logoUrl,
      features: plans.features,
      feeSettings: schools.feeSettings,
      status: students.status,
      firstName: students.firstName,
      middleName: students.middleName,
      lastName: students.lastName,
      admissionNo: students.admissionNo,
      classId: students.classId,
      relationship: studentGuardians.relationship,
      schoolStatus: schools.status,
    })
    .from(guardians)
    .innerJoin(studentGuardians, eq(studentGuardians.guardianId, guardians.id))
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .innerJoin(schools, eq(schools.id, students.schoolId))
    .innerJoin(plans, eq(plans.key, schools.planKey))
    .where(and(eq(guardians.userId, userId), ne(students.status, "withdrawn"), ne(schools.status, "suspended")))
    .orderBy(asc(schools.name), asc(students.firstName));
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.studentId) ? false : (seen.add(r.studentId), true)))
    .map((r) => ({
      studentId: r.studentId,
      schoolId: r.schoolId,
      school: { name: r.schoolName, slug: r.slug, logoUrl: r.logoUrl, features: r.features, feeSettings: r.feeSettings },
      firstName: r.firstName,
      middleName: r.middleName,
      lastName: r.lastName,
      admissionNo: r.admissionNo,
      classId: r.classId,
      status: r.status,
      relationship: r.relationship,
    }));
}

export async function requireChild(db: DB, userId: string, studentId: string) {
  const child = (await myChildren(db, userId)).find((c) => c.studentId === studentId);
  if (!child) throw new AppError("We couldn't find that child on your account.", "not_found");
  if (!child.school.features.includes("parent_portal")) throw new AppError(`${child.school.name} hasn't switched on the parent app yet.`, "upgrade");
  return child;
}

/** Terms where this child has published results, newest first. */
async function publishedTerms(tx: Tx, studentId: string) {
  const rows = await tx
    .selectDistinct({ termId: scores.termId, classId: scores.classId, termName: terms.name, number: terms.number, session: academicSessions.name, publishedAt: classResults.publishedAt, className: classes.name })
    .from(scores)
    .innerJoin(classResults, and(eq(classResults.termId, scores.termId), eq(classResults.classId, scores.classId), eq(classResults.status, "published")))
    .innerJoin(terms, eq(terms.id, scores.termId))
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .innerJoin(classes, eq(classes.id, scores.classId))
    .where(eq(scores.studentId, studentId));
  return rows.sort((a, b) => (a.session === b.session ? b.number - a.number : b.session.localeCompare(a.session)));
}

/** Announcements a parent of a child in `classId` should see. */
function parentAudience(classId: string | null) {
  return or(
    inArray(announcements.audience, ["everyone", "parents"]),
    classId ? and(eq(announcements.audience, "classes"), sql`${announcements.classIds} @> ${JSON.stringify([classId])}::jsonb`) : sql`false`,
  )!;
}

export async function getParentHome(db: DB, user: { id: string }) {
  const children = await myChildren(db, user.id);
  const today = lagosToday();
  const bySchool = new Map<string, ChildLink[]>();
  for (const c of children) bySchool.set(c.schoolId, [...(bySchool.get(c.schoolId) ?? []), c]);

  const schoolsOut = [];
  for (const [schoolId, kids] of bySchool) {
    const school = kids[0].school;
    if (!school.features.includes("parent_portal")) {
      schoolsOut.push({ schoolId, school, enabled: false as const, children: kids.map((k) => ({ link: k })) });
      continue;
    }
    const data = await withTenant(db, schoolId, async (tx) => {
      const current = await getCurrentTerm(tx);
      const classIds = [...new Set(kids.map((k) => k.classId).filter((x): x is string => !!x))];
      const classRows = classIds.length ? await tx.select({ id: classes.id, name: classes.name }).from(classes).where(inArray(classes.id, classIds)) : [];
      const childData = [];
      for (const k of kids) {
        const [attendance, results, owingRows] = await Promise.all([
          current ? studentAttendanceSummary(tx, k.studentId, current.term.id) : Promise.resolve(null),
          publishedTerms(tx, k.studentId),
          tx.select().from(invoices).where(and(eq(invoices.studentId, k.studentId), inArray(invoices.status, ["unpaid", "partial"]))),
        ]);
        childData.push({
          link: k,
          className: classRows.find((c) => c.id === k.classId)?.name ?? null,
          attendance,
          latestResult: results[0] ?? null,
          owing: owingRows.reduce((n, i) => n + Math.max(0, balanceOf(i)), 0),
          payToken: owingRows.sort((a, b) => balanceOf(b) - balanceOf(a))[0]?.payToken ?? null,
        });
      }
      const audience = or(...kids.map((k) => parentAudience(k.classId)))!;
      const [news, events] = await Promise.all([
        tx
          .select({ a: announcements, readAt: announcementReads.readAt })
          .from(announcements)
          .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, user.id)))
          .where(audience)
          .orderBy(desc(announcements.pinned), desc(announcements.publishedAt))
          .limit(5),
        tx.select().from(calendarEvents).where(and(eq(calendarEvents.forParents, true), gte(calendarEvents.endsOn, today))).orderBy(asc(calendarEvents.startsOn)).limit(4),
      ]);
      return { term: current ? `${current.term.name} · ${current.session.name}` : null, children: childData, news, events };
    });
    schoolsOut.push({ schoolId, school, enabled: true as const, ...data });
  }
  const [{ unread }] = await db.select({ unread: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  return { schools: schoolsOut, unread, childCount: children.length };
}

export async function getChildDetail(db: DB, user: { id: string }, studentId: string) {
  const link = await requireChild(db, user.id, studentId);
  const today = lagosToday();
  return withTenant(db, link.schoolId, async (tx) => {
    const current = await getCurrentTerm(tx);
    const [klass] = link.classId ? await tx.select({ name: classes.name }).from(classes).where(eq(classes.id, link.classId)) : [];
    const [attendance, missed, results, bills, news, events] = await Promise.all([
      current ? studentAttendanceSummary(tx, studentId, current.term.id) : Promise.resolve(null),
      tx
        .select({ date: attendanceDays.date, status: attendanceRecords.status, note: attendanceRecords.note })
        .from(attendanceRecords)
        .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceRecords.dayId))
        .where(and(eq(attendanceRecords.studentId, studentId), inArray(attendanceRecords.status, ["absent", "late", "excused"]), current ? eq(attendanceDays.termId, current.term.id) : sql`true`))
        .orderBy(desc(attendanceDays.date))
        .limit(30),
      publishedTerms(tx, studentId),
      tx.select().from(invoices).where(and(eq(invoices.studentId, studentId), ne(invoices.status, "void"))).orderBy(desc(invoices.createdAt)),
      tx
        .select({ a: announcements, readAt: announcementReads.readAt })
        .from(announcements)
        .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, user.id)))
        .where(parentAudience(link.classId))
        .orderBy(desc(announcements.pinned), desc(announcements.publishedAt))
        .limit(20),
      tx.select().from(calendarEvents).where(and(eq(calendarEvents.forParents, true), gte(calendarEvents.endsOn, today))).orderBy(asc(calendarEvents.startsOn)).limit(10),
    ]);
    const withheld = new Set<string>();
    if (link.school.feeSettings.withholdResults && link.school.features.includes("debtors")) {
      for (const r of results) if ((await owesForTerm(tx, studentId, r.termId)) > 0) withheld.add(r.termId);
    }
    return {
      link,
      className: klass?.name ?? null,
      term: current ? { id: current.term.id, label: `${current.term.name} · ${current.session.name}` } : null,
      attendance,
      missed,
      results: results.map((r) => ({ ...r, withheld: withheld.has(r.termId) })),
      invoices: bills.map((i) => ({ ...i, balance: balanceOf(i) })),
      owing: bills.reduce((n, i) => n + Math.max(0, balanceOf(i)), 0),
      news,
      events,
      canPayOnline: link.school.features.includes("fees_online"),
    };
  });
}

/** For the parent's report card download: is this term's result published, and not held back? */
export async function parentReportCardAccess(db: DB, userId: string, studentId: string, termId: string) {
  const link = await requireChild(db, userId, studentId);
  return withTenant(db, link.schoolId, async (tx) => {
    const term = (await publishedTerms(tx, studentId)).find((t) => t.termId === termId);
    if (!term) throw new AppError("That result isn't published yet.", "not_found");
    if (link.school.feeSettings.withholdResults && link.school.features.includes("debtors") && (await owesForTerm(tx, studentId, termId)) > 0) {
      throw new AppError("This result is being held until the term's school fees are paid.", "forbidden");
    }
    return { link, classId: term.classId };
  });
}

export async function markAnnouncementRead(db: DB, userId: string, schoolId: string, announcementId: string) {
  await withTenant(db, schoolId, (tx) => tx.insert(announcementReads).values({ schoolId, announcementId, userId }).onConflictDoNothing());
}

export async function parentNotifications(db: DB, userId: string) {
  const rows = await db
    .select({ n: notifications, schoolName: schools.name })
    .from(notifications)
    .innerJoin(schools, eq(schools.id, notifications.schoolId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  return rows;
}

export async function markParentNotificationsRead(db: DB, userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
