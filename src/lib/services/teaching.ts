import { and, eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { classes, levelSubjects, studentSubjects, teacherAssignments } from "../db/schema";
import { can, type Access } from "./access";
import { studentScope } from "./academics";

/** Whether this person teaches a class + subject: their own assignment, or anyone school-wide with the lessons permission. */
export async function teaches(tx: Tx, access: Access, classId: string, subjectId: string) {
  if (!can(access, "teaching:lessons")) return false;
  if ((await studentScope(tx, access)) === "all") return true;
  const [row] = await tx
    .select({ id: teacherAssignments.id })
    .from(teacherAssignments)
    .where(and(eq(teacherAssignments.classId, classId), eq(teacherAssignments.subjectId, subjectId), eq(teacherAssignments.membershipId, access.membershipId)));
  return Boolean(row);
}

/** The class + subject pairs this person teaches, or "all" for school-wide staff. */
export async function taughtPairs(tx: Tx, access: Access): Promise<"all" | { classId: string; subjectId: string; levelId: string }[]> {
  if ((await studentScope(tx, access)) === "all") return "all";
  return tx
    .select({ classId: teacherAssignments.classId, subjectId: teacherAssignments.subjectId, levelId: classes.levelId })
    .from(teacherAssignments)
    .innerJoin(classes, eq(classes.id, teacherAssignments.classId))
    .where(eq(teacherAssignments.membershipId, access.membershipId));
}

/** Subjects a student takes: every core subject of their level plus the electives they picked. */
export async function studentSubjectIds(tx: Tx, studentId: string, levelId: string | null) {
  if (!levelId) return new Set<string>();
  const [links, picks] = await Promise.all([
    tx.select({ subjectId: levelSubjects.subjectId, isElective: levelSubjects.isElective }).from(levelSubjects).where(eq(levelSubjects.levelId, levelId)),
    tx.select({ subjectId: studentSubjects.subjectId }).from(studentSubjects).where(eq(studentSubjects.studentId, studentId)),
  ]);
  const picked = new Set(picks.map((p) => p.subjectId));
  return new Set(links.filter((l) => !l.isElective || picked.has(l.subjectId)).map((l) => l.subjectId));
}

/** A `datetime-local` value read as Lagos time. */
export function lagosDateTime(value: string) {
  return new Date(`${value.length === 16 ? `${value}:00` : value}+01:00`);
}

/** A date as a `datetime-local` value in Lagos time. */
export function toLagosInput(d: Date) {
  return new Date(d.getTime() + 3_600_000).toISOString().slice(0, 16);
}

/** Tomorrow at 8am Lagos time, as a `datetime-local` value: the default due time for new work. */
export function defaultDueInput(now = new Date()) {
  return `${toLagosInput(new Date(now.getTime() + 86_400_000)).slice(0, 10)}T08:00`;
}

export function isPast(d: Date) {
  return d.getTime() < Date.now();
}
