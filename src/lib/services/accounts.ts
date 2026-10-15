import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { RESET_TTL_MINUTES, SESSION_TTL_DAYS } from "../config";
import { burnPasswordCheck, hashPassword, hashToken, newToken, verifyPassword } from "../auth/crypto";
import type { DB, Tx } from "../db/client";
import { loginAttempts, membershipRoles, memberships, passwordResets, schools, sessions, users } from "../db/schema";
import { AppError } from "../errors";
import { recordAudit } from "./audit";
import { provisionSystemRoles, uniqueSlug } from "./schools";

export type RegisterInput = { name: string; email: string; password: string; schoolName: string };

export async function findUserByEmail(db: DB, email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return user ?? null;
}

/** Creates the owner's account and their school, on the Free plan. */
export async function registerSchoolOwner(db: DB, input: RegisterInput) {
  if (await findUserByEmail(db, input.email)) {
    throw new AppError("An account with this email already exists. Log in instead.", "conflict");
  }
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ name: input.name, email: input.email, passwordHash }).returning();
    const school = await createSchoolForUser(tx, user, input.schoolName);
    return { user, school };
  });
}

/** Creates a school on the Free plan with the given user as its Proprietor. */
export async function createSchoolForUser(tx: Tx, user: { id: string; name: string }, schoolName: string) {
  const slug = await uniqueSlug(tx, schoolName);
  const [school] = await tx.insert(schools).values({ name: schoolName, slug, planKey: "free" }).returning();
  const schoolRoles = await provisionSystemRoles(tx, school.id);
  const ownerRole = schoolRoles.find((r) => r.key === "owner")!;
  const [membership] = await tx
    .insert(memberships)
    .values({ schoolId: school.id, userId: user.id, jobTitle: "Proprietor" })
    .returning();
  await tx.insert(membershipRoles).values({ schoolId: school.id, membershipId: membership.id, roleId: ownerRole.id });
  await tx.update(users).set({ lastSchoolId: school.id }).where(eq(users.id, user.id));
  await recordAudit(tx, school.id, { userId: user.id, name: user.name }, {
    action: "school.created",
    summary: `${user.name} created ${school.name}`,
    entityType: "school",
    entityId: school.id,
  });
  return school;
}

export async function addSchool(db: DB, user: { id: string; name: string }, schoolName: string) {
  return db.transaction((tx) => createSchoolForUser(tx, user, schoolName));
}

const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 30;
const WINDOW_MINUTES = 15;

async function recentFailures(db: DB, key: string) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
  return row?.n ?? 0;
}

export async function authenticate(db: DB, email: string, password: string, ip: string | null) {
  const accountKey = `email:${email.toLowerCase()}`;
  const ipKey = ip ? `ip:${ip}` : null;
  if (
    (await recentFailures(db, accountKey)) >= MAX_FAILURES_PER_ACCOUNT ||
    (ipKey && (await recentFailures(db, ipKey)) >= MAX_FAILURES_PER_IP)
  ) {
    throw new AppError(`Too many failed attempts. Wait ${WINDOW_MINUTES} minutes or reset your password.`, "rate_limited");
  }

  const user = await findUserByEmail(db, email);
  const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : (await burnPasswordCheck(password), false);

  const keys = ipKey ? [accountKey, ipKey] : [accountKey];
  await db.insert(loginAttempts).values(keys.map((key) => ({ key, succeeded: ok })));
  if (!ok || !user) throw new AppError("That email and password don't match.", "invalid");
  return user;
}

export async function createSession(db: DB, userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export async function getUserBySessionToken(db: DB, token: string) {
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function revokeSession(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function revokeAllSessions(db: DB, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Returns a reset token for the email, or null when no account exists. Callers must not reveal which. */
export async function createPasswordReset(db: DB, email: string) {
  const user = await findUserByEmail(db, email);
  if (!user) return null;
  const token = newToken();
  await db.insert(passwordResets).values({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
  });
  return { token, user };
}

export async function resetPassword(db: DB, token: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  if (!reset) throw new AppError("This reset link has expired or was already used. Request a new one.", "invalid");
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, reset.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.tokenHash, tokenHash));
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
  });
  return reset.userId;
}

export async function changePassword(db: DB, userId: string, currentPassword: string, newPassword: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError("Your current password is incorrect.", "invalid");
  }
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
}
