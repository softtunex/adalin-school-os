import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { classNameFor, TEMPLATES, type TemplateKey } from "../academics/templates";
import type { DB, Tx } from "../db/client";
import {
  academicSessions,
  classes,
  classLevels,
  levelSubjects,
  membershipRoles,
  memberships,
  roles,
  students,
  subjects,
  teacherAssignments,
  terms,
  users,
  type Section,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { markOnboarding } from "./onboarding";

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

// ---------- Reading ----------

export async function getCurrentTerm(tx: Tx) {
  const [row] = await tx
    .select({ term: terms, session: academicSessions })
    .from(terms)
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .where(eq(terms.isCurrent, true))
    .limit(1);
  return row ?? null;
}

export async function getAcademicOverview(db: DB, access: Access) {
  requirePermission(access, "academics:view");
  return withTenant(db, access.school.id, async (tx) => {
    const [sessionRows, termRows, levelRows, classRows, subjectRows, levelSubjectRows, assignmentRows, studentCounts, staff] = await Promise.all([
      tx.select().from(academicSessions).orderBy(asc(academicSessions.name)),
      tx.select().from(terms).orderBy(asc(terms.number)),
      tx.select().from(classLevels).orderBy(asc(classLevels.sort)),
      tx.select().from(classes).orderBy(asc(classes.name)),
      tx.select().from(subjects).orderBy(asc(subjects.sort), asc(subjects.name)),
      tx.select().from(levelSubjects),
      tx.select().from(teacherAssignments),
      tx
        .select({ classId: students.classId, n: count() })
        .from(students)
        .where(eq(students.status, "active"))
        .groupBy(students.classId),
      listTeachingStaff(tx),
    ]);
    const countBy = new Map(studentCounts.map((r) => [r.classId, r.n]));
    return {
      sessions: sessionRows.map((s) => ({ ...s, terms: termRows.filter((t) => t.sessionId === s.id) })),
      currentTerm: termRows.find((t) => t.isCurrent) ?? null,
      currentSession: sessionRows.find((s) => s.isCurrent) ?? null,
      levels: levelRows.map((l) => ({
        ...l,
        classes: classRows.filter((c) => c.levelId === l.id).map((c) => ({ ...c, studentCount: countBy.get(c.id) ?? 0 })),
        subjectIds: levelSubjectRows.filter((ls) => ls.levelId === l.id).map((ls) => ls.subjectId),
      })),
      subjects: subjectRows,
      levelSubjects: levelSubjectRows,
      assignments: assignmentRows,
      staff,
    };
  });
}

/** Active staff who can be class or subject teachers. */
async function listTeachingStaff(tx: Tx) {
  const rows = await tx
    .selectDistinct({ membershipId: memberships.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff")))
    .orderBy(asc(users.name));
  return rows;
}

/**
 * Which classes this person may see students for. Teachers only see the classes they
 * teach or form-teach; anyone with broader roles sees the whole school.
 */
export async function studentScope(tx: Tx, access: Access): Promise<"all" | string[]> {
  const teachingOnly = access.roles.every((r) => r.key === "class_teacher" || r.key === "subject_teacher" || r.kind === "portal");
  if (!teachingOnly) return "all";
  const [formClasses, taught] = await Promise.all([
    tx.select({ id: classes.id }).from(classes).where(eq(classes.classTeacherId, access.membershipId)),
    tx.selectDistinct({ id: teacherAssignments.classId }).from(teacherAssignments).where(eq(teacherAssignments.membershipId, access.membershipId)),
  ]);
  return [...new Set([...formClasses, ...taught].map((r) => r.id))];
}

// ---------- One-click setup ----------

export type SetupInput = {
  template: TemplateKey;
  sections: Section[];
  arms: string[];
  sessionName: string;
};

export async function setupAcademics(db: DB, access: Access, input: SetupInput, ip?: string | null) {
  requirePermission(access, "academics:manage");
  const template = TEMPLATES[input.template];
  const chosen = template.sections.filter((s) => input.sections.includes(s.section));
  if (chosen.length === 0) throw new AppError("Choose at least one section your school runs.", "invalid");
  const arms = [...new Set(input.arms.map((a) => a.trim()).filter(Boolean))].slice(0, 12);

  return withTenant(db, access.school.id, async (tx) => {
    const [existing] = await tx.select({ n: count() }).from(classLevels);
    if ((existing?.n ?? 0) > 0) throw new AppError("Your classes are already set up. Edit them from Academics instead.", "conflict");

    const [session] = await tx
      .insert(academicSessions)
      .values({ schoolId: access.school.id, name: input.sessionName, isCurrent: true })
      .onConflictDoUpdate({ target: [academicSessions.schoolId, academicSessions.name], set: { isCurrent: true } })
      .returning();
    await tx.update(academicSessions).set({ isCurrent: false }).where(ne(academicSessions.id, session.id));
    await tx
      .insert(terms)
      .values(template.termNames.map((name, i) => ({ schoolId: access.school.id, sessionId: session.id, name, number: i + 1, isCurrent: i === 0 })))
      .onConflictDoNothing();

    let sort = 0;
    const levelRows: { id: string; section: Section }[] = [];
    for (const section of chosen) {
      for (const levelName of section.levels) {
        const [level] = await tx
          .insert(classLevels)
          .values({ schoolId: access.school.id, name: levelName, section: section.section, sort: sort++ })
          .returning();
        levelRows.push({ id: level.id, section: level.section });
        const armList = arms.length ? arms : [null];
        await tx.insert(classes).values(
          armList.map((arm) => ({ schoolId: access.school.id, levelId: level.id, arm, name: classNameFor(levelName, arm) })),
        );
      }
    }

    const sectionSet = new Set(chosen.map((c) => c.section));
    const subjectTemplates = template.subjects.filter((s) => s.sections.some((sec) => sectionSet.has(sec)));
    // Templates can list the same subject name for different sections (e.g. English); merge them.
    const byName = new Map<string, { code: string; sections: Set<Section>; elective: Set<Section> }>();
    for (const st of subjectTemplates) {
      const entry = byName.get(st.name) ?? { code: st.code, sections: new Set(), elective: new Set() };
      st.sections.forEach((s) => entry.sections.add(s));
      st.electiveIn?.forEach((s) => entry.elective.add(s));
      byName.set(st.name, entry);
    }
    let subjectSort = 0;
    for (const [name, def] of byName) {
      const [subject] = await tx
        .insert(subjects)
        .values({ schoolId: access.school.id, name, code: def.code, sort: subjectSort++ })
        .returning();
      const links = levelRows
        .filter((l) => def.sections.has(l.section))
        .map((l) => ({ schoolId: access.school.id, levelId: l.id, subjectId: subject.id, isElective: def.elective.has(l.section) }));
      if (links.length) await tx.insert(levelSubjects).values(links);
    }

    await markOnboarding(tx, access.school.id, "academics");
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "academics.setup",
      summary: `Set up ${levelRows.length} class levels and ${byName.size} subjects from the ${template.label} template`,
    });
    return { levels: levelRows.length, subjects: byName.size };
  });
}

// ---------- Sessions and terms ----------

export async function createSession(db: DB, access: Access, input: { name: string; termNames?: string[] }, ip?: string | null) {
  requirePermission(access, "academics:manage");
  return withTenant(db, access.school.id, async (tx) => {
    const [clash] = await tx.select({ id: academicSessions.id }).from(academicSessions).where(eq(academicSessions.name, input.name));
    if (clash) throw new AppError(`The ${input.name} session already exists.`, "conflict");
    const [session] = await tx.insert(academicSessions).values({ schoolId: access.school.id, name: input.name }).returning();
    const names = input.termNames?.length === 3 ? input.termNames : ["First Term", "Second Term", "Third Term"];
    await tx.insert(terms).values(names.map((name, i) => ({ schoolId: access.school.id, sessionId: session.id, name, number: i + 1 })));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "session.created", summary: `Created the ${input.name} session` });
    return session;
  });
}

export async function setCurrentTerm(db: DB, access: Access, termId: string, ip?: string | null) {
  requirePermission(access, "academics:manage");
  await withTenant(db, access.school.id, async (tx) => {
    const [term] = await tx.select().from(terms).where(eq(terms.id, termId));
    if (!term) throw new AppError("That term wasn't found.", "not_found");
    await tx.update(terms).set({ isCurrent: false }).where(ne(terms.id, termId));
    await tx.update(terms).set({ isCurrent: true }).where(eq(terms.id, termId));
    await tx.update(academicSessions).set({ isCurrent: false }).where(ne(academicSessions.id, term.sessionId));
    await tx.update(academicSessions).set({ isCurrent: true }).where(eq(academicSessions.id, term.sessionId));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "term.current", summary: `Made ${term.name} the current term` });
  });
}

export async function updateTermDates(
  db: DB,
  access: Access,
  termId: string,
  input: { startsOn: string | null; endsOn: string | null },
  ip?: string | null,
) {
  requirePermission(access, "academics:manage");
  if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) throw new AppError("A term can't end before it starts.", "invalid");
  await withTenant(db, access.school.id, async (tx) => {
    const [term] = await tx.update(terms).set(input).where(eq(terms.id, termId)).returning();
    if (!term) throw new AppError("That term wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "term.dates", summary: `Updated the dates for ${term.name}` });
  });
}

// ---------- Levels and classes ----------

export async function addLevel(db: DB, access: Access, input: { name: string; section: Section; arms: string[] }, ip?: string | null) {
  requirePermission(access, "academics:manage");
  return withTenant(db, access.school.id, async (tx) => {
    const [clash] = await tx.select({ id: classLevels.id }).from(classLevels).where(eq(classLevels.name, input.name));
    if (clash) throw new AppError(`${input.name} already exists.`, "conflict");
    const all = await tx.select({ sort: classLevels.sort }).from(classLevels);
    const [level] = await tx
      .insert(classLevels)
      .values({ schoolId: access.school.id, name: input.name, section: input.section, sort: Math.max(-1, ...all.map((l) => l.sort)) + 1 })
      .returning();
    const arms = input.arms.map((a) => a.trim()).filter(Boolean);
    await tx
      .insert(classes)
      .values((arms.length ? arms : [null]).map((arm) => ({ schoolId: access.school.id, levelId: level.id, arm, name: classNameFor(level.name, arm) })));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "level.created", summary: `Added ${level.name}` });
    return level;
  });
}

export async function addClassArm(db: DB, access: Access, levelId: string, arm: string, ip?: string | null) {
  requirePermission(access, "academics:manage");
  return withTenant(db, access.school.id, async (tx) => {
    const [level] = await tx.select().from(classLevels).where(eq(classLevels.id, levelId));
    if (!level) throw new AppError("That class level wasn't found.", "not_found");
    const name = classNameFor(level.name, arm.trim() || null);
    const [clash] = await tx.select({ id: classes.id }).from(classes).where(eq(classes.name, name));
    if (clash) throw new AppError(`${name} already exists.`, "conflict");
    const [created] = await tx.insert(classes).values({ schoolId: access.school.id, levelId, arm: arm.trim() || null, name }).returning();
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "class.created", summary: `Added ${name}` });
    return created;
  });
}

async function assertTeachingStaff(tx: Tx, membershipId: string) {
  const staff = await listTeachingStaff(tx);
  if (!staff.some((s) => s.membershipId === membershipId)) throw new AppError("Choose an active staff member.", "invalid");
}

export async function updateClass(
  db: DB,
  access: Access,
  classId: string,
  input: { classTeacherId: string | null; capacity: number | null },
  ip?: string | null,
) {
  requirePermission(access, "academics:manage");
  await withTenant(db, access.school.id, async (tx) => {
    if (input.classTeacherId) await assertTeachingStaff(tx, input.classTeacherId);
    const [cls] = await tx.update(classes).set(input).where(eq(classes.id, classId)).returning();
    if (!cls) throw new AppError("That class wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "class.updated", summary: `Updated ${cls.name}` });
  });
}

export async function removeClass(db: DB, access: Access, classId: string, ip?: string | null) {
  requirePermission(access, "academics:manage");
  await withTenant(db, access.school.id, async (tx) => {
    const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
    if (!cls) throw new AppError("That class wasn't found.", "not_found");
    const [inUse] = await tx.select({ n: count() }).from(students).where(eq(students.classId, classId));
    if ((inUse?.n ?? 0) > 0) throw new AppError(`Move the students out of ${cls.name} before removing it.`, "conflict");
    await tx.delete(classes).where(eq(classes.id, classId));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "class.removed", summary: `Removed ${cls.name}` });
  });
}

// ---------- Subjects ----------

export async function saveSubject(
  db: DB,
  access: Access,
  input: { id?: string; name: string; code: string | null; levelIds: string[]; electiveLevelIds: string[] },
  ip?: string | null,
) {
  requirePermission(access, "academics:manage");
  return withTenant(db, access.school.id, async (tx) => {
    const [clash] = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.name, input.name));
    if (clash && clash.id !== input.id) throw new AppError(`${input.name} already exists.`, "conflict");
    let subjectId = input.id;
    if (subjectId) {
      const [updated] = await tx.update(subjects).set({ name: input.name, code: input.code }).where(eq(subjects.id, subjectId)).returning();
      if (!updated) throw new AppError("That subject wasn't found.", "not_found");
    } else {
      const all = await tx.select({ sort: subjects.sort }).from(subjects);
      const [created] = await tx
        .insert(subjects)
        .values({ schoolId: access.school.id, name: input.name, code: input.code, sort: Math.max(-1, ...all.map((s) => s.sort)) + 1 })
        .returning();
      subjectId = created.id;
    }
    const validLevels = input.levelIds.length
      ? await tx.select({ id: classLevels.id }).from(classLevels).where(inArray(classLevels.id, input.levelIds))
      : [];
    await tx.delete(levelSubjects).where(eq(levelSubjects.subjectId, subjectId));
    if (validLevels.length) {
      const elective = new Set(input.electiveLevelIds);
      await tx
        .insert(levelSubjects)
        .values(validLevels.map((l) => ({ schoolId: access.school.id, levelId: l.id, subjectId: subjectId!, isElective: elective.has(l.id) })));
    }
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.id ? "subject.updated" : "subject.created",
      summary: `${input.id ? "Updated" : "Added"} ${input.name}`,
    });
    return subjectId;
  });
}

export async function removeSubject(db: DB, access: Access, subjectId: string, ip?: string | null) {
  requirePermission(access, "academics:manage");
  await withTenant(db, access.school.id, async (tx) => {
    const [subject] = await tx.delete(subjects).where(eq(subjects.id, subjectId)).returning();
    if (!subject) throw new AppError("That subject wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "subject.removed", summary: `Removed ${subject.name}` });
  });
}

export async function assignSubjectTeacher(
  db: DB,
  access: Access,
  input: { classId: string; subjectId: string; membershipId: string | null },
  ip?: string | null,
) {
  requirePermission(access, "academics:manage");
  await withTenant(db, access.school.id, async (tx) => {
    const [cls] = await tx.select().from(classes).where(eq(classes.id, input.classId));
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, input.subjectId));
    if (!cls || !subject) throw new AppError("That class or subject wasn't found.", "not_found");
    if (input.membershipId === null) {
      await tx.delete(teacherAssignments).where(and(eq(teacherAssignments.classId, input.classId), eq(teacherAssignments.subjectId, input.subjectId)));
      return;
    }
    await assertTeachingStaff(tx, input.membershipId);
    await tx
      .insert(teacherAssignments)
      .values({ schoolId: access.school.id, classId: input.classId, subjectId: input.subjectId, membershipId: input.membershipId })
      .onConflictDoUpdate({ target: [teacherAssignments.classId, teacherAssignments.subjectId], set: { membershipId: input.membershipId } });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "teacher.assigned",
      summary: `Assigned a teacher to ${subject.name} for ${cls.name}`,
    });
  });
}

/** Classes in level order, for pickers and filters. Teachers only get the classes they teach. */
export async function listClassOptions(db: DB, access: Access) {
  if (!access.permissions.has("students:view") && !access.permissions.has("academics:view")) {
    throw new AppError("You don't have permission to do that.", "forbidden");
  }
  return withTenant(db, access.school.id, async (tx) => {
    const rows = await tx
      .select({ id: classes.id, name: classes.name, levelName: classLevels.name })
      .from(classes)
      .innerJoin(classLevels, eq(classLevels.id, classes.levelId))
      .where(eq(classes.isActive, true))
      .orderBy(asc(classLevels.sort), asc(classes.name));
    const scope = await studentScope(tx, access);
    return scope === "all" ? rows : rows.filter((r) => scope.includes(r.id));
  });
}
