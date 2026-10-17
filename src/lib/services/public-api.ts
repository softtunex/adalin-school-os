import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db/client";
import { academicSessions, attendanceDays, INVOICE_STATUSES, attendanceRecords, classes, classLevels, guardians, invoices, membershipRoles, memberships, payments, roles, schools, studentGuardians, students, terms, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { ApiError, requireScope, type ApiContext } from "./api-keys";

/*
 * The public API's reads. Field names are snake_case and stable: change them only in a new
 * version (/api/v2). Amounts are in kobo.
 */

type Query = URLSearchParams;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function paging(q: Query) {
  const page = Math.max(1, Number(q.get("page")) || 1);
  const perPage = Math.min(100, Math.max(1, Number(q.get("per_page")) || 50));
  return { page, perPage, offset: (page - 1) * perPage };
}

function uuidParam(q: Query, name: string) {
  const v = q.get(name);
  if (v === null) return undefined;
  if (!UUID.test(v)) throw new ApiError(400, "invalid_param", `${name} must be an id.`);
  return v;
}

function dayParam(q: Query, name: string) {
  const v = q.get(name);
  if (v === null) return undefined;
  if (!DAY.test(v)) throw new ApiError(400, "invalid_param", `${name} must be a date like 2026-09-14.`);
  return v;
}

function oneOf<T extends string>(q: Query, name: string, allowed: readonly T[]) {
  const v = q.get(name);
  if (v === null) return undefined;
  if (!allowed.includes(v as T)) throw new ApiError(400, "invalid_param", `${name} must be one of: ${allowed.join(", ")}.`);
  return v as T;
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

export async function apiSchool(db: DB, ctx: ApiContext) {
  const [s] = await db.select().from(schools).where(eq(schools.id, ctx.schoolId));
  return { data: { id: s.id, name: s.name, code: s.slug, email: s.email, phone: s.phone, address: s.address, city: s.city, state: s.state, country: s.country, logo_url: s.logoUrl, plan: s.planKey } };
}

const studentOut = (s: typeof students.$inferSelect) => ({
  id: s.id,
  admission_no: s.admissionNo,
  first_name: s.firstName,
  middle_name: s.middleName,
  last_name: s.lastName,
  gender: s.gender,
  date_of_birth: s.dateOfBirth,
  admitted_on: s.admittedOn,
  status: s.status,
  class_id: s.classId,
  created_at: iso(s.createdAt),
  updated_at: iso(s.updatedAt),
});

export async function apiStudents(db: DB, ctx: ApiContext, q: Query) {
  requireScope(ctx, "students:read");
  const { page, perPage, offset } = paging(q);
  const where: SQL[] = [];
  const status = oneOf(q, "status", ["active", "graduated", "withdrawn", "suspended"] as const);
  if (status) where.push(eq(students.status, status));
  const classId = uuidParam(q, "class_id");
  if (classId) where.push(eq(students.classId, classId));
  const since = q.get("updated_since");
  if (since !== null) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_param", "updated_since must be a date and time, e.g. 2026-09-14T08:00:00Z.");
    where.push(gte(students.updatedAt, d));
  }
  return withTenant(db, ctx.schoolId, async (tx) => {
    const [[{ total }], rows] = await Promise.all([
      tx.select({ total: count() }).from(students).where(and(...where)),
      tx.select().from(students).where(and(...where)).orderBy(asc(students.admissionNo)).limit(perPage).offset(offset),
    ]);
    return { data: rows.map(studentOut), page, per_page: perPage, total };
  });
}

export async function apiStudent(db: DB, ctx: ApiContext, id: string) {
  requireScope(ctx, "students:read");
  if (!UUID.test(id)) throw new ApiError(404, "not_found", "No student with that id.");
  return withTenant(db, ctx.schoolId, async (tx) => {
    const [s] = await tx.select().from(students).where(eq(students.id, id));
    if (!s) throw new ApiError(404, "not_found", "No student with that id.");
    const parents = await tx
      .select({ g: guardians, relationship: studentGuardians.relationship, isPrimary: studentGuardians.isPrimary })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(eq(studentGuardians.studentId, id));
    return {
      data: {
        ...studentOut(s),
        parents: parents.map((p) => ({ id: p.g.id, name: p.g.name, phone: p.g.phone, email: p.g.email, relationship: p.relationship, is_primary: p.isPrimary })),
      },
    };
  });
}

export async function apiClasses(db: DB, ctx: ApiContext) {
  requireScope(ctx, "academics:read");
  return withTenant(db, ctx.schoolId, async (tx) => {
    const rows = await tx
      .select({ c: classes, level: classLevels.name, section: classLevels.section, students: sql<number>`(select count(*) from students s where s.class_id = ${classes.id} and s.status = 'active')`.mapWith(Number) })
      .from(classes)
      .innerJoin(classLevels, eq(classLevels.id, classes.levelId))
      .where(eq(classes.isActive, true))
      .orderBy(asc(classLevels.sort), asc(classes.name));
    return { data: rows.map(({ c, level, section, students: n }) => ({ id: c.id, name: c.name, level, section, arm: c.arm, students: n })) };
  });
}

export async function apiTerms(db: DB, ctx: ApiContext) {
  requireScope(ctx, "academics:read");
  return withTenant(db, ctx.schoolId, async (tx) => {
    const rows = await tx.select({ t: terms, session: academicSessions.name }).from(terms).innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId)).orderBy(desc(terms.startsOn));
    return { data: rows.map(({ t, session }) => ({ id: t.id, name: t.name, session, number: t.number, starts_on: t.startsOn, ends_on: t.endsOn, is_current: t.isCurrent })) };
  });
}

export async function apiStaff(db: DB, ctx: ApiContext) {
  requireScope(ctx, "staff:read");
  return withTenant(db, ctx.schoolId, async (tx) => {
    const rows = await tx
      .select({ m: memberships, name: users.name, email: users.email, phone: users.phone })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.status, "active"), sql`${memberships.supportUntil} is null`))
      .orderBy(asc(users.name));
    const assigned = rows.length
      ? await tx
          .select({ membershipId: membershipRoles.membershipId, name: roles.name, kind: roles.kind })
          .from(membershipRoles)
          .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
          .where(inArray(membershipRoles.membershipId, rows.map((r) => r.m.id)))
      : [];
    return {
      data: rows
        .map((r) => ({ r, roles: assigned.filter((a) => a.membershipId === r.m.id) }))
        .filter(({ roles: rs }) => rs.some((x) => x.kind === "staff"))
        .map(({ r, roles: rs }) => ({ id: r.m.id, name: r.name, email: r.email, phone: r.phone, job_title: r.m.jobTitle, roles: rs.map((x) => x.name), joined_at: iso(r.m.createdAt) })),
    };
  });
}

export async function apiInvoices(db: DB, ctx: ApiContext, q: Query) {
  requireScope(ctx, "fees:read");
  const { page, perPage, offset } = paging(q);
  const where: SQL[] = [];
  const status = oneOf(q, "status", INVOICE_STATUSES);
  if (status) where.push(sql`${invoices.status} = ${status}`);
  const studentId = uuidParam(q, "student_id");
  if (studentId) where.push(eq(invoices.studentId, studentId));
  const termId = uuidParam(q, "term_id");
  if (termId) where.push(eq(invoices.termId, termId));
  return withTenant(db, ctx.schoolId, async (tx) => {
    const [[{ total }], rows] = await Promise.all([
      tx.select({ total: count() }).from(invoices).where(and(...where)),
      tx.select().from(invoices).where(and(...where)).orderBy(desc(invoices.createdAt)).limit(perPage).offset(offset),
    ]);
    return {
      data: rows.map((i) => ({
        id: i.id,
        number: i.number,
        student_id: i.studentId,
        term_id: i.termId,
        title: i.title,
        status: i.status,
        due_on: i.dueOn,
        charges_kobo: i.chargesKobo,
        discount_kobo: i.discountKobo,
        paid_kobo: i.paidKobo,
        balance_kobo: i.chargesKobo - i.discountKobo - i.paidKobo,
        created_at: iso(i.createdAt),
      })),
      page,
      per_page: perPage,
      total,
    };
  });
}

export async function apiPayments(db: DB, ctx: ApiContext, q: Query) {
  requireScope(ctx, "fees:read");
  const { page, perPage, offset } = paging(q);
  const where: SQL[] = [];
  const from = dayParam(q, "from");
  if (from) where.push(gte(payments.paidOn, from));
  const to = dayParam(q, "to");
  if (to) where.push(lte(payments.paidOn, to));
  const studentId = uuidParam(q, "student_id");
  if (studentId) where.push(eq(payments.studentId, studentId));
  return withTenant(db, ctx.schoolId, async (tx) => {
    const [[{ total }], rows] = await Promise.all([
      tx.select({ total: count() }).from(payments).where(and(...where)),
      tx.select().from(payments).where(and(...where)).orderBy(desc(payments.paidOn), desc(payments.createdAt)).limit(perPage).offset(offset),
    ]);
    return {
      data: rows.map((p) => ({
        id: p.id,
        invoice_id: p.invoiceId,
        student_id: p.studentId,
        amount_kobo: p.amountKobo,
        method: p.method,
        reference: p.reference,
        receipt_no: p.receiptNo,
        paid_on: p.paidOn,
        status: p.status,
        created_at: iso(p.createdAt),
      })),
      page,
      per_page: perPage,
      total,
    };
  });
}

export async function apiAttendance(db: DB, ctx: ApiContext, q: Query) {
  requireScope(ctx, "attendance:read");
  const date = dayParam(q, "date");
  if (!date) throw new ApiError(400, "invalid_param", "Send date, e.g. ?date=2026-09-14.");
  const classId = uuidParam(q, "class_id");
  return withTenant(db, ctx.schoolId, async (tx) => {
    const rows = await tx
      .select({ classId: attendanceDays.classId, studentId: attendanceRecords.studentId, status: attendanceRecords.status, note: attendanceRecords.note })
      .from(attendanceRecords)
      .innerJoin(attendanceDays, eq(attendanceDays.id, attendanceRecords.dayId))
      .where(and(eq(attendanceDays.date, date), classId ? eq(attendanceDays.classId, classId) : undefined));
    return { data: rows.map((r) => ({ date, class_id: r.classId, student_id: r.studentId, status: r.status, note: r.note })) };
  });
}
