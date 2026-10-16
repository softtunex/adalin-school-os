import { randomInt } from "node:crypto";
import { and, asc, count, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { classes, loginAttempts, plans, schools, students, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/crypto";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { studentScope } from "./academics";

/*
 * Student logins. Students rarely have email or phone, so they sign in with the school's
 * code, their admission number and a password. The school prints a slip with a temporary
 * password; students choose their own the first time they sign in.
 */

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function studentUsername(slug: string, admissionNo: string) {
  return `${slug}/${admissionNo}`.trim().toLowerCase();
}

export function tempPassword() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(0, ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function studentLoginStatus(db: DB, access: Access, classId?: string | null) {
  requirePermission(access, "students:view");
  return withTenant(db, access.school.id, async (tx) => {
    const scope = await studentScope(tx, access);
    const where = [eq(students.status, "active")];
    if (classId) where.push(eq(students.classId, classId));
    if (scope !== "all") where.push(scope.length ? inArray(students.classId, scope) : sql`false`);
    const rows = await tx
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo, className: classes.name, hasLogin: isNotNull(students.userId), mustChange: users.mustChangePassword })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(users, eq(users.id, students.userId))
      .where(and(...where))
      .orderBy(asc(classes.name), asc(students.lastName), asc(students.firstName));
    return rows.map((r) => ({ ...r, hasLogin: !!r.hasLogin, signedIn: r.hasLogin ? r.mustChange === false : false }));
  });
}

/**
 * Creates logins for students who don't have one (or resets the chosen ones) and returns
 * each temporary password once, for printing. Passwords are never stored in readable form.
 */
export async function issueStudentLogins(db: DB, access: Access, input: { studentIds: string[]; reset?: boolean }, ip?: string | null) {
  requirePermission(access, "students:update");
  if (!input.studentIds.length) throw new AppError("Choose at least one student.");
  if (input.studentIds.length > 500) throw new AppError("Issue logins for up to 500 students at a time.");
  const slips = await withTenant(db, access.school.id, async (tx) => {
    const scope = await studentScope(tx, access);
    const rows = await tx
      .select({ s: students, className: classes.name })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(and(inArray(students.id, input.studentIds), eq(students.status, "active")));
    if (scope !== "all" && rows.some((r) => !r.s.classId || !scope.includes(r.s.classId))) throw new AppError("You can only issue logins for children you teach.", "forbidden");
    return rows
      .filter((r) => input.reset || !r.s.userId)
      .map((r) => ({ studentId: r.s.id, userId: r.s.userId, name: `${r.s.firstName} ${r.s.lastName}`, admissionNo: r.s.admissionNo, className: r.className, password: tempPassword() }));
  });
  // Users are platform rows: written as the owner role, then linked inside the school.
  for (const slip of slips) {
    const hash = await hashPassword(slip.password);
    if (slip.userId) {
      await db.update(users).set({ passwordHash: hash, mustChangePassword: true }).where(eq(users.id, slip.userId));
    } else {
      const username = studentUsername(access.school.slug, slip.admissionNo);
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
      const userId = existing
        ? (await db.update(users).set({ passwordHash: hash, mustChangePassword: true, name: slip.name }).where(eq(users.id, existing.id)).returning({ id: users.id }))[0].id
        : (await db.insert(users).values({ name: slip.name, username, passwordHash: hash, mustChangePassword: true }).returning({ id: users.id }))[0].id;
      await withTenant(db, access.school.id, (tx) => tx.update(students).set({ userId }).where(eq(students.id, slip.studentId)));
    }
  }
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: input.reset ? "students.logins_reset" : "students.logins_issued",
      summary: `${input.reset ? "Reset" : "Issued"} student logins for ${slips.length} student${slips.length === 1 ? "" : "s"}`,
    }),
  );
  return slips.map((s) => ({ studentId: s.studentId, name: s.name, admissionNo: s.admissionNo, className: s.className, password: s.password }));
}

const WINDOW = 15;

export async function authenticateStudent(db: DB, input: { school: string; admissionNo: string; password: string }, ip: string | null) {
  const slug = input.school.trim().toLowerCase();
  const username = studentUsername(slug, input.admissionNo);
  const keys = [`student:${username}`, ...(ip ? [`ip:${ip}`] : [])];
  const since = new Date(Date.now() - WINDOW * 60_000);
  const [{ n }] = await db.select({ n: count() }).from(loginAttempts).where(and(eq(loginAttempts.key, keys[0]), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
  if (n >= 5) throw new AppError(`Too many tries. Wait ${WINDOW} minutes, or ask your teacher to reset your password.`, "rate_limited");
  const [row] = await db
    .select({ user: users, studentId: students.id, schoolStatus: schools.status, features: plans.features })
    .from(users)
    .innerJoin(students, eq(students.userId, users.id))
    .innerJoin(schools, eq(schools.id, students.schoolId))
    .innerJoin(plans, eq(plans.key, schools.planKey))
    .where(and(eq(users.username, username), eq(schools.slug, slug), eq(students.status, "active")))
    .limit(1);
  const ok = row?.user.passwordHash ? await verifyPassword(row.user.passwordHash, input.password) : (await burnPasswordCheck(input.password), false);
  await db.insert(loginAttempts).values(keys.map((key) => ({ key, succeeded: ok })));
  if (!ok || !row) throw new AppError("That school code, admission number and password don't match.", "invalid");
  if (row.schoolStatus === "suspended") throw new AppError("Your school's account is paused. Please speak to your school.", "forbidden");
  return { userId: row.user.id, mustChangePassword: row.user.mustChangePassword };
}

/** First sign-in: replace the printed temporary password with the student's own. */
export async function setOwnPassword(db: DB, userId: string, newPassword: string) {
  if (newPassword.length < 6) throw new AppError("Use at least 6 characters.");
  await db.update(users).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false }).where(eq(users.id, userId));
}

