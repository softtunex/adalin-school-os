import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { guardians, loginAttempts, loginCodes, users } from "../db/schema";
import { AppError } from "../errors";
import { normalizePhone } from "./students";

/*
 * Passwordless login for parents. A parent types the phone number or email the school has
 * on file; we send a 6-digit code. One account then covers every child at every school
 * that lists that number or email.
 */

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const SENDS_PER_WINDOW = 3;
const IP_SENDS_PER_HOUR = 12;

/**
 * Test sign-in for parents: codes shown on screen and a fixed code. On in development; in a
 * production build only when ALLOW_TEST_LOGIN_CODES=1 (CI and demo servers). Never on the live site.
 */
export function testLoginCodesAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_LOGIN_CODES === "1";
}

const FIXED_TEST_CODE = "123456";

export type Destination = { kind: "phone" | "email"; value: string };

export function parseDestination(raw: string): Destination | null {
  const t = raw.trim();
  if (t.includes("@")) {
    const email = t.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? { kind: "email", value: email } : null;
  }
  const phone = normalizePhone(t);
  return phone ? { kind: "phone", value: phone } : null;
}

function hashCode(destination: string, code: string) {
  return createHash("sha256").update(`${process.env.SESSION_SECRET ?? "school-os"}:${destination}:${code}`).digest("hex");
}

/** Guardians across all schools that match, read as the owner role (this is how a parent finds their schools). */
async function matchingGuardians(db: DB, d: Destination) {
  return db
    .select({ id: guardians.id, schoolId: guardians.schoolId, name: guardians.name, userId: guardians.userId })
    .from(guardians)
    .where(d.kind === "phone" ? eq(guardians.phone, d.value) : sql`lower(${guardians.email}) = ${d.value}`);
}

/**
 * Sends a code if any school has this contact on file (or a parent account already uses it).
 * The answer is the same either way, so the form can't be used to check who's a parent.
 */
export async function requestLoginCode(db: DB, rawDestination: string, ip: string | null, deliver: (d: Destination, code: string) => Promise<unknown>) {
  const d = parseDestination(rawDestination);
  if (!d) throw new AppError("Enter the phone number or email address your child's school has for you.");
  const windowStart = new Date(Date.now() - 15 * 60_000);
  const [{ recent }] = await db.select({ recent: count() }).from(loginCodes).where(and(eq(loginCodes.destination, d.value), gt(loginCodes.createdAt, windowStart)));
  if (recent >= SENDS_PER_WINDOW) throw new AppError("We've sent a few codes already. Please wait 15 minutes, or use the last code you received.", "rate_limited");
  const ipKey = `otp:${ip ?? "unknown"}`;
  const [{ fromIp }] = await db.select({ fromIp: count() }).from(loginAttempts).where(and(eq(loginAttempts.key, ipKey), gt(loginAttempts.createdAt, new Date(Date.now() - 3_600_000))));
  if (fromIp >= IP_SENDS_PER_HOUR) throw new AppError("Too many requests from this device. Please try again in an hour.", "rate_limited");
  await db.insert(loginAttempts).values({ key: ipKey, succeeded: true });

  const known = (await matchingGuardians(db, d)).length > 0 || (await findUser(db, d)) !== null;
  if (!known) return { destination: d, sent: false };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(loginCodes).values({ destination: d.value, codeHash: hashCode(d.value, code), expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000) });
  await deliver(d, code);
  return { destination: d, sent: true };
}

async function findUser(db: DB, d: Destination) {
  const [u] = await db
    .select()
    .from(users)
    .where(d.kind === "phone" ? eq(users.phone, d.value) : sql`lower(${users.email}) = ${d.value}`)
    .limit(1);
  return u ?? null;
}

/** Checks the code and returns the parent's user id, creating the account on first login and linking every matching guardian. */
export async function verifyLoginCode(db: DB, rawDestination: string, rawCode: string) {
  const d = parseDestination(rawDestination);
  const code = rawCode.replace(/\D/g, "");
  if (!d || code.length !== 6) throw new AppError("Enter the 6-digit code we sent you.");
  // Local development and demos only: a fixed code for any parent a school has on file. Never in production.
  if (testLoginCodesAllowed() && code === FIXED_TEST_CODE && ((await matchingGuardians(db, d)).length > 0 || (await findUser(db, d)) !== null)) return signIn(db, d);
  const [latest] = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.destination, d.value), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, new Date())))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);
  if (!latest) throw new AppError("That code has expired. Ask for a new one.", "invalid");
  if (latest.attempts >= MAX_ATTEMPTS) throw new AppError("Too many wrong codes. Ask for a new one.", "rate_limited");
  const expected = Buffer.from(latest.codeHash);
  const given = Buffer.from(hashCode(d.value, code));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await db.update(loginCodes).set({ attempts: latest.attempts + 1 }).where(eq(loginCodes.id, latest.id));
    throw new AppError(latest.attempts + 1 >= MAX_ATTEMPTS ? "Too many wrong codes. Ask for a new one." : "That code isn't right. Check the message and try again.", "invalid");
  }
  await db.update(loginCodes).set({ usedAt: new Date() }).where(eq(loginCodes.id, latest.id));
  return signIn(db, d);
}

async function signIn(db: DB, d: Destination) {
  const matches = await matchingGuardians(db, d);
  let user = await findUser(db, d);
  if (!user) {
    const name = matches[0]?.name ?? "Parent";
    [user] = await db
      .insert(users)
      .values(d.kind === "phone" ? { name, phone: d.value } : { name, email: d.value, emailVerifiedAt: new Date() })
      .returning();
  } else if (d.kind === "email" && !user.emailVerifiedAt) {
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  }
  // Link guardians that aren't linked to anyone yet; never take over another account's link.
  for (const g of matches) if (!g.userId) await db.update(guardians).set({ userId: user.id }).where(and(eq(guardians.id, g.id), isNull(guardians.userId)));
  return { userId: user.id, linked: matches.length };
}

export function loginCodeMessage(code: string) {
  return `Your School OS code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Don't share it with anyone.`;
}
