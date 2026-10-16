import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "../db/client";
import { academicSessions, classes, classLevels, enrollments, students, terms } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

export type PromotionAction = "promote" | "repeat" | "graduate" | "withdraw";
export type Decision = { studentId: string; action: PromotionAction; targetClassId: string | null };

/**
 * Proposes where each active student goes next session: the same arm in the next level up,
 * or graduation from the final level. Students already moved into the target session are skipped.
 */
export async function planPromotion(db: DB, access: Access, toSessionId: string) {
  requirePermission(access, "students:promote");
  return withTenant(db, access.school.id, async (tx) => {
    const [toSession] = await tx.select().from(academicSessions).where(eq(academicSessions.id, toSessionId));
    if (!toSession) throw new AppError("That session wasn't found.", "not_found");
    const [levelRows, classRows, studentRows, moved] = await Promise.all([
      tx.select().from(classLevels).orderBy(asc(classLevels.sort)),
      tx.select().from(classes).where(eq(classes.isActive, true)).orderBy(asc(classes.name)),
      tx.select().from(students).where(eq(students.status, "active")).orderBy(asc(students.lastName), asc(students.firstName)),
      tx.select({ studentId: enrollments.studentId }).from(enrollments).where(eq(enrollments.sessionId, toSessionId)),
    ]);
    const movedIds = new Set(moved.map((m) => m.studentId));
    const levelIndex = new Map(levelRows.map((l, i) => [l.id, i]));
    const classById = new Map(classRows.map((c) => [c.id, c]));

    function targetFor(classId: string | null): { action: PromotionAction; targetClassId: string | null } {
      const cls = classId ? classById.get(classId) : undefined;
      if (!cls) return { action: "repeat", targetClassId: null };
      const next = levelRows[(levelIndex.get(cls.levelId) ?? -1) + 1];
      if (!next) return { action: "graduate", targetClassId: null };
      const candidates = classRows.filter((c) => c.levelId === next.id);
      const sameArm = candidates.find((c) => (c.arm ?? "").toLowerCase() === (cls.arm ?? "").toLowerCase());
      return { action: "promote", targetClassId: (sameArm ?? candidates[0])?.id ?? null };
    }

    const groups = classRows.map((cls) => ({
      classId: cls.id,
      className: cls.name,
      levelSort: levelIndex.get(cls.levelId) ?? 0,
      students: studentRows
        .filter((s) => s.classId === cls.id && !movedIds.has(s.id))
        .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, ...targetFor(cls.id) })),
    }));
    groups.sort((a, b) => a.levelSort - b.levelSort || a.className.localeCompare(b.className));

    return {
      toSession,
      groups: groups.filter((g) => g.students.length > 0),
      alreadyMoved: movedIds.size,
      classes: classRows.map((c) => ({ id: c.id, name: c.name, levelSort: levelIndex.get(c.levelId) ?? 0 })).sort((a, b) => a.levelSort - b.levelSort || a.name.localeCompare(b.name)),
    };
  });
}

/** Applies every decision in one transaction, then optionally makes the new session current. */
export async function applyPromotion(
  db: DB,
  access: Access,
  input: { toSessionId: string; decisions: Decision[]; makeCurrent: boolean },
  ip?: string | null,
) {
  requirePermission(access, "students:promote");
  if (input.decisions.length === 0) throw new AppError("There are no students to move.", "invalid");
  return withTenant(db, access.school.id, async (tx) => {
    const [toSession] = await tx.select().from(academicSessions).where(eq(academicSessions.id, input.toSessionId));
    if (!toSession) throw new AppError("That session wasn't found.", "not_found");
    const [fromSession] = await tx.select().from(academicSessions).where(eq(academicSessions.isCurrent, true));
    if (fromSession?.id === toSession.id) throw new AppError("Choose the next session, not the current one.", "invalid");

    const ids = input.decisions.map((d) => d.studentId);
    const studentRows = await tx.select().from(students).where(and(inArray(students.id, ids), eq(students.status, "active")));
    if (studentRows.length !== new Set(ids).size) throw new AppError("Some students are no longer active. Reload the page and try again.", "conflict");
    const already = await tx
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(and(eq(enrollments.sessionId, toSession.id), inArray(enrollments.studentId, ids)));
    if (already.length) throw new AppError("Some of these students were already moved into that session. Reload the page.", "conflict");

    const classIds = [...new Set(input.decisions.map((d) => d.targetClassId).filter((c): c is string => Boolean(c)))];
    const validClasses = new Set(classIds.length ? (await tx.select({ id: classes.id }).from(classes).where(inArray(classes.id, classIds))).map((c) => c.id) : []);
    const byId = new Map(studentRows.map((s) => [s.id, s]));
    const counts: Record<PromotionAction, number> = { promote: 0, repeat: 0, graduate: 0, withdraw: 0 };
    const outcome = { promote: "promoted", repeat: "repeated", graduate: "graduated", withdraw: "withdrawn" } as const;

    for (const d of input.decisions) {
      const s = byId.get(d.studentId)!;
      const target = d.action === "repeat" ? (d.targetClassId ?? s.classId) : d.targetClassId;
      if ((d.action === "promote" || d.action === "repeat") && (!target || (!validClasses.has(target) && target !== s.classId))) {
        throw new AppError(`Choose a class for ${s.firstName} ${s.lastName}.`, "invalid");
      }
      if (fromSession) {
        await tx
          .update(enrollments)
          .set({ outcome: outcome[d.action] })
          .where(and(eq(enrollments.studentId, s.id), eq(enrollments.sessionId, fromSession.id), eq(enrollments.outcome, "current")));
      }
      if (d.action === "promote" || d.action === "repeat") {
        await tx.insert(enrollments).values({ schoolId: access.school.id, studentId: s.id, sessionId: toSession.id, classId: target!, outcome: "current" });
        await tx.update(students).set({ classId: target!, updatedAt: new Date() }).where(eq(students.id, s.id));
      } else {
        await tx.update(students).set({ status: d.action === "graduate" ? "graduated" : "withdrawn", updatedAt: new Date() }).where(eq(students.id, s.id));
      }
      counts[d.action]++;
    }

    if (input.makeCurrent) {
      await tx.update(academicSessions).set({ isCurrent: false }).where(ne(academicSessions.id, toSession.id));
      await tx.update(academicSessions).set({ isCurrent: true }).where(eq(academicSessions.id, toSession.id));
      await tx.update(terms).set({ isCurrent: false });
      await tx.update(terms).set({ isCurrent: true }).where(and(eq(terms.sessionId, toSession.id), eq(terms.number, 1)));
    }

    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "student.promoted",
      summary: `Moved students into ${toSession.name}: ${counts.promote} promoted, ${counts.repeat} repeating, ${counts.graduate} graduated, ${counts.withdraw} withdrawn`,
      meta: counts,
    });
    return counts;
  });
}
