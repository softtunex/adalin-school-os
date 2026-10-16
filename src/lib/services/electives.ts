import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { classes, levelSubjects, students, studentSubjects, subjects } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

/** Whether a subject is an elective for a class's level. */
export async function isElective(tx: Tx, classId: string, subjectId: string) {
  const [cls] = await tx.select({ levelId: classes.levelId }).from(classes).where(eq(classes.id, classId));
  if (!cls) return false;
  const [link] = await tx
    .select({ isElective: levelSubjects.isElective })
    .from(levelSubjects)
    .where(and(eq(levelSubjects.levelId, cls.levelId), eq(levelSubjects.subjectId, subjectId)));
  return link?.isElective ?? false;
}

/** Active students who take a subject in a class: everyone for compulsory subjects, only enrolled students for electives. */
export async function subjectRoster(tx: Tx, classId: string, subjectId: string) {
  const base = and(eq(students.classId, classId), eq(students.status, "active"));
  const cols = { id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo };
  if (!(await isElective(tx, classId, subjectId))) {
    return tx.select(cols).from(students).where(base).orderBy(asc(students.lastName), asc(students.firstName));
  }
  return tx
    .select(cols)
    .from(students)
    .innerJoin(studentSubjects, and(eq(studentSubjects.studentId, students.id), eq(studentSubjects.subjectId, subjectId)))
    .where(base)
    .orderBy(asc(students.lastName), asc(students.firstName));
}

export async function getElectiveMatrix(db: DB, access: Access, classId: string) {
  requirePermission(access, "students:view");
  return withTenant(db, access.school.id, async (tx) => {
    const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
    if (!cls) throw new AppError("That class wasn't found.", "not_found");
    const [electives, roster] = await Promise.all([
      tx
        .select({ id: subjects.id, name: subjects.name, code: subjects.code })
        .from(levelSubjects)
        .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
        .where(and(eq(levelSubjects.levelId, cls.levelId), eq(levelSubjects.isElective, true)))
        .orderBy(asc(subjects.sort), asc(subjects.name)),
      tx
        .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo })
        .from(students)
        .where(and(eq(students.classId, classId), eq(students.status, "active")))
        .orderBy(asc(students.lastName), asc(students.firstName)),
    ]);
    const picks = roster.length && electives.length
      ? await tx
          .select()
          .from(studentSubjects)
          .where(and(inArray(studentSubjects.studentId, roster.map((r) => r.id)), inArray(studentSubjects.subjectId, electives.map((e) => e.id))))
      : [];
    return { class: { id: cls.id, name: cls.name }, electives, students: roster, picks: picks.map((p) => `${p.studentId}|${p.subjectId}`) };
  });
}

/** Replaces the elective choices for every student in a class in one go. */
export async function setClassElectives(db: DB, access: Access, classId: string, picks: { studentId: string; subjectId: string }[], ip?: string | null) {
  requirePermission(access, "students:update");
  await withTenant(db, access.school.id, async (tx) => {
    const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
    if (!cls) throw new AppError("That class wasn't found.", "not_found");
    const electiveIds = (
      await tx
        .select({ id: levelSubjects.subjectId })
        .from(levelSubjects)
        .where(and(eq(levelSubjects.levelId, cls.levelId), eq(levelSubjects.isElective, true)))
    ).map((e) => e.id);
    const studentIds = (await tx.select({ id: students.id }).from(students).where(and(eq(students.classId, classId), eq(students.status, "active")))).map((s) => s.id);
    const validStudents = new Set(studentIds);
    const validSubjects = new Set(electiveIds);
    if (picks.some((p) => !validStudents.has(p.studentId) || !validSubjects.has(p.subjectId))) {
      throw new AppError("The class list or its electives changed. Reload and try again.", "conflict");
    }
    if (studentIds.length && electiveIds.length) {
      await tx.delete(studentSubjects).where(and(inArray(studentSubjects.studentId, studentIds), inArray(studentSubjects.subjectId, electiveIds)));
    }
    if (picks.length) await tx.insert(studentSubjects).values(picks.map((p) => ({ schoolId: access.school.id, ...p })));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "academics.electives",
      summary: `Updated elective subjects for ${cls.name} (${picks.length} choices)`,
      entityType: "class",
      entityId: classId,
    });
  });
}
