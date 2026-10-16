import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import {
  academicSessions,
  classes,
  classLevels,
  classResults,
  levelSubjects,
  memberships,
  scores,
  scoreSheets,
  students,
  studentSubjects,
  subjects,
  teacherAssignments,
  termReports,
  terms,
  users,
  type ResultStatus,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { computeClassResults, classSummary, RATING_TRAITS } from "../results/compute";
import { can, type Access } from "./access";
import { getCurrentTerm, studentScope } from "./academics";
import { loadAssessmentConfig } from "./assessment";
import { classAttendanceTotals } from "./attendance";
import { resultAlerts } from "./alerts";
import { recordAudit } from "./audit";
import { subjectRoster } from "./electives";

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

async function requireCurrentTerm(tx: Tx) {
  const current = await getCurrentTerm(tx);
  if (!current) throw new AppError("Set a current term in Academics before recording scores.", "invalid");
  return current;
}

export async function resolveTerm(tx: Tx, termId?: string) {
  if (!termId) return requireCurrentTerm(tx);
  const [row] = await tx
    .select({ term: terms, session: academicSessions })
    .from(terms)
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .where(eq(terms.id, termId));
  if (!row) throw new AppError("That term wasn't found.", "not_found");
  return row;
}

/** Whether this person can enter scores for a class + subject. */
async function canEnter(tx: Tx, access: Access, classId: string, subjectId: string) {
  if (!can(access, "results:enter")) return false;
  const scope = await studentScope(tx, access);
  if (scope === "all") return true;
  const [assigned] = await tx
    .select({ id: teacherAssignments.id })
    .from(teacherAssignments)
    .where(and(eq(teacherAssignments.classId, classId), eq(teacherAssignments.subjectId, subjectId), eq(teacherAssignments.membershipId, access.membershipId)));
  return Boolean(assigned);
}

async function isClassTeacher(tx: Tx, access: Access, classId: string) {
  const [cls] = await tx.select({ t: classes.classTeacherId }).from(classes).where(eq(classes.id, classId));
  return cls?.t === access.membershipId;
}

/** Reviewing a class: class teacher of that class, or anyone school-wide with the review permission. */
async function canReview(tx: Tx, access: Access, classId: string) {
  if (!can(access, "results:review")) return false;
  return (await studentScope(tx, access)) === "all" || (await isClassTeacher(tx, access, classId));
}

async function classResultRow(tx: Tx, schoolId: string, termId: string, classId: string) {
  const [row] = await tx.select().from(classResults).where(and(eq(classResults.termId, termId), eq(classResults.classId, classId)));
  return row ?? { id: null, schoolId, termId, classId, status: "open" as ResultStatus, reviewedBy: null, approvedBy: null, publishedAt: null, nextTermBegins: null };
}

// ---------- Score sheets ----------

/** The (class, subject) sheets this person can open this term, with progress. */
export async function listMySheets(db: DB, access: Access) {
  return withTenant(db, access.school.id, async (tx) => {
    const current = await requireCurrentTerm(tx);
    const scope = await studentScope(tx, access);
    if (!can(access, "results:enter") && !can(access, "results:view")) return { term: current, sheets: [] };

    let pairs: { classId: string; subjectId: string }[];
    if (scope === "all") {
      pairs = await tx
        .select({ classId: classes.id, subjectId: levelSubjects.subjectId })
        .from(classes)
        .innerJoin(levelSubjects, eq(levelSubjects.levelId, classes.levelId))
        .where(eq(classes.isActive, true));
    } else {
      pairs = await tx
        .select({ classId: teacherAssignments.classId, subjectId: teacherAssignments.subjectId })
        .from(teacherAssignments)
        .where(eq(teacherAssignments.membershipId, access.membershipId));
    }
    if (pairs.length === 0) return { term: current, sheets: [] };
    const classIds = [...new Set(pairs.map((p) => p.classId))];
    const [classRows, subjectRows, sheetRows, scoreCounts, rollCounts, levelLinks, picks, assignmentRows, resultRows] = await Promise.all([
      tx.select({ id: classes.id, name: classes.name, sort: classLevels.sort }).from(classes).innerJoin(classLevels, eq(classLevels.id, classes.levelId)).where(inArray(classes.id, classIds)),
      tx.select({ id: subjects.id, name: subjects.name, sort: subjects.sort }).from(subjects),
      tx.select().from(scoreSheets).where(and(eq(scoreSheets.termId, current.term.id), inArray(scoreSheets.classId, classIds))),
      tx
        .selectDistinct({ classId: scores.classId, subjectId: scores.subjectId, studentId: scores.studentId })
        .from(scores)
        .where(and(eq(scores.termId, current.term.id), inArray(scores.classId, classIds))),
      tx.select({ classId: students.classId, id: students.id }).from(students).where(and(eq(students.status, "active"), inArray(students.classId, classIds))),
      tx
        .select({ classId: classes.id, subjectId: levelSubjects.subjectId, isElective: levelSubjects.isElective })
        .from(classes)
        .innerJoin(levelSubjects, eq(levelSubjects.levelId, classes.levelId))
        .where(inArray(classes.id, classIds)),
      tx.select({ studentId: studentSubjects.studentId, subjectId: studentSubjects.subjectId }).from(studentSubjects),
      tx
        .select({ classId: teacherAssignments.classId, subjectId: teacherAssignments.subjectId, teacher: users.name })
        .from(teacherAssignments)
        .innerJoin(memberships, eq(memberships.id, teacherAssignments.membershipId))
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(inArray(teacherAssignments.classId, classIds)),
      tx.select().from(classResults).where(and(eq(classResults.termId, current.term.id), inArray(classResults.classId, classIds))),
    ]);
    const className = new Map(classRows.map((c) => [c.id, c]));
    const subjectName = new Map(subjectRows.map((s) => [s.id, s]));
    const sheets = pairs
      .map((p) => {
        const sheet = sheetRows.find((s) => s.classId === p.classId && s.subjectId === p.subjectId);
        const scored = scoreCounts.filter((s) => s.classId === p.classId && s.subjectId === p.subjectId).length;
        const elective = levelLinks.find((l) => l.classId === p.classId && l.subjectId === p.subjectId)?.isElective;
        const classRoll = rollCounts.filter((r) => r.classId === p.classId);
        const roll = elective ? classRoll.filter((r) => picks.some((k) => k.studentId === r.id && k.subjectId === p.subjectId)).length : classRoll.length;
        return {
          classId: p.classId,
          className: className.get(p.classId)?.name ?? "",
          classSort: className.get(p.classId)?.sort ?? 0,
          subjectId: p.subjectId,
          subjectName: subjectName.get(p.subjectId)?.name ?? "",
          subjectSort: subjectName.get(p.subjectId)?.sort ?? 0,
          teacher: assignmentRows.find((a) => a.classId === p.classId && a.subjectId === p.subjectId)?.teacher ?? null,
          status: sheet?.status ?? "draft",
          scored,
          roll,
          classStatus: (resultRows.find((r) => r.classId === p.classId)?.status ?? "open") as ResultStatus,
        };
      })
      .sort((a, b) => a.classSort - b.classSort || a.className.localeCompare(b.className) || a.subjectSort - b.subjectSort);
    return { term: current, sheets };
  });
}

export async function getScoreSheet(db: DB, access: Access, classId: string, subjectId: string) {
  return withTenant(db, access.school.id, async (tx) => {
    const current = await requireCurrentTerm(tx);
    const allowed = await canEnter(tx, access, classId, subjectId);
    const reviewer = await canReview(tx, access, classId);
    if (!allowed && !reviewer) throw new AppError("You can't open this score sheet.", "forbidden");
    const [[cls], [subject]] = await Promise.all([
      tx.select().from(classes).where(eq(classes.id, classId)),
      tx.select().from(subjects).where(eq(subjects.id, subjectId)),
    ]);
    if (!cls || !subject) throw new AppError("That class or subject wasn't found.", "not_found");
    const config = await loadAssessmentConfig(tx, access.school.id);
    const [roster, scoreRows, [sheet], classResult] = await Promise.all([
      subjectRoster(tx, classId, subjectId),
      tx.select().from(scores).where(and(eq(scores.termId, current.term.id), eq(scores.classId, classId), eq(scores.subjectId, subjectId))),
      tx.select().from(scoreSheets).where(and(eq(scoreSheets.termId, current.term.id), eq(scoreSheets.classId, classId), eq(scoreSheets.subjectId, subjectId))),
      classResultRow(tx, access.school.id, current.term.id, classId),
    ]);
    const lockedByClass = classResult.status === "approved" || classResult.status === "published";
    const submitted = sheet?.status === "submitted";
    return {
      term: current,
      class: { id: cls.id, name: cls.name },
      subject: { id: subject.id, name: subject.name },
      components: config.components,
      bands: config.bands,
      students: roster,
      scores: scoreRows.map((s) => ({ studentId: s.studentId, componentId: s.componentId, score: s.score })),
      status: sheet?.status ?? "draft",
      submittedAt: sheet?.submittedAt ?? null,
      classStatus: classResult.status,
      editable: !lockedByClass && ((allowed && !submitted) || (reviewer && can(access, "results:enter"))),
      canSubmit: allowed && !submitted && !lockedByClass,
      canReopen: reviewer && submitted && !lockedByClass,
    };
  });
}

export async function saveScores(
  db: DB,
  access: Access,
  input: { classId: string; subjectId: string; entries: { studentId: string; componentId: string; score: number | null }[] },
  ip?: string | null,
) {
  return withTenant(db, access.school.id, async (tx) => {
    const current = await requireCurrentTerm(tx);
    const allowed = await canEnter(tx, access, input.classId, input.subjectId);
    const reviewer = await canReview(tx, access, input.classId);
    if (!allowed && !(reviewer && can(access, "results:enter"))) throw new AppError("You can't enter scores for this subject.", "forbidden");

    const classResult = await classResultRow(tx, access.school.id, current.term.id, input.classId);
    if (classResult.status === "approved" || classResult.status === "published") {
      throw new AppError("These results have been approved and are locked. Ask the principal to unlock them.", "conflict");
    }
    const [sheet] = await tx
      .select()
      .from(scoreSheets)
      .where(and(eq(scoreSheets.termId, current.term.id), eq(scoreSheets.classId, input.classId), eq(scoreSheets.subjectId, input.subjectId)));
    if (sheet?.status === "submitted" && !reviewer) throw new AppError("You've already submitted this sheet. Ask your class teacher to reopen it.", "conflict");

    const config = await loadAssessmentConfig(tx, access.school.id);
    const maxBy = new Map(config.components.map((c) => [c.id, c]));
    const studentIds = [...new Set(input.entries.map((e) => e.studentId))];
    const inClass = studentIds.length ? new Set((await subjectRoster(tx, input.classId, input.subjectId)).map((s) => s.id)) : new Set<string>();

    let saved = 0;
    for (const e of input.entries) {
      const comp = maxBy.get(e.componentId);
      if (!comp) throw new AppError("That assessment column no longer exists. Reload the sheet.", "conflict");
      if (!inClass.has(e.studentId)) throw new AppError("A student on this sheet has moved class or dropped the subject. Reload the sheet.", "conflict");
      if (e.score === null) {
        await tx
          .delete(scores)
          .where(and(eq(scores.termId, current.term.id), eq(scores.studentId, e.studentId), eq(scores.subjectId, input.subjectId), eq(scores.componentId, e.componentId)));
        continue;
      }
      if (!Number.isFinite(e.score) || e.score < 0 || e.score > comp.maxScore) {
        throw new AppError(`${comp.name} scores must be between 0 and ${comp.maxScore}.`, "invalid");
      }
      const score = Math.round(e.score * 100) / 100;
      await tx
        .insert(scores)
        .values({
          schoolId: access.school.id,
          termId: current.term.id,
          classId: input.classId,
          subjectId: input.subjectId,
          studentId: e.studentId,
          componentId: e.componentId,
          score,
          updatedBy: access.membershipId,
        })
        .onConflictDoUpdate({
          target: [scores.termId, scores.studentId, scores.subjectId, scores.componentId],
          set: { score, classId: input.classId, updatedBy: access.membershipId, updatedAt: new Date() },
        });
      saved++;
    }
    if (sheet?.status === "submitted" && reviewer) {
      await recordAudit(tx, access.school.id, actor(access, ip), {
        action: "results.scores_edited",
        summary: `Edited submitted scores for ${input.entries.length} entries`,
        entityType: "class",
        entityId: input.classId,
      });
    }
    return { saved };
  });
}

export async function setSheetStatus(db: DB, access: Access, input: { classId: string; subjectId: string; status: "draft" | "submitted" }, ip?: string | null) {
  await withTenant(db, access.school.id, async (tx) => {
    const current = await requireCurrentTerm(tx);
    const classResult = await classResultRow(tx, access.school.id, current.term.id, input.classId);
    if (classResult.status === "approved" || classResult.status === "published") throw new AppError("These results are locked.", "conflict");
    if (input.status === "submitted") {
      if (!(await canEnter(tx, access, input.classId, input.subjectId)) || !can(access, "results:submit")) throw new AppError("You can't submit this sheet.", "forbidden");
    } else if (!(await canReview(tx, access, input.classId))) {
      throw new AppError("Only the class teacher or principal can reopen a sheet.", "forbidden");
    }
    const [subject] = await tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, input.subjectId));
    const [cls] = await tx.select({ name: classes.name }).from(classes).where(eq(classes.id, input.classId));
    await tx
      .insert(scoreSheets)
      .values({
        schoolId: access.school.id,
        termId: current.term.id,
        classId: input.classId,
        subjectId: input.subjectId,
        status: input.status,
        submittedBy: input.status === "submitted" ? access.membershipId : null,
        submittedAt: input.status === "submitted" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [scoreSheets.termId, scoreSheets.classId, scoreSheets.subjectId],
        set: { status: input.status, submittedBy: input.status === "submitted" ? access.membershipId : null, submittedAt: input.status === "submitted" ? new Date() : null },
      });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.status === "submitted" ? "results.sheet_submitted" : "results.sheet_reopened",
      summary: `${input.status === "submitted" ? "Submitted" : "Reopened"} ${subject?.name} scores for ${cls?.name}`,
      entityType: "class",
      entityId: input.classId,
    });
  });
}

// ---------- Class results, broadsheet, workflow ----------

/**
 * Computes a class's results for a term without any permission checks; callers must
 * authorise first. For past terms the class list comes from who was scored in that class.
 */
export async function buildClassResults(tx: Tx, schoolId: string, classId: string, current: Awaited<ReturnType<typeof resolveTerm>>) {
  const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
  if (!cls) throw new AppError("That class wasn't found.", "not_found");
  const config = await loadAssessmentConfig(tx, schoolId);
  const studentCols = { id: students.id, firstName: students.firstName, middleName: students.middleName, lastName: students.lastName, admissionNo: students.admissionNo, gender: students.gender, dateOfBirth: students.dateOfBirth, photoUrl: students.photoUrl };

  const [subjectRows, scoreRows, sheetRows, reports, classResult, attendance] = await Promise.all([
    tx
      .select({ id: subjects.id, name: subjects.name, code: subjects.code })
      .from(levelSubjects)
      .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
      .where(eq(levelSubjects.levelId, cls.levelId))
      .orderBy(asc(subjects.sort), asc(subjects.name)),
    tx.select().from(scores).where(and(eq(scores.termId, current.term.id), eq(scores.classId, classId))),
    tx.select().from(scoreSheets).where(and(eq(scoreSheets.termId, current.term.id), eq(scoreSheets.classId, classId))),
    tx.select().from(termReports).where(eq(termReports.termId, current.term.id)),
    classResultRow(tx, schoolId, current.term.id, classId),
    classAttendanceTotals(tx, classId, current.term.id),
  ]);
  const scoredIds = [...new Set(scoreRows.map((r) => r.studentId))];
  const roster = current.term.isCurrent
    ? await tx.select(studentCols).from(students).where(and(eq(students.classId, classId), eq(students.status, "active"))).orderBy(asc(students.lastName), asc(students.firstName))
    : scoredIds.length
      ? await tx.select(studentCols).from(students).where(inArray(students.id, scoredIds)).orderBy(asc(students.lastName), asc(students.firstName))
      : [];

  // Only subjects someone actually scored show up on the broadsheet and report cards.
  const scoredSubjects = subjectRows.filter((s) => scoreRows.some((r) => r.subjectId === s.id));
  const results = computeClassResults({
    studentIds: roster.map((s) => s.id),
    subjectIds: scoredSubjects.map((s) => s.id),
    components: config.components,
    bands: config.bands,
    scores: scoreRows.map((r) => ({ studentId: r.studentId, subjectId: r.subjectId, componentId: r.componentId, score: r.score })),
  });
  const reportBy = new Map(reports.map((r) => [r.studentId, r]));
  return {
    term: current,
    class: { id: cls.id, name: cls.name, classTeacherId: cls.classTeacherId },
    components: config.components,
    bands: config.bands,
    subjects: scoredSubjects,
    offeredSubjects: subjectRows,
    sheets: subjectRows.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      status: sheetRows.find((r) => r.subjectId === s.id)?.status ?? "draft",
      scored: new Set(scoreRows.filter((r) => r.subjectId === s.id).map((r) => r.studentId)).size,
    })),
    students: roster.map((s) => ({
      ...s,
      result: results.get(s.id)!,
      report: reportBy.get(s.id) ?? null,
      attendance: attendance.totals.get(s.id) ?? { present: 0, absent: 0, late: 0, excused: 0 },
    })),
    attendanceDays: attendance.days,
    summary: classSummary(results),
    status: classResult.status,
    nextTermBegins: classResult.nextTermBegins,
    publishedAt: classResult.publishedAt,
  };
}

export async function getClassResults(db: DB, access: Access, classId: string, termId?: string) {
  return withTenant(db, access.school.id, async (tx) => {
    if (!can(access, "results:view")) throw new AppError("You don't have permission to do that.", "forbidden");
    const scope = await studentScope(tx, access);
    if (scope !== "all" && !scope.includes(classId)) throw new AppError("You can't view results for this class.", "forbidden");
    const current = await resolveTerm(tx, termId);
    const built = await buildClassResults(tx, access.school.id, classId, current);
    return {
      ...built,
      permissions: {
        review: await canReview(tx, access, classId),
        approve: can(access, "results:approve"),
        publish: can(access, "results:publish"),
        unlock: can(access, "results:unlock"),
        comment: can(access, "results:comment") && ((await isClassTeacher(tx, access, classId)) || scope === "all"),
        principalComment: can(access, "results:approve"),
        workflow: hasFeature(access.plan, "result_workflow"),
      },
    };
  });
}

const TRANSITIONS: Record<ResultStatus, ResultStatus[]> = {
  open: ["reviewed", "published"],
  reviewed: ["approved", "open"],
  approved: ["published", "open"],
  published: ["open"],
};

export async function setClassResultStatus(
  db: DB,
  access: Access,
  input: { classId: string; status: ResultStatus; nextTermBegins?: string | null },
  ip?: string | null,
) {
  await withTenant(db, access.school.id, async (tx) => {
    const current = await requireCurrentTerm(tx);
    const row = await classResultRow(tx, access.school.id, current.term.id, input.classId);
    const workflow = hasFeature(access.plan, "result_workflow");
    if (!TRANSITIONS[row.status].includes(input.status)) throw new AppError(`Results can't go from ${row.status} to ${input.status}.`, "invalid");
    if (workflow && row.status === "open" && input.status === "published") throw new AppError("Results need to be reviewed and approved before they're published.", "invalid");

    const reviewer = await canReview(tx, access, input.classId);
    const need =
      input.status === "reviewed"
        ? reviewer
        : input.status === "approved"
          ? can(access, "results:approve")
          : input.status === "published"
            ? can(access, "results:publish")
            : row.status === "reviewed"
              ? reviewer || can(access, "results:approve")
              : can(access, "results:unlock");
    if (!need) throw new AppError("You don't have permission to do that.", "forbidden");

    const [cls] = await tx.select({ name: classes.name }).from(classes).where(eq(classes.id, input.classId));
    const patch = {
      status: input.status,
      reviewedBy: input.status === "reviewed" ? access.membershipId : row.reviewedBy,
      approvedBy: input.status === "approved" ? access.membershipId : row.approvedBy,
      publishedAt: input.status === "published" ? new Date() : input.status === "open" ? null : row.publishedAt,
      nextTermBegins: input.nextTermBegins !== undefined ? input.nextTermBegins : row.nextTermBegins,
    };
    await tx
      .insert(classResults)
      .values({ schoolId: access.school.id, termId: current.term.id, classId: input.classId, ...patch })
      .onConflictDoUpdate({ target: [classResults.termId, classResults.classId], set: patch });
    if (input.status === "published") await resultAlerts(tx, access.school.id, input.classId, { id: current.term.id, name: current.term.name, session: current.session.name });
    const verb = { open: "Reopened", reviewed: "Reviewed", approved: "Approved", published: "Published" }[input.status];
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.status === "open" ? "results.unlocked" : `results.${input.status}`,
      summary: `${verb} ${cls?.name} results for ${current.term.name}`,
      entityType: "class",
      entityId: input.classId,
    });
  });
}

export async function saveTermReport(
  db: DB,
  access: Access,
  input: { studentId: string; classTeacherComment?: string | null; principalComment?: string | null; ratings?: Record<string, number> },
) {
  await withTenant(db, access.school.id, async (tx) => {
    const current = await requireCurrentTerm(tx);
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!student?.classId) throw new AppError("That student isn't in a class.", "not_found");
    const row = await classResultRow(tx, access.school.id, current.term.id, student.classId);
    if (row.status === "approved" || row.status === "published") throw new AppError("These results are locked.", "conflict");

    const classTeacherOk = can(access, "results:comment") && ((await isClassTeacher(tx, access, student.classId)) || (await studentScope(tx, access)) === "all");
    if ((input.classTeacherComment !== undefined || input.ratings !== undefined) && !classTeacherOk) throw new AppError("Only the class teacher can write this comment.", "forbidden");
    if (input.principalComment !== undefined && !can(access, "results:approve")) throw new AppError("Only the principal can write this comment.", "forbidden");

    const allowedTraits = new Set<string>([...RATING_TRAITS.affective, ...RATING_TRAITS.psychomotor]);
    const ratings = input.ratings
      ? Object.fromEntries(Object.entries(input.ratings).filter(([k, v]) => allowedTraits.has(k) && Number.isInteger(v) && v >= 1 && v <= 5))
      : undefined;

    const patch: Partial<typeof termReports.$inferInsert> = { updatedAt: new Date() };
    if (input.classTeacherComment !== undefined) patch.classTeacherComment = input.classTeacherComment?.trim().slice(0, 600) || null;
    if (input.principalComment !== undefined) patch.principalComment = input.principalComment?.trim().slice(0, 600) || null;
    if (ratings) patch.ratings = ratings;
    await tx
      .insert(termReports)
      .values({ schoolId: access.school.id, termId: current.term.id, studentId: input.studentId, ...patch })
      .onConflictDoUpdate({ target: [termReports.termId, termReports.studentId], set: patch });
  });
}

/** Classes with result progress for the current term (results home page). */
export async function listClassResultProgress(db: DB, access: Access) {
  return withTenant(db, access.school.id, async (tx) => {
    if (!can(access, "results:view")) throw new AppError("You don't have permission to do that.", "forbidden");
    const current = await requireCurrentTerm(tx);
    const scope = await studentScope(tx, access);
    const classRows = await tx
      .select({ id: classes.id, name: classes.name, levelId: classes.levelId, classTeacherId: classes.classTeacherId, sort: classLevels.sort })
      .from(classes)
      .innerJoin(classLevels, eq(classLevels.id, classes.levelId))
      .where(eq(classes.isActive, true))
      .orderBy(asc(classLevels.sort), asc(classes.name));
    const visible = scope === "all" ? classRows : classRows.filter((c) => scope.includes(c.id));
    if (visible.length === 0) return { term: current, classes: [] };
    const ids = visible.map((c) => c.id);
    const [offered, sheets, results] = await Promise.all([
      tx.select({ levelId: levelSubjects.levelId, subjectId: levelSubjects.subjectId }).from(levelSubjects),
      tx.select().from(scoreSheets).where(and(eq(scoreSheets.termId, current.term.id), inArray(scoreSheets.classId, ids))),
      tx.select().from(classResults).where(and(eq(classResults.termId, current.term.id), inArray(classResults.classId, ids))),
    ]);
    return {
      term: current,
      classes: visible.map((c) => {
        const subjectCount = offered.filter((o) => o.levelId === c.levelId).length;
        return {
          id: c.id,
          name: c.name,
          isMine: c.classTeacherId === access.membershipId,
          subjects: subjectCount,
          submitted: sheets.filter((s) => s.classId === c.id && s.status === "submitted").length,
          status: (results.find((r) => r.classId === c.id)?.status ?? "open") as ResultStatus,
        };
      }),
    };
  });
}
