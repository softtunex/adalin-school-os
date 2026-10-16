import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { behaviourRecords, BEHAVIOUR_SEVERITIES, classes, classLevels, memberships, schools, students, users, type DisciplineSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { getCurrentTerm, studentScope } from "./academics";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { notifyGuardians, schoolComms } from "./notify";
import { requireChild } from "./parent-portal";

/*
 * Behaviour: merits and incidents per student. Teachers log for the students they teach;
 * whoever holds the discipline permission sees everything and closes serious cases.
 * Parents hear about incidents (and, if the school likes, merits) as the school decides.
 */

export const BEHAVIOUR_PAGE_SIZE = 25;
export type Severity = (typeof BEHAVIOUR_SEVERITIES)[number];
export const SEVERITY_POINTS: Record<Severity, number> = { minor: -1, moderate: -3, serious: -5 };

export const DEFAULT_DISCIPLINE: Required<DisciplineSettings> = {
  meritCategories: ["Kindness", "Leadership", "Hard work", "Improvement", "Helpfulness", "Sports", "Neatness", "Punctuality"],
  incidentCategories: ["Lateness", "Disrespect", "Fighting", "Bullying", "Truancy", "Uniform", "Phone use", "Exam malpractice", "Damage to property", "Noise making"],
  notifyIncidents: "moderate",
  notifyMerits: true,
};

export function disciplineSettings(s: DisciplineSettings): Required<DisciplineSettings> {
  return {
    ...DEFAULT_DISCIPLINE,
    ...s,
    meritCategories: s.meritCategories?.length ? s.meritCategories : DEFAULT_DISCIPLINE.meritCategories,
    incidentCategories: s.incidentCategories?.length ? s.incidentCategories : DEFAULT_DISCIPLINE.incidentCategories,
  };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireDiscipline(access: Access) {
  if (!hasFeature(access.plan, "discipline")) throw new AppError("The behaviour log is on the Basic plan.", "upgrade");
  if (!access.isStaff) throw new AppError("This is for staff.", "forbidden");
}

async function scopeWhere(tx: Tx, access: Access): Promise<SQL | undefined> {
  if (can(access, "operations:discipline") && (await studentScope(tx, access)) === "all") return undefined;
  const scope = await studentScope(tx, access);
  if (scope === "all") return undefined;
  return scope.length ? inArray(behaviourRecords.classId, scope) : sql`false`;
}

// ---------- Settings ----------

export const disciplineSettingsSchema = z.object({
  meritCategories: z.array(z.string().trim().min(1).max(40)).min(1, "Keep at least one merit category.").max(30),
  incidentCategories: z.array(z.string().trim().min(1).max(40)).min(1, "Keep at least one incident category.").max(40),
  notifyIncidents: z.enum(["serious", "moderate", "all", "none"]),
  notifyMerits: z.boolean(),
});

export async function saveDisciplineSettings(db: DB, access: Access, input: z.infer<typeof disciplineSettingsSchema>, ip?: string | null) {
  requireDiscipline(access);
  requirePermission(access, "operations:discipline");
  const clean = { ...input, meritCategories: [...new Set(input.meritCategories)], incidentCategories: [...new Set(input.incidentCategories)] };
  await db.update(schools).set({ disciplineSettings: clean }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) => recordAudit(tx, access.school.id, actor(access, ip), { action: "discipline.settings", summary: "Updated behaviour categories and parent notices" }));
}

// ---------- Recording ----------

export const behaviourSchema = z
  .object({
    studentId: z.string().uuid("Choose a student."),
    kind: z.enum(["merit", "incident"]),
    category: z.string().trim().min(1, "Choose a category.").max(40),
    severity: z.enum(BEHAVIOUR_SEVERITIES).nullable().default(null),
    points: z.number().int().min(-20).max(20).nullable().default(null),
    description: z.string().trim().max(2000).default(""),
    actionTaken: z.string().trim().max(300).default(""),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date."),
  })
  .refine((v) => v.kind === "merit" || v.severity, { path: ["severity"], message: "How serious was it?" })
  .refine((v) => v.kind === "merit" || v.description.length >= 5, { path: ["description"], message: "Say briefly what happened." });

export async function recordBehaviour(db: DB, access: Access, input: z.infer<typeof behaviourSchema>, ip?: string | null) {
  requireDiscipline(access);
  if (input.occurredOn > lagosToday()) throw new AppError("The date can't be in the future.", "invalid");
  const s = disciplineSettings(access.school.disciplineSettings);
  return withTenant(db, access.school.id, async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!student || student.status !== "active") throw new AppError("That student wasn't found.", "not_found");
    const scope = await studentScope(tx, access);
    if (scope !== "all" && (!student.classId || !scope.includes(student.classId))) throw new AppError("You can only record behaviour for students you teach.", "forbidden");
    const current = await getCurrentTerm(tx);
    const merit = input.kind === "merit";
    const points = merit ? Math.max(1, input.points ?? 1) : (input.points ?? SEVERITY_POINTS[input.severity!]);
    const [row] = await tx
      .insert(behaviourRecords)
      .values({
        schoolId: access.school.id,
        studentId: student.id,
        termId: current?.term.id ?? null,
        classId: student.classId,
        kind: input.kind,
        category: input.category,
        severity: merit ? null : input.severity,
        points: merit ? Math.abs(points) : -Math.abs(points),
        description: input.description,
        actionTaken: input.actionTaken || null,
        occurredOn: input.occurredOn,
        status: !merit && input.severity === "serious" ? "open" : "resolved",
        recordedBy: access.membershipId,
      })
      .returning();

    const threshold = { none: 99, serious: 2, moderate: 1, all: 0 }[s.notifyIncidents];
    const tell = merit ? s.notifyMerits : BEHAVIOUR_SEVERITIES.indexOf(input.severity!) >= threshold;
    let told = 0;
    if (tell) {
      const comms = await schoolComms(tx, access.school.id);
      const name = student.firstName;
      const r = await notifyGuardians(
        tx,
        comms,
        [student.id],
        () => ({
          kind: merit ? "merit" : "incident",
          title: merit ? `${name} was recognised for ${input.category.toLowerCase()}` : `${name}: ${input.category.toLowerCase()} reported`,
          body: merit ? input.description || `Well done, ${name}!` : `${input.description}${input.actionTaken ? ` Action: ${input.actionTaken}.` : ""}`,
          link: `/p/children/${student.id}?tab=conduct`,
          ref: `behaviour:${row.id}`,
          sms: merit
            ? undefined
            : `${comms.name}: ${name} - ${input.category}. ${input.description.slice(0, 100)}${input.severity === "serious" ? " Please contact the school." : ""}`,
          email: {
            subject: merit ? `${comms.name}: well done, ${name}!` : `${comms.name}: a note about ${name}`,
            text: merit
              ? `Dear parent,\n\n${name} was recognised today for ${input.category.toLowerCase()}.${input.description ? `\n\n${input.description}` : ""}\n\n${comms.name}`
              : `Dear parent,\n\nWe're writing about ${name}: ${input.category.toLowerCase()} (${input.severity}).\n\n${input.description}${input.actionTaken ? `\n\nAction taken: ${input.actionTaken}` : ""}\n\nPlease contact the school if you'd like to discuss it.\n\n${comms.name}`,
          },
        }),
        { email: true, sms: !merit && input.severity !== "minor" },
      );
      told = r.told;
      if (told) await tx.update(behaviourRecords).set({ parentNotifiedAt: new Date() }).where(eq(behaviourRecords.id, row.id));
    }
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: `behaviour.${input.kind}`,
      summary: `${merit ? "Merit" : `${input.severity} incident`} for ${student.firstName} ${student.lastName}: ${input.category}`,
      entityType: "student",
      entityId: student.id,
    });
    return { row, told };
  });
}

export async function resolveIncident(db: DB, access: Access, input: { id: string; actionTaken: string }, ip?: string | null) {
  requireDiscipline(access);
  requirePermission(access, "operations:discipline");
  await withTenant(db, access.school.id, async (tx) => {
    const [r] = await tx.select().from(behaviourRecords).where(eq(behaviourRecords.id, input.id));
    if (!r) throw new AppError("That record wasn't found.", "not_found");
    if (r.status === "resolved") throw new AppError("Already resolved.", "conflict");
    await tx
      .update(behaviourRecords)
      .set({ status: "resolved", resolvedBy: access.membershipId, resolvedAt: new Date(), actionTaken: input.actionTaken.trim() || r.actionTaken })
      .where(eq(behaviourRecords.id, input.id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "behaviour.resolved", summary: `Closed a serious ${r.category.toLowerCase()} case`, entityType: "student", entityId: r.studentId });
  });
}

export async function deleteBehaviour(db: DB, access: Access, id: string, ip?: string | null) {
  requireDiscipline(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [r] = await tx.select().from(behaviourRecords).where(eq(behaviourRecords.id, id));
    if (!r) throw new AppError("That record wasn't found.", "not_found");
    const ownRecent = r.recordedBy === access.membershipId && Date.now() - r.createdAt.getTime() < 24 * 3_600_000;
    if (!can(access, "operations:discipline") && !ownRecent) throw new AppError("You can only remove your own entries, within a day.", "forbidden");
    await tx.delete(behaviourRecords).where(eq(behaviourRecords.id, id));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "behaviour.deleted", summary: `Removed a ${r.kind} (${r.category})`, entityType: "student", entityId: r.studentId });
  });
}

// ---------- Lists and summaries ----------

export async function listBehaviour(db: DB, access: Access, filter: { classId?: string; kind?: string; category?: string; status?: string; q?: string; page?: number } = {}) {
  requireDiscipline(access);
  return withTenant(db, access.school.id, async (tx) => {
    const current = await getCurrentTerm(tx);
    const scope = await scopeWhere(tx, access);
    const termWhere = current ? eq(behaviourRecords.termId, current.term.id) : undefined;
    const where: SQL[] = [];
    if (scope) where.push(scope);
    if (filter.classId) where.push(eq(behaviourRecords.classId, filter.classId));
    if (filter.kind === "merit" || filter.kind === "incident") where.push(eq(behaviourRecords.kind, filter.kind));
    if (filter.category) where.push(eq(behaviourRecords.category, filter.category));
    if (filter.status === "open") where.push(eq(behaviourRecords.status, "open"));
    if (filter.q) where.push(or(ilike(students.firstName, `%${filter.q}%`), ilike(students.lastName, `%${filter.q}%`), ilike(students.admissionNo, `%${filter.q}%`))!);
    const page = Math.max(1, filter.page ?? 1);
    const [[{ total }], rows, [stats]] = await Promise.all([
      tx.select({ total: count() }).from(behaviourRecords).innerJoin(students, eq(students.id, behaviourRecords.studentId)).where(and(...where)),
      tx
        .select({ r: behaviourRecords, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo, className: classes.name, by: users.name })
        .from(behaviourRecords)
        .innerJoin(students, eq(students.id, behaviourRecords.studentId))
        .leftJoin(classes, eq(classes.id, behaviourRecords.classId))
        .leftJoin(memberships, eq(memberships.id, behaviourRecords.recordedBy))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(...where))
        .orderBy(desc(behaviourRecords.occurredOn), desc(behaviourRecords.createdAt))
        .limit(BEHAVIOUR_PAGE_SIZE)
        .offset((page - 1) * BEHAVIOUR_PAGE_SIZE),
      tx
        .select({
          merits: sql<number>`count(*) filter (where ${behaviourRecords.kind} = 'merit')`.mapWith(Number),
          incidents: sql<number>`count(*) filter (where ${behaviourRecords.kind} = 'incident')`.mapWith(Number),
          open: sql<number>`count(*) filter (where ${behaviourRecords.status} = 'open')`.mapWith(Number),
          told: sql<number>`count(*) filter (where ${behaviourRecords.parentNotifiedAt} is not null)`.mapWith(Number),
        })
        .from(behaviourRecords)
        .where(and(scope, termWhere)),
    ]);
    return { rows, total, stats, term: current };
  });
}

export async function getLeaderboard(db: DB, access: Access) {
  requireDiscipline(access);
  return withTenant(db, access.school.id, async (tx) => {
    const current = await getCurrentTerm(tx);
    const scope = await scopeWhere(tx, access);
    const termWhere = current ? eq(behaviourRecords.termId, current.term.id) : undefined;
    const [byStudent, byClass] = await Promise.all([
      tx
        .select({
          studentId: behaviourRecords.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          className: classes.name,
          points: sql<number>`sum(${behaviourRecords.points})`.mapWith(Number),
          merits: sql<number>`count(*) filter (where ${behaviourRecords.kind} = 'merit')`.mapWith(Number),
          incidents: sql<number>`count(*) filter (where ${behaviourRecords.kind} = 'incident')`.mapWith(Number),
        })
        .from(behaviourRecords)
        .innerJoin(students, eq(students.id, behaviourRecords.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(and(scope, termWhere, eq(students.status, "active")))
        .groupBy(behaviourRecords.studentId, students.firstName, students.lastName, classes.name),
      tx
        .select({
          classId: behaviourRecords.classId,
          className: classes.name,
          sort: classLevels.sort,
          points: sql<number>`sum(${behaviourRecords.points})`.mapWith(Number),
          merits: sql<number>`count(*) filter (where ${behaviourRecords.kind} = 'merit')`.mapWith(Number),
          incidents: sql<number>`count(*) filter (where ${behaviourRecords.kind} = 'incident')`.mapWith(Number),
        })
        .from(behaviourRecords)
        .innerJoin(classes, eq(classes.id, behaviourRecords.classId))
        .innerJoin(classLevels, eq(classLevels.id, classes.levelId))
        .where(and(scope, termWhere))
        .groupBy(behaviourRecords.classId, classes.name, classLevels.sort),
    ]);
    return {
      term: current,
      stars: [...byStudent].filter((s) => s.merits > 0).sort((a, b) => b.points - a.points || b.merits - a.merits).slice(0, 10),
      watch: [...byStudent].filter((s) => s.incidents >= 2).sort((a, b) => b.incidents - a.incidents || a.points - b.points).slice(0, 10),
      classes: [...byClass].sort((a, b) => b.points - a.points),
    };
  });
}

/** One student's conduct this term, for their profile. */
export async function studentConduct(db: DB, access: Access, studentId: string) {
  requireDiscipline(access);
  return withTenant(db, access.school.id, async (tx) => conductFor(tx, studentId));
}

async function conductFor(tx: Tx, studentId: string, parentView = false) {
  const current = await getCurrentTerm(tx);
  const rows = await tx
    .select({ r: behaviourRecords, by: users.name })
    .from(behaviourRecords)
    .leftJoin(memberships, eq(memberships.id, behaviourRecords.recordedBy))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(eq(behaviourRecords.studentId, studentId))
    .orderBy(desc(behaviourRecords.occurredOn))
    .limit(100);
  const thisTerm = rows.filter((x) => current && x.r.termId === current.term.id);
  return {
    term: current,
    rows: parentView ? rows.map((x) => ({ ...x, by: null })) : rows,
    points: thisTerm.reduce((t, x) => t + x.r.points, 0),
    merits: thisTerm.filter((x) => x.r.kind === "merit").length,
    incidents: thisTerm.filter((x) => x.r.kind === "incident").length,
  };
}

/** A parent's view of their child's conduct. */
export async function getChildConduct(db: DB, userId: string, studentId: string) {
  const child = await requireChild(db, userId, studentId);
  if (!child.school.features.includes("discipline")) return null;
  return withTenant(db, child.schoolId, (tx) => conductFor(tx, studentId, true));
}

/** Students this person can record behaviour for, for the picker. */
export async function behaviourStudents(db: DB, access: Access) {
  requireDiscipline(access);
  return withTenant(db, access.school.id, async (tx) => {
    const scope = await studentScope(tx, access);
    const rows = await tx
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo, classId: students.classId, className: classes.name })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(and(eq(students.status, "active"), scope === "all" ? undefined : scope.length ? inArray(students.classId, scope) : sql`false`))
      .orderBy(asc(students.firstName), asc(students.lastName));
    return rows;
  });
}

/** Teachers can take back their own entry within a day. */
export function stillRemovable(createdAt: Date) {
  return Date.now() - createdAt.getTime() < 24 * 3_600_000;
}
