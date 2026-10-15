import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { academicSessions, classes, enrollments, guardians, schools, studentGuardians, students, STUDENT_STATUSES } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { NIGERIAN_STATES } from "../nigeria";
import { requireWithinLimit } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { studentScope } from "./academics";
import { recordAudit } from "./audit";
import { markOnboarding } from "./onboarding";

// ---------- Validation (shared by the form and the Excel import) ----------

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\+234\d{10}$/.test(digits)) return digits;
  if (/^\+\d{7,15}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits) && /^[789]/.test(digits)) return `+234${digits}`;
  return null;
}

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const optionalDate = z.preprocess(
  blankToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.")
    .nullable()
    .optional(),
);

export const guardianInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the parent or guardian's name.").max(120),
  relationship: z.string().trim().min(2).max(40).default("Parent"),
  phone: z.preprocess(blankToNull, z.string().nullable().optional()).transform((v, ctx) => {
    if (!v) return null;
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 0803 123 4567." });
      return z.NEVER;
    }
    return normalized;
  }),
  email: z.preprocess(blankToNull, z.string().trim().toLowerCase().email("Enter a valid email address.").nullable().optional()),
  occupation: optionalText(120),
  address: optionalText(300),
});

export type GuardianInput = z.infer<typeof guardianInputSchema>;

export const studentInputSchema = z.object({
  firstName: z.string().trim().min(1, "Enter the first name.").max(60),
  middleName: optionalText(60),
  lastName: z.string().trim().min(1, "Enter the surname.").max(60),
  gender: z.enum(["male", "female"], { message: "Choose male or female." }),
  dateOfBirth: optionalDate,
  admittedOn: optionalDate,
  admissionNo: optionalText(40),
  classId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
  stateOfOrigin: z.preprocess(blankToNull, z.string().nullable().optional()).refine(
    (v) => v == null || (NIGERIAN_STATES as readonly string[]).includes(v) || v.length <= 60,
    "Choose a state.",
  ),
  lga: optionalText(80),
  religion: optionalText(40),
  bloodGroup: z.preprocess(blankToNull, z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable().optional()),
  genotype: z.preprocess(blankToNull, z.enum(["AA", "AS", "AC", "SS", "SC", "CC"]).nullable().optional()),
  address: optionalText(300),
  medicalNotes: optionalText(2000),
});

export type StudentInput = z.infer<typeof studentInputSchema>;

export function fullName(s: { firstName: string; middleName?: string | null; lastName: string }) {
  return [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
}

// ---------- Helpers ----------

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function defaultPrefix(schoolName: string) {
  const letters = schoolName
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(the|of|and|&)$/i.test(w))
    .map((w) => w[0].toUpperCase())
    .join("");
  return (letters || "STU").slice(0, 4);
}

/** Atomically reserves the next admission number, e.g. GFC/2026/0042. */
export async function nextAdmissionNo(tx: Tx, schoolId: string) {
  const [row] = await tx
    .update(schools)
    .set({ nextAdmissionSeq: sql`${schools.nextAdmissionSeq} + 1` })
    .where(eq(schools.id, schoolId))
    .returning({ seq: schools.nextAdmissionSeq, prefix: schools.admissionPrefix, name: schools.name });
  const seq = row.seq - 1;
  return `${row.prefix || defaultPrefix(row.name)}/${new Date().getFullYear()}/${String(seq).padStart(4, "0")}`;
}

async function activeStudentCount(tx: Tx) {
  const [row] = await tx.select({ n: count() }).from(students).where(eq(students.status, "active"));
  return row?.n ?? 0;
}

async function currentSessionId(tx: Tx) {
  const [s] = await tx.select({ id: academicSessions.id }).from(academicSessions).where(eq(academicSessions.isCurrent, true)).limit(1);
  return s?.id ?? null;
}

async function assertClass(tx: Tx, classId: string | null | undefined) {
  if (!classId) return null;
  const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
  if (!cls) throw new AppError("That class wasn't found.", "invalid");
  return cls;
}

/** Finds a guardian by phone so siblings share one parent record, or creates one. */
export async function upsertGuardian(tx: Tx, schoolId: string, input: GuardianInput) {
  if (input.phone) {
    const [existing] = await tx.select().from(guardians).where(eq(guardians.phone, input.phone));
    if (existing) {
      const [updated] = await tx
        .update(guardians)
        .set({
          name: input.name || existing.name,
          email: input.email ?? existing.email,
          occupation: input.occupation ?? existing.occupation,
          address: input.address ?? existing.address,
        })
        .where(eq(guardians.id, existing.id))
        .returning();
      return updated;
    }
  }
  const [created] = await tx
    .insert(guardians)
    .values({ schoolId, name: input.name, phone: input.phone, email: input.email ?? null, occupation: input.occupation ?? null, address: input.address ?? null })
    .returning();
  return created;
}

async function enroll(tx: Tx, schoolId: string, studentId: string, classId: string | null) {
  const sessionId = await currentSessionId(tx);
  if (!sessionId || !classId) return;
  await tx
    .update(enrollments)
    .set({ outcome: "transferred" })
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.sessionId, sessionId), eq(enrollments.outcome, "current")));
  await tx.insert(enrollments).values({ schoolId, studentId, sessionId, classId, outcome: "current" });
}

/**
 * Inserts one student (and their guardians) inside an existing tenant transaction.
 * Used by both the single-student form and the bulk import.
 */
export async function insertStudent(tx: Tx, schoolId: string, input: StudentInput, guardianInputs: GuardianInput[]) {
  await assertClass(tx, input.classId);
  const admissionNo = input.admissionNo || (await nextAdmissionNo(tx, schoolId));
  const [dupe] = await tx.select({ id: students.id }).from(students).where(eq(students.admissionNo, admissionNo));
  if (dupe) throw new AppError(`Admission number ${admissionNo} is already used.`, "conflict");

  const [student] = await tx
    .insert(students)
    .values({
      schoolId,
      admissionNo,
      firstName: input.firstName,
      middleName: input.middleName ?? null,
      lastName: input.lastName,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth ?? null,
      admittedOn: input.admittedOn ?? new Date().toISOString().slice(0, 10),
      classId: input.classId ?? null,
      stateOfOrigin: input.stateOfOrigin ?? null,
      lga: input.lga ?? null,
      religion: input.religion ?? null,
      bloodGroup: input.bloodGroup ?? null,
      genotype: input.genotype ?? null,
      address: input.address ?? null,
      medicalNotes: input.medicalNotes ?? null,
    })
    .returning();

  for (const [i, g] of guardianInputs.entries()) {
    const guardian = await upsertGuardian(tx, schoolId, g);
    await tx
      .insert(studentGuardians)
      .values({ schoolId, studentId: student.id, guardianId: guardian.id, relationship: g.relationship, isPrimary: i === 0 })
      .onConflictDoNothing();
  }
  await enroll(tx, schoolId, student.id, input.classId ?? null);
  return student;
}

// ---------- Reading ----------

export type StudentFilters = { q?: string; classId?: string; status?: (typeof STUDENT_STATUSES)[number] | "all"; page?: number };
export const STUDENT_PAGE_SIZE = 50;

export async function listStudents(db: DB, access: Access, filters: StudentFilters = {}) {
  requirePermission(access, "students:view");
  return withTenant(db, access.school.id, async (tx) => {
    const scope = await studentScope(tx, access);
    const conditions: SQL[] = [];
    if (scope !== "all") {
      if (scope.length === 0) return { rows: [], total: 0, scoped: true };
      conditions.push(inArray(students.classId, scope));
    }
    const status = filters.status ?? "active";
    if (status !== "all") conditions.push(eq(students.status, status));
    if (filters.classId) conditions.push(eq(students.classId, filters.classId));
    if (filters.q?.trim()) {
      const term = `%${filters.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      conditions.push(
        or(
          ilike(students.firstName, term),
          ilike(students.lastName, term),
          ilike(students.middleName, term),
          ilike(students.admissionNo, term),
          sql`(${students.firstName} || ' ' || ${students.lastName}) ilike ${term}`,
        )!,
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const page = Math.max(1, filters.page ?? 1);
    const [rows, [{ n }]] = await Promise.all([
      tx
        .select({ student: students, className: classes.name })
        .from(students)
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(where)
        .orderBy(asc(classes.name), asc(students.lastName), asc(students.firstName))
        .limit(STUDENT_PAGE_SIZE)
        .offset((page - 1) * STUDENT_PAGE_SIZE),
      tx.select({ n: count() }).from(students).where(where),
    ]);

    const ids = rows.map((r) => r.student.id);
    const primaryGuardians = ids.length
      ? await tx
          .select({ studentId: studentGuardians.studentId, name: guardians.name, phone: guardians.phone })
          .from(studentGuardians)
          .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
          .where(and(inArray(studentGuardians.studentId, ids), eq(studentGuardians.isPrimary, true)))
      : [];
    const guardianBy = new Map(primaryGuardians.map((g) => [g.studentId, g]));
    return {
      rows: rows.map((r) => ({ ...r.student, className: r.className, guardian: guardianBy.get(r.student.id) ?? null })),
      total: n,
      scoped: scope !== "all",
    };
  });
}

export async function getStudent(db: DB, access: Access, studentId: string) {
  requirePermission(access, "students:view");
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ student: students, className: classes.name })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(eq(students.id, studentId));
    if (!row) return null;
    const scope = await studentScope(tx, access);
    if (scope !== "all" && (!row.student.classId || !scope.includes(row.student.classId))) return null;

    const [guardianRows, history] = await Promise.all([
      tx
        .select({ guardian: guardians, relationship: studentGuardians.relationship, isPrimary: studentGuardians.isPrimary })
        .from(studentGuardians)
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .where(eq(studentGuardians.studentId, studentId))
        .orderBy(desc(studentGuardians.isPrimary)),
      tx
        .select({ id: enrollments.id, outcome: enrollments.outcome, createdAt: enrollments.createdAt, className: classes.name, sessionName: academicSessions.name })
        .from(enrollments)
        .innerJoin(classes, eq(classes.id, enrollments.classId))
        .innerJoin(academicSessions, eq(academicSessions.id, enrollments.sessionId))
        .where(eq(enrollments.studentId, studentId))
        .orderBy(desc(enrollments.createdAt)),
    ]);

    // Siblings: other students sharing any guardian.
    const guardianIds = guardianRows.map((g) => g.guardian.id);
    const siblings = guardianIds.length
      ? await tx
          .selectDistinct({ id: students.id, firstName: students.firstName, lastName: students.lastName, className: classes.name })
          .from(studentGuardians)
          .innerJoin(students, eq(students.id, studentGuardians.studentId))
          .leftJoin(classes, eq(classes.id, students.classId))
          .where(and(inArray(studentGuardians.guardianId, guardianIds), sql`${students.id} <> ${studentId}`))
      : [];

    const student = { ...row.student, className: row.className };
    if (!can(access, "students:view_medical")) {
      student.medicalNotes = null;
      student.bloodGroup = null;
      student.genotype = null;
    }
    return { student, guardians: guardianRows, history, siblings };
  });
}

// ---------- Writing ----------

export async function createStudent(db: DB, access: Access, input: StudentInput, guardianInputs: GuardianInput[], ip?: string | null) {
  requirePermission(access, "students:create");
  return withTenant(db, access.school.id, async (tx) => {
    requireWithinLimit(access.plan, "students", await activeStudentCount(tx));
    const student = await insertStudent(tx, access.school.id, input, guardianInputs);
    await markOnboarding(tx, access.school.id, "students");
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "student.created",
      summary: `Added ${fullName(student)} (${student.admissionNo})`,
      entityType: "student",
      entityId: student.id,
    });
    return student;
  });
}

export async function updateStudent(db: DB, access: Access, studentId: string, input: StudentInput, ip?: string | null) {
  requirePermission(access, "students:update");
  await withTenant(db, access.school.id, async (tx) => {
    const [before] = await tx.select().from(students).where(eq(students.id, studentId));
    if (!before) throw new AppError("That student wasn't found.", "not_found");
    await assertClass(tx, input.classId);
    if (input.admissionNo && input.admissionNo !== before.admissionNo) {
      const [dupe] = await tx.select({ id: students.id }).from(students).where(eq(students.admissionNo, input.admissionNo));
      if (dupe) throw new AppError(`Admission number ${input.admissionNo} is already used.`, "conflict");
    }
    const canMedical = can(access, "students:view_medical");
    await tx
      .update(students)
      .set({
        admissionNo: input.admissionNo || before.admissionNo,
        firstName: input.firstName,
        middleName: input.middleName ?? null,
        lastName: input.lastName,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth ?? null,
        admittedOn: input.admittedOn ?? before.admittedOn,
        classId: input.classId ?? null,
        stateOfOrigin: input.stateOfOrigin ?? null,
        lga: input.lga ?? null,
        religion: input.religion ?? null,
        address: input.address ?? null,
        // People who can't see medical details can't overwrite them either.
        ...(canMedical ? { bloodGroup: input.bloodGroup ?? null, genotype: input.genotype ?? null, medicalNotes: input.medicalNotes ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(students.id, studentId));
    if ((input.classId ?? null) !== before.classId) await enroll(tx, access.school.id, studentId, input.classId ?? null);
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "student.updated",
      summary: `Updated ${fullName(input)}'s record`,
      entityType: "student",
      entityId: studentId,
      meta: before.classId !== (input.classId ?? null) ? { classChanged: true } : undefined,
    });
  });
}

export async function setStudentStatus(
  db: DB,
  access: Access,
  studentId: string,
  status: (typeof STUDENT_STATUSES)[number],
  ip?: string | null,
) {
  requirePermission(access, "students:deactivate");
  await withTenant(db, access.school.id, async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, studentId));
    if (!student) throw new AppError("That student wasn't found.", "not_found");
    if (status === "active" && student.status !== "active") requireWithinLimit(access.plan, "students", await activeStudentCount(tx));
    await tx.update(students).set({ status, updatedAt: new Date() }).where(eq(students.id, studentId));
    const sessionId = await currentSessionId(tx);
    if (sessionId && (status === "withdrawn" || status === "graduated")) {
      await tx
        .update(enrollments)
        .set({ outcome: status })
        .where(and(eq(enrollments.studentId, studentId), eq(enrollments.sessionId, sessionId), eq(enrollments.outcome, "current")));
    }
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "student.status",
      summary: `Marked ${fullName(student)} as ${status}`,
      entityType: "student",
      entityId: studentId,
    });
  });
}

export async function addGuardian(db: DB, access: Access, studentId: string, input: GuardianInput, ip?: string | null) {
  requirePermission(access, "students:update");
  await withTenant(db, access.school.id, async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, studentId));
    if (!student) throw new AppError("That student wasn't found.", "not_found");
    const guardian = await upsertGuardian(tx, access.school.id, input);
    const [{ n }] = await tx.select({ n: count() }).from(studentGuardians).where(eq(studentGuardians.studentId, studentId));
    await tx
      .insert(studentGuardians)
      .values({ schoolId: access.school.id, studentId, guardianId: guardian.id, relationship: input.relationship, isPrimary: n === 0 })
      .onConflictDoUpdate({ target: [studentGuardians.studentId, studentGuardians.guardianId], set: { relationship: input.relationship } });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "guardian.linked",
      summary: `Linked ${guardian.name} to ${fullName(student)}`,
      entityType: "student",
      entityId: studentId,
    });
  });
}

export async function unlinkGuardian(db: DB, access: Access, studentId: string, guardianId: string, ip?: string | null) {
  requirePermission(access, "students:update");
  await withTenant(db, access.school.id, async (tx) => {
    const [link] = await tx
      .delete(studentGuardians)
      .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardianId)))
      .returning();
    if (!link) throw new AppError("That guardian isn't linked to this student.", "not_found");
    if (link.isPrimary) {
      const [next] = await tx.select().from(studentGuardians).where(eq(studentGuardians.studentId, studentId)).limit(1);
      if (next) await tx.update(studentGuardians).set({ isPrimary: true }).where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, next.guardianId)));
    }
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "guardian.unlinked", summary: "Removed a guardian link", entityType: "student", entityId: studentId });
  });
}

export async function setPrimaryGuardian(db: DB, access: Access, studentId: string, guardianId: string) {
  requirePermission(access, "students:update");
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(studentGuardians).set({ isPrimary: false }).where(eq(studentGuardians.studentId, studentId));
    const [link] = await tx
      .update(studentGuardians)
      .set({ isPrimary: true })
      .where(and(eq(studentGuardians.studentId, studentId), eq(studentGuardians.guardianId, guardianId)))
      .returning();
    if (!link) throw new AppError("That guardian isn't linked to this student.", "not_found");
  });
}

export async function setAdmissionPrefix(db: DB, access: Access, prefix: string | null) {
  requirePermission(access, "school:update");
  await withTenant(db, access.school.id, (tx) =>
    tx
      .update(schools)
      .set({ admissionPrefix: prefix?.trim().toUpperCase() || null })
      .where(eq(schools.id, access.school.id)),
  );
}
