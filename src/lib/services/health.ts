import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { classes, schools, sickBayVisits, studentHealth, students, users, memberships, VISIT_OUTCOMES, type HealthSettings, type MedicineGiven } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { getCurrentTerm } from "./academics";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { lagosClock } from "./hr";
import { notifyGuardians, schoolComms } from "./notify";
import { requireChild } from "./parent-portal";
import { allergyClash } from "../health/allergy";

export { allergyClash };

/*
 * The sick bay: each visit with the complaint, temperature, what was done and any medicine
 * given, then how the student left (back to class, rested, sent home, referred). Medicine is
 * checked against the student's recorded allergies. Parents hear when the visit closes.
 */

export const VISIT_PAGE_SIZE = 25;
export type Outcome = (typeof VISIT_OUTCOMES)[number];
export const OUTCOME_LABEL: Record<Outcome, string> = { returned: "Back to class", rested: "Rested, then back to class", sent_home: "Sent home", referred: "Referred to hospital" };

export const DEFAULT_HEALTH: Required<HealthSettings> = {
  medicines: ["Paracetamol", "Ibuprofen", "ORS (oral rehydration salts)", "Antacid", "Loratadine (antihistamine)", "Calamine lotion", "Antiseptic and plaster", "Vitamin C"],
  notifyParents: "every",
};

export function healthSettings(s: HealthSettings): Required<HealthSettings> {
  return { ...DEFAULT_HEALTH, ...s };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireSickBay(access: Access) {
  if (!hasFeature(access.plan, "health")) throw new AppError("The sick bay is on the Premium plan.", "upgrade");
  requirePermission(access, "operations:health");
}

/** Who can read health records: the nurse, and anyone allowed to see medical details. */
export function canSeeHealth(access: Access) {
  return hasFeature(access.plan, "health") && (can(access, "operations:health") || can(access, "students:view_medical"));
}

export function formatTemp(t: number | null) {
  return t == null ? null : `${(t / 10).toFixed(1)}°C`;
}

// ---------- Settings ----------

export const healthSettingsSchema = z.object({
  medicines: z.array(z.string().trim().min(1).max(80)).min(1, "List at least one medicine.").max(80),
  notifyParents: z.enum(["every", "serious", "none"]),
});

export async function saveHealthSettings(db: DB, access: Access, input: z.infer<typeof healthSettingsSchema>, ip?: string | null) {
  requireSickBay(access);
  const clean = { ...input, medicines: [...new Set(input.medicines)] };
  await db.update(schools).set({ healthSettings: clean }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, actor(access, ip), { action: "health.settings", summary: `Sick bay: ${clean.medicines.length} medicines, parents told ${{ every: "after every visit", serious: "when sent home or referred", none: "never automatically" }[clean.notifyParents]}` }),
  );
}

// ---------- Health records ----------

const list = z.array(z.string().trim().min(1).max(80)).max(30);
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const healthRecordSchema = z.object({
  studentId: z.string().uuid(),
  allergies: list,
  conditions: list,
  regularMedication: opt(300),
  emergencyNote: opt(500),
  doctor: opt(160),
});

export async function saveHealthRecord(db: DB, access: Access, input: z.infer<typeof healthRecordSchema>, ip?: string | null) {
  requireSickBay(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [st] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!st) throw new AppError("That student wasn't found.", "not_found");
    const values = {
      allergies: [...new Set(input.allergies)],
      conditions: [...new Set(input.conditions)],
      regularMedication: input.regularMedication,
      emergencyNote: input.emergencyNote,
      doctor: input.doctor,
      updatedBy: access.membershipId,
      updatedAt: new Date(),
    };
    await tx
      .insert(studentHealth)
      .values({ ...values, schoolId: access.school.id, studentId: st.id })
      .onConflictDoUpdate({ target: studentHealth.studentId, set: values });
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "health.record", summary: `Updated the health record for ${st.firstName} ${st.lastName}`, entityType: "student", entityId: st.id });
  });
}

async function healthOf(tx: Tx, studentId: string) {
  const [h] = await tx.select().from(studentHealth).where(eq(studentHealth.studentId, studentId));
  return h ?? null;
}

// ---------- Visits ----------

const medicineSchema = z.object({
  medicine: z.string().trim().min(1, "Name the medicine.").max(80),
  dose: z.string().trim().min(1, "Enter the dose.").max(60),
  allergyOverride: z.boolean().optional(),
});

export const visitSchema = z.object({
  studentId: z.string().uuid("Choose the student."),
  complaint: z.string().trim().min(2, "What's wrong?").max(300),
  temperature: z.number().min(30).max(45).nullable().default(null),
  observations: opt(1000),
  treatment: opt(1000),
  medicines: z.array(medicineSchema).max(10).default([]),
  /** Leave empty while the student is still resting in the bay. */
  outcome: z.enum(VISIT_OUTCOMES).nullable().default(null),
});

function checkMedicines(allergies: string[], meds: z.infer<typeof medicineSchema>[], name: string) {
  for (const m of meds) {
    const clash = allergyClash(allergies, m.medicine);
    if (clash && !m.allergyOverride) throw new AppError(`${name} is allergic to ${clash}. Don't give ${m.medicine} unless a doctor has said it's safe.`, "conflict");
  }
}

/** Opens a visit. With an outcome it's recorded and closed in one step. */
export async function recordVisit(db: DB, access: Access, input: z.infer<typeof visitSchema>, ip?: string | null) {
  requireSickBay(access);
  const now = new Date();
  const result = await withTenant(db, access.school.id, async (tx) => {
    const [st] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!st || st.status !== "active") throw new AppError("That student wasn't found.", "not_found");
    const [open] = await tx.select({ id: sickBayVisits.id }).from(sickBayVisits).where(and(eq(sickBayVisits.studentId, st.id), isNull(sickBayVisits.leftAt)));
    if (open) throw new AppError(`${st.firstName} is already in the sick bay. Update that visit instead.`, "conflict");
    const h = await healthOf(tx, st.id);
    checkMedicines(h?.allergies ?? [], input.medicines, st.firstName);
    const current = await getCurrentTerm(tx);
    const [visit] = await tx
      .insert(sickBayVisits)
      .values({
        schoolId: access.school.id,
        studentId: st.id,
        termId: current?.term.id ?? null,
        arrivedAt: now,
        complaint: input.complaint,
        temperature: input.temperature == null ? null : Math.round(input.temperature * 10),
        observations: input.observations,
        treatment: input.treatment,
        medicines: input.medicines.map((m) => ({ ...m, at: now.toISOString() })),
        outcome: input.outcome,
        leftAt: input.outcome ? now : null,
        recordedBy: access.membershipId,
      })
      .returning();
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "health.visit", summary: `${st.firstName} ${st.lastName} at the sick bay: ${input.complaint}`, entityType: "student", entityId: st.id });
    const told = visit.outcome ? await tellParents(tx, access, visit, st) : 0;
    return { visit, told };
  });
  return result;
}

export const updateVisitSchema = z.object({
  id: z.string().uuid(),
  observations: opt(1000),
  treatment: opt(1000),
  medicines: z.array(medicineSchema).max(10).default([]),
  outcome: z.enum(VISIT_OUTCOMES).nullable().default(null),
});

/** Adds treatment or medicine to an open visit, and closes it when there's an outcome. */
export async function updateVisit(db: DB, access: Access, input: z.infer<typeof updateVisitSchema>, ip?: string | null) {
  requireSickBay(access);
  const now = new Date();
  return withTenant(db, access.school.id, async (tx) => {
    const [visit] = await tx.select().from(sickBayVisits).where(eq(sickBayVisits.id, input.id));
    if (!visit) throw new AppError("That visit wasn't found.", "not_found");
    if (visit.leftAt) throw new AppError("That visit is closed.", "conflict");
    const [st] = await tx.select().from(students).where(eq(students.id, visit.studentId));
    const h = await healthOf(tx, st.id);
    checkMedicines(h?.allergies ?? [], input.medicines, st.firstName);
    const [row] = await tx
      .update(sickBayVisits)
      .set({
        observations: input.observations ?? visit.observations,
        treatment: input.treatment ?? visit.treatment,
        medicines: [...visit.medicines, ...input.medicines.map((m): MedicineGiven => ({ ...m, at: now.toISOString() }))],
        outcome: input.outcome,
        leftAt: input.outcome ? now : null,
      })
      .where(eq(sickBayVisits.id, visit.id))
      .returning();
    if (input.outcome) await recordAudit(tx, access.school.id, actor(access, ip), { action: "health.discharged", summary: `${st.firstName} ${st.lastName} left the sick bay: ${OUTCOME_LABEL[input.outcome].toLowerCase()}`, entityType: "student", entityId: st.id });
    const told = row.outcome ? await tellParents(tx, access, row, st) : 0;
    return { visit: row, told };
  });
}

async function tellParents(tx: Tx, access: Access, visit: typeof sickBayVisits.$inferSelect, st: typeof students.$inferSelect) {
  const s = healthSettings(access.school.healthSettings);
  const serious = visit.outcome === "sent_home" || visit.outcome === "referred";
  if (s.notifyParents === "none" || (s.notifyParents === "serious" && !serious)) return 0;
  const comms = await schoolComms(tx, access.school.id);
  const name = st.firstName;
  const time = lagosClock(visit.arrivedAt);
  const meds = visit.medicines.map((m) => `${m.medicine} ${m.dose}`).join(", ");
  const temp = formatTemp(visit.temperature);
  const how =
    visit.outcome === "sent_home"
      ? "We're sending them home. Please come to pick them up, or call the school."
      : visit.outcome === "referred"
        ? "We've referred them to hospital. Please call the school straight away."
        : `${OUTCOME_LABEL[visit.outcome!]}.`;
  const summary = `${name} came to the sick bay at ${time} with ${visit.complaint.toLowerCase()}.${temp ? ` Temperature ${temp}.` : ""}${meds ? ` Given: ${meds}.` : ""} ${how}`;
  const r = await notifyGuardians(
    tx,
    comms,
    [st.id],
    () => ({
      kind: "health",
      title: serious ? `${name} ${visit.outcome === "sent_home" ? "is being sent home" : "was referred to hospital"}` : `${name} visited the sick bay`,
      body: summary,
      link: `/p/children/${st.id}?tab=health`,
      ref: `sickbay:${visit.id}`,
      sms: `${comms.name}: ${summary}`.slice(0, 300),
      email: { subject: `${comms.name}: ${name} visited the sick bay`, text: `Dear parent,\n\n${summary}${visit.treatment ? `\n\nWhat we did: ${visit.treatment}` : ""}\n\n${comms.name}` },
    }),
    { email: true, sms: serious || s.notifyParents === "every" },
  );
  if (r.told) await tx.update(sickBayVisits).set({ parentsTold: true }).where(eq(sickBayVisits.id, visit.id));
  return r.told;
}

// ---------- Lists ----------

const studentName = sql<string>`${students.firstName} || ' ' || ${students.lastName}`;

function lagosDayStart(iso: string) {
  return new Date(`${iso}T00:00:00+01:00`);
}

export async function sickBayOverview(db: DB, access: Access) {
  requireSickBay(access);
  const today = lagosToday();
  const start = lagosDayStart(today);
  const monthStart = lagosDayStart(`${today.slice(0, 7)}-01`);
  return withTenant(db, access.school.id, async (tx) => {
    const [inBay, todays, [stats]] = await Promise.all([
      tx
        .select({ v: sickBayVisits, name: studentName, className: classes.name, allergies: studentHealth.allergies, conditions: studentHealth.conditions })
        .from(sickBayVisits)
        .innerJoin(students, eq(students.id, sickBayVisits.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .leftJoin(studentHealth, eq(studentHealth.studentId, students.id))
        .where(isNull(sickBayVisits.leftAt))
        .orderBy(asc(sickBayVisits.arrivedAt)),
      tx
        .select({ v: sickBayVisits, name: studentName, className: classes.name })
        .from(sickBayVisits)
        .innerJoin(students, eq(students.id, sickBayVisits.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(and(gte(sickBayVisits.arrivedAt, start), isNotNull(sickBayVisits.leftAt)))
        .orderBy(desc(sickBayVisits.arrivedAt)),
      tx
        .select({
          today: sql<number>`count(*) filter (where ${sickBayVisits.arrivedAt} >= ${start.toISOString()})`.mapWith(Number),
          month: sql<number>`count(*) filter (where ${sickBayVisits.arrivedAt} >= ${monthStart.toISOString()})`.mapWith(Number),
          sentHome: sql<number>`count(*) filter (where ${sickBayVisits.arrivedAt} >= ${monthStart.toISOString()} and ${sickBayVisits.outcome} in ('sent_home', 'referred'))`.mapWith(Number),
          withAllergies: sql<number>`(select count(*) from student_health h where jsonb_array_length(h.allergies) > 0)`.mapWith(Number),
        })
        .from(sickBayVisits),
    ]);
    return { inBay, todays, stats };
  });
}

export async function listVisits(db: DB, access: Access, filter: { q?: string; outcome?: string; from?: string; to?: string; page?: number; all?: boolean } = {}) {
  requireSickBay(access);
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [isNotNull(sickBayVisits.leftAt)];
    if (filter.q) where.push(or(ilike(students.firstName, `%${filter.q}%`), ilike(students.lastName, `%${filter.q}%`), ilike(students.admissionNo, `%${filter.q}%`), ilike(sickBayVisits.complaint, `%${filter.q}%`))!);
    if (filter.outcome && (VISIT_OUTCOMES as readonly string[]).includes(filter.outcome)) where.push(sql`${sickBayVisits.outcome} = ${filter.outcome}`);
    if (filter.from && /^\d{4}-\d{2}-\d{2}$/.test(filter.from)) where.push(gte(sickBayVisits.arrivedAt, lagosDayStart(filter.from)));
    if (filter.to && /^\d{4}-\d{2}-\d{2}$/.test(filter.to)) {
      const end = lagosDayStart(filter.to);
      end.setUTCDate(end.getUTCDate() + 1);
      where.push(lt(sickBayVisits.arrivedAt, end));
    }
    const page = Math.max(1, filter.page ?? 1);
    const base = tx
      .select({ v: sickBayVisits, name: studentName, admissionNo: students.admissionNo, className: classes.name, by: users.name })
      .from(sickBayVisits)
      .innerJoin(students, eq(students.id, sickBayVisits.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(memberships, eq(memberships.id, sickBayVisits.recordedBy))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(and(...where))
      .orderBy(desc(sickBayVisits.arrivedAt));
    const [[{ total }], rows] = await Promise.all([
      tx
        .select({ total: count() })
        .from(sickBayVisits)
        .innerJoin(students, eq(students.id, sickBayVisits.studentId))
        .where(and(...where)),
      filter.all ? base.limit(5000) : base.limit(VISIT_PAGE_SIZE).offset((page - 1) * VISIT_PAGE_SIZE),
    ]);
    return { rows, total };
  });
}

/** Students with allergies or conditions on record, for the nurse's quick reference. */
export async function listHealthRecords(db: DB, access: Access, q?: string) {
  requireSickBay(access);
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({ h: studentHealth, id: students.id, name: studentName, admissionNo: students.admissionNo, className: classes.name, bloodGroup: students.bloodGroup, genotype: students.genotype })
      .from(studentHealth)
      .innerJoin(students, eq(students.id, studentHealth.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(
        and(
          eq(students.status, "active"),
          sql`(jsonb_array_length(${studentHealth.allergies}) > 0 or jsonb_array_length(${studentHealth.conditions}) > 0)`,
          q ? or(ilike(students.firstName, `%${q}%`), ilike(students.lastName, `%${q}%`), sql`${studentHealth.allergies}::text ilike ${`%${q}%`}`, sql`${studentHealth.conditions}::text ilike ${`%${q}%`}`) : undefined,
        ),
      )
      .orderBy(asc(students.firstName))
      .limit(300),
  );
}

/** Active students with what the nurse needs at a glance, for the visit form's picker. */
export async function sickBayStudents(db: DB, access: Access) {
  requireSickBay(access);
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({
        id: students.id,
        name: studentName,
        admissionNo: students.admissionNo,
        className: classes.name,
        bloodGroup: students.bloodGroup,
        genotype: students.genotype,
        allergies: studentHealth.allergies,
        conditions: studentHealth.conditions,
        medicalNotes: students.medicalNotes,
      })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(studentHealth, eq(studentHealth.studentId, students.id))
      .where(eq(students.status, "active"))
      .orderBy(asc(students.firstName), asc(students.lastName)),
  );
}

/** A student's health record and visits, for the student page. */
export async function studentHealthView(db: DB, access: Access, studentId: string) {
  if (!canSeeHealth(access)) throw new AppError("You don't have access to health records.", "forbidden");
  return withTenant(db, access.school.id, async (tx) => {
    const [h, visits] = await Promise.all([healthOf(tx, studentId), tx.select().from(sickBayVisits).where(eq(sickBayVisits.studentId, studentId)).orderBy(desc(sickBayVisits.arrivedAt)).limit(50)]);
    return { record: h, visits, canEdit: can(access, "operations:health") };
  });
}

/** A parent's view: their child's allergies on record and sick bay visits. */
export async function getChildHealth(db: DB, userId: string, studentId: string) {
  const child = await requireChild(db, userId, studentId);
  if (!child.school.features.includes("health")) return null;
  return withTenant(db, child.schoolId, async (tx) => {
    const [h, visits] = await Promise.all([
      healthOf(tx, studentId),
      tx
        .select()
        .from(sickBayVisits)
        .where(and(eq(sickBayVisits.studentId, studentId), isNotNull(sickBayVisits.leftAt)))
        .orderBy(desc(sickBayVisits.arrivedAt))
        .limit(30),
    ]);
    return { record: h, visits };
  });
}
