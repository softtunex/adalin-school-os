import { createHash, randomInt } from "node:crypto";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { academicSessions, classResults, loginAttempts, resultPins, schools, scores, students, terms } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { buildClassResults, resolveTerm } from "./results";

/** PINs are hashed with the school id so a leaked hash can't be checked against another school. */
export function hashPin(schoolId: string, pin: string) {
  return createHash("sha256").update(`${schoolId}:${pin.replace(/\D/g, "")}`).digest("hex");
}

function newPin() {
  let pin = "";
  for (let i = 0; i < 12; i++) pin += randomInt(0, 10).toString();
  return pin;
}

export function formatPin(pin: string) {
  return pin.replace(/(\d{4})(?=\d)/g, "$1-");
}

export async function generatePins(db: DB, access: Access, input: { count: number; maxUses: number }, ip?: string | null) {
  requirePermission(access, "results:pins");
  requireFeature(access.plan, "result_workflow");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 1000) throw new AppError("Generate between 1 and 1,000 PINs at a time.", "invalid");
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 10) throw new AppError("Each PIN can be used between 1 and 10 times.", "invalid");

  return withTenant(db, access.school.id, async (tx) => {
    const current = await resolveTerm(tx);
    const [school] = await tx.select({ prefix: schools.admissionPrefix, name: schools.name }).from(schools).where(eq(schools.id, access.school.id));
    const prefix = (school?.prefix || school?.name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "SCH").toUpperCase();
    const [{ n }] = await tx.select({ n: count() }).from(resultPins);
    const batch = `${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${String(n + 1).padStart(5, "0").slice(-3)}`;

    const issued: { serial: string; pin: string }[] = [];
    for (let i = 0; i < input.count; i++) {
      const serial = `${prefix}${String(n + i + 1).padStart(6, "0")}`;
      const pin = newPin();
      issued.push({ serial, pin });
    }
    await tx.insert(resultPins).values(
      issued.map((p) => ({ schoolId: access.school.id, serial: p.serial, pinHash: hashPin(access.school.id, p.pin), termId: current.term.id, maxUses: input.maxUses, batch })),
    );
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "results.pins_generated",
      summary: `Generated ${input.count} result checker PINs for ${current.term.name} (${input.maxUses} uses each)`,
      meta: { batch },
    });
    return { batch, term: `${current.term.name}, ${current.session.name}`, pins: issued.map((p) => ({ serial: p.serial, pin: formatPin(p.pin) })) };
  });
}

export async function listPinBatches(db: DB, access: Access) {
  requirePermission(access, "results:pins");
  return withTenant(db, access.school.id, async (tx) => {
    return tx
      .select({
        batch: resultPins.batch,
        termName: terms.name,
        sessionName: academicSessions.name,
        total: count(),
        used: sql<number>`count(*) filter (where ${resultPins.uses} > 0)::int`,
        exhausted: sql<number>`count(*) filter (where ${resultPins.uses} >= ${resultPins.maxUses})::int`,
        createdAt: sql<Date>`min(${resultPins.createdAt})`,
      })
      .from(resultPins)
      .innerJoin(terms, eq(terms.id, resultPins.termId))
      .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
      .groupBy(resultPins.batch, terms.name, academicSessions.name)
      .orderBy(desc(sql`min(${resultPins.createdAt})`));
  });
}

const CHECK_LIMIT = 10;
const CHECK_WINDOW_MINUTES = 15;

/**
 * Public result check: admission number + PIN. The PIN binds to the first student it's
 * used for, counts each use, and only works once that class's results are published.
 */
export async function checkResultWithPin(db: DB, input: { slug: string; admissionNo: string; pin: string; ip: string | null }) {
  const key = `pin:${input.ip ?? "unknown"}`;
  const since = new Date(Date.now() - CHECK_WINDOW_MINUTES * 60_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), eq(loginAttempts.succeeded, false), gt(loginAttempts.createdAt, since)));
  if (n >= CHECK_LIMIT) throw new AppError(`Too many attempts. Please wait ${CHECK_WINDOW_MINUTES} minutes and try again.`, "rate_limited");

  const fail = async (message: string) => {
    await db.insert(loginAttempts).values({ key, succeeded: false });
    return new AppError(message, "invalid");
  };

  const [school] = await db.select().from(schools).where(eq(schools.slug, input.slug));
  if (!school) throw await fail("We couldn't find that school.");

  // Failures are returned (not thrown) from the transaction and recorded after it ends.
  const outcome = await withTenant(db, school.id, async (tx) => {
    const no = (message: string) => ({ ok: false as const, message });
    const digits = input.pin.replace(/\D/g, "");
    const [pin] = digits.length === 12 ? await tx.select().from(resultPins).where(eq(resultPins.pinHash, hashPin(school.id, digits))) : [];
    if (!pin) return no("That PIN isn't valid. Check the digits on your card.");
    const [student] = await tx.select().from(students).where(sql`lower(${students.admissionNo}) = ${input.admissionNo.trim().toLowerCase()}`);
    if (!student) return no("We couldn't find a student with that admission number.");
    if (pin.studentId && pin.studentId !== student.id) return no("This PIN has already been used for a different student.");
    if (pin.uses >= pin.maxUses) return no(`This PIN has been used ${pin.maxUses} times and has expired.`);

    const [scored] = await tx.select({ classId: scores.classId }).from(scores).where(and(eq(scores.studentId, student.id), eq(scores.termId, pin.termId))).limit(1);
    const classId = scored?.classId ?? student.classId;
    if (!classId) return no("Results for this student aren't available yet.");
    const [published] = await tx.select().from(classResults).where(and(eq(classResults.termId, pin.termId), eq(classResults.classId, classId), eq(classResults.status, "published")));
    if (!published) return no("Results for this term haven't been published yet. Please check back later.");

    const term = await resolveTerm(tx, pin.termId);
    const built = await buildClassResults(tx, school.id, classId, term);
    const me = built.students.find((s) => s.id === student.id);
    if (!me || me.result.subjectsTaken === 0) return no("There are no results for this student in that term.");

    await tx.update(resultPins).set({ uses: pin.uses + 1, studentId: student.id }).where(eq(resultPins.id, pin.id));
    return { ok: true as const, built, studentId: student.id, usesLeft: pin.maxUses - pin.uses - 1 };
  });
  if (!outcome.ok) throw await fail(outcome.message);
  return { school, built: outcome.built, studentId: outcome.studentId, usesLeft: outcome.usesLeft };
}
