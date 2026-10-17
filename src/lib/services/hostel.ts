import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { classes, EXEAT_KINDS, EXEAT_STATUSES, exeats, HOSTEL_GENDERS, hostelBeds, hostelRooms, hostels, memberships, schools, students, users, type HostelSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira } from "../money";
import { hasFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { chargeOnTermInvoices } from "./extra-charges";
import { lagosClock } from "./hr";
import { notifyGuardians, notifyUsers, schoolComms } from "./notify";
import { myChildren, requireChild } from "./parent-portal";

/*
 * Boarding: hostels with rooms and numbered beds, a bed per boarder, and exeats. A parent
 * (or staff) asks for an exeat, the warden approves it, the student is signed out at the
 * gate and back in, and parents hear at each step. Late returns stand out.
 */

export type ExeatKind = (typeof EXEAT_KINDS)[number];
export type ExeatStatus = (typeof EXEAT_STATUSES)[number];
export const EXEAT_KIND_LABEL: Record<ExeatKind, string> = { weekend: "Weekend", day: "Day out", medical: "Medical", family: "Family event", other: "Other" };
export const EXEAT_STATUS_LABEL: Record<ExeatStatus, string> = { pending: "Waiting for approval", approved: "Approved", declined: "Declined", out: "Out of school", back: "Back", cancelled: "Cancelled" };
export const GENDER_LABEL: Record<(typeof HOSTEL_GENDERS)[number], string> = { male: "Boys", female: "Girls", mixed: "Mixed" };
export const DEFAULT_HOSTEL: Required<HostelSettings> = { parentRequests: true, notifyMovements: true };

export function hostelSettings(s: HostelSettings): Required<HostelSettings> {
  return { ...DEFAULT_HOSTEL, ...s };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireHostel(access: Access) {
  if (!hasFeature(access.plan, "hostel")) throw new AppError("Boarding is on the Premium plan.", "upgrade");
  requirePermission(access, "operations:hostel");
}

const studentName = sql<string>`${students.firstName} || ' ' || ${students.lastName}`;

export function when(d: Date) {
  return `${d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" })}, ${lagosClock(d)}`;
}

// ---------- Settings ----------

export const hostelSettingsSchema = z.object({ parentRequests: z.boolean(), notifyMovements: z.boolean() });

export async function saveHostelSettings(db: DB, access: Access, input: z.infer<typeof hostelSettingsSchema>, ip?: string | null) {
  requireHostel(access);
  await db.update(schools).set({ hostelSettings: input }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, actor(access, ip), {
      action: "hostel.settings",
      summary: `Boarding: parents ${input.parentRequests ? "can" : "can't"} ask for exeats in the app; ${input.notifyMovements ? "told" : "not told"} when their child signs out and back`,
    }),
  );
}

// ---------- Hostels and rooms ----------

export const hostelSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name the hostel.").max(80),
  gender: z.enum(HOSTEL_GENDERS),
  wardenId: z.string().uuid().nullable().default(null),
  termFeeKobo: z.number().int().min(0).max(100_000_000_00),
});

export async function saveHostel(db: DB, access: Access, input: z.infer<typeof hostelSchema>, ip?: string | null) {
  requireHostel(access);
  return withTenant(db, access.school.id, async (tx) => {
    const { id, ...values } = input;
    if (id && input.gender !== "mixed") {
      const [clash] = await tx
        .select({ name: studentName })
        .from(hostelBeds)
        .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
        .innerJoin(students, eq(students.id, hostelBeds.studentId))
        .where(and(eq(hostelRooms.hostelId, id), sql`${students.gender} <> ${input.gender}`))
        .limit(1);
      if (clash) throw new AppError(`${clash.name} sleeps here, so it can't be ${GENDER_LABEL[input.gender].toLowerCase()} only.`, "conflict");
    }
    const [row] = id
      ? await tx.update(hostels).set(values).where(eq(hostels.id, id)).returning()
      : await tx
          .insert(hostels)
          .values({ ...values, schoolId: access.school.id })
          .returning();
    if (!row) throw new AppError("That hostel wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: id ? "hostel.updated" : "hostel.added", summary: `${id ? "Updated" : "Added"} ${row.name} (${formatNaira(row.termFeeKobo)} a term)` });
    return row;
  });
}

export async function deleteHostel(db: DB, access: Access, id: string, ip?: string | null) {
  requireHostel(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(hostelBeds).innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId)).where(eq(hostelRooms.hostelId, id));
    if (n) throw new AppError(`${n} boarder${n === 1 ? " sleeps" : "s sleep"} here. Move them first.`, "conflict");
    const [row] = await tx.delete(hostels).where(eq(hostels.id, id)).returning();
    if (row) await recordAudit(tx, access.school.id, actor(access, ip), { action: "hostel.removed", summary: `Removed ${row.name}` });
  });
}

export const roomSchema = z.object({
  id: z.string().uuid().optional(),
  hostelId: z.string().uuid(),
  name: z.string().trim().min(1, "Name the room.").max(60),
  beds: z.number().int().min(1, "At least one bed.").max(200),
});

export async function saveRoom(db: DB, access: Access, input: z.infer<typeof roomSchema>, ip?: string | null) {
  requireHostel(access);
  return withTenant(db, access.school.id, async (tx) => {
    if (input.id) {
      const [{ top }] = await tx.select({ top: sql<number>`coalesce(max(${hostelBeds.bed}), 0)`.mapWith(Number) }).from(hostelBeds).where(eq(hostelBeds.roomId, input.id));
      if (input.beds < top) throw new AppError(`Bed ${top} is taken, so the room needs at least ${top} beds.`, "conflict");
    }
    const [dup] = await tx
      .select({ id: hostelRooms.id })
      .from(hostelRooms)
      .where(and(eq(hostelRooms.hostelId, input.hostelId), sql`lower(${hostelRooms.name}) = lower(${input.name})`, input.id ? sql`${hostelRooms.id} <> ${input.id}` : undefined));
    if (dup) throw new AppError(`There's already a ${input.name} in this hostel.`, "conflict");
    const [row] = input.id
      ? await tx.update(hostelRooms).set({ name: input.name, beds: input.beds }).where(eq(hostelRooms.id, input.id)).returning()
      : await tx.insert(hostelRooms).values({ schoolId: access.school.id, hostelId: input.hostelId, name: input.name, beds: input.beds }).returning();
    if (!row) throw new AppError("That room wasn't found.", "not_found");
    if (!input.id) await recordAudit(tx, access.school.id, actor(access, ip), { action: "hostel.room", summary: `Added ${row.name} (${row.beds} beds)` });
    return row;
  });
}

export async function deleteRoom(db: DB, access: Access, id: string, ip?: string | null) {
  requireHostel(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(hostelBeds).where(eq(hostelBeds.roomId, id));
    if (n) throw new AppError(`${n} boarder${n === 1 ? " sleeps" : "s sleep"} in this room. Move them first.`, "conflict");
    const [row] = await tx.delete(hostelRooms).where(eq(hostelRooms.id, id)).returning();
    if (row) await recordAudit(tx, access.school.id, actor(access, ip), { action: "hostel.room_removed", summary: `Removed ${row.name}` });
  });
}

// ---------- Beds ----------

export const bedSchema = z.object({
  studentId: z.string().uuid("Choose the student."),
  roomId: z.string().uuid("Choose the room."),
  bed: z.number().int().min(1).nullable().default(null),
});

/** Gives a student a bed (the first free one unless a number is chosen), or moves them. */
export async function assignBed(db: DB, access: Access, input: z.infer<typeof bedSchema>, ip?: string | null) {
  requireHostel(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [room] = await tx.select({ room: hostelRooms, hostel: hostels }).from(hostelRooms).innerJoin(hostels, eq(hostels.id, hostelRooms.hostelId)).where(eq(hostelRooms.id, input.roomId));
    if (!room) throw new AppError("That room wasn't found.", "not_found");
    const [st] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!st || st.status !== "active") throw new AppError("That student wasn't found.", "not_found");
    if (room.hostel.gender !== "mixed" && room.hostel.gender !== st.gender) throw new AppError(`${room.hostel.name} is for ${GENDER_LABEL[room.hostel.gender].toLowerCase()}.`, "conflict");
    const [current] = await tx.select().from(hostelBeds).where(eq(hostelBeds.studentId, st.id));
    const taken = new Set(
      (await tx.select({ bed: hostelBeds.bed, studentId: hostelBeds.studentId }).from(hostelBeds).where(eq(hostelBeds.roomId, room.room.id))).filter((b) => b.studentId !== st.id).map((b) => b.bed),
    );
    let bed = input.bed;
    if (bed) {
      if (bed > room.room.beds) throw new AppError(`${room.room.name} has ${room.room.beds} beds.`, "invalid");
      if (taken.has(bed)) throw new AppError(`Bed ${bed} in ${room.room.name} is taken.`, "conflict");
    } else {
      bed = Array.from({ length: room.room.beds }, (_, i) => i + 1).find((b) => !taken.has(b)) ?? null;
      if (!bed) throw new AppError(`${room.room.name} is full.`, "conflict");
    }
    if (current) await tx.update(hostelBeds).set({ roomId: room.room.id, bed }).where(eq(hostelBeds.id, current.id));
    else await tx.insert(hostelBeds).values({ schoolId: access.school.id, studentId: st.id, roomId: room.room.id, bed, since: lagosToday() });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: current ? "hostel.moved" : "hostel.bed",
      summary: `${st.firstName} ${st.lastName} ${current ? "moved to" : "given"} ${room.hostel.name}, ${room.room.name}, bed ${bed}`,
      entityType: "student",
      entityId: st.id,
    });
    return { bed, room: room.room.name, hostel: room.hostel.name };
  });
}

export async function removeBoarder(db: DB, access: Access, studentId: string, ip?: string | null) {
  requireHostel(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.delete(hostelBeds).where(eq(hostelBeds.studentId, studentId)).returning();
    if (row) await recordAudit(tx, access.school.id, actor(access, ip), { action: "hostel.left", summary: "A boarder became a day student", entityType: "student", entityId: studentId });
  });
}

export async function hostelOverview(db: DB, access: Access) {
  requireHostel(access);
  return withTenant(db, access.school.id, async (tx) => {
    const now = new Date();
    const [hs, rooms, beds, wardens, [ex]] = await Promise.all([
      tx.select().from(hostels).orderBy(asc(hostels.name)),
      tx.select().from(hostelRooms).orderBy(asc(hostelRooms.name)),
      tx
        .select({ roomId: hostelBeds.roomId, bed: hostelBeds.bed, studentId: hostelBeds.studentId, name: studentName, className: classes.name })
        .from(hostelBeds)
        .innerJoin(students, eq(students.id, hostelBeds.studentId))
        .leftJoin(classes, eq(classes.id, students.classId)),
      tx.select({ id: memberships.id, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.status, "active")),
      tx
        .select({
          pending: sql<number>`count(*) filter (where ${exeats.status} = 'pending')`.mapWith(Number),
          out: sql<number>`count(*) filter (where ${exeats.status} = 'out')`.mapWith(Number),
          late: sql<number>`count(*) filter (where ${exeats.status} = 'out' and ${exeats.returnBy} < ${now.toISOString()})`.mapWith(Number),
        })
        .from(exeats),
    ]);
    const list = hs.map((h) => {
      const rs = rooms
        .filter((r) => r.hostelId === h.id)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((r) => ({ room: r, occupants: beds.filter((b) => b.roomId === r.id).sort((a, b) => a.bed - b.bed) }));
      return {
        hostel: h,
        warden: wardens.find((w) => w.id === h.wardenId)?.name ?? null,
        rooms: rs,
        beds: rs.reduce((n, r) => n + r.room.beds, 0),
        boarders: rs.reduce((n, r) => n + r.occupants.length, 0),
      };
    });
    const totalBeds = list.reduce((n, h) => n + h.beds, 0);
    return {
      hostels: list,
      staff: wardens.sort((a, b) => a.name.localeCompare(b.name)),
      stats: { boarders: beds.length, bedsFree: Math.max(0, totalBeds - beds.length), pending: ex.pending, out: ex.out, late: ex.late, fees: list.reduce((n, h) => n + h.boarders * h.hostel.termFeeKobo, 0) },
    };
  });
}

export async function listBoarders(db: DB, access: Access, filter: { q?: string; hostelId?: string } = {}) {
  requireHostel(access);
  return withTenant(db, access.school.id, (tx) => {
    const where: SQL[] = [];
    if (filter.hostelId) where.push(eq(hostels.id, filter.hostelId));
    if (filter.q) where.push(or(ilike(students.firstName, `%${filter.q}%`), ilike(students.lastName, `%${filter.q}%`), ilike(students.admissionNo, `%${filter.q}%`), ilike(hostelRooms.name, `%${filter.q}%`))!);
    return tx
      .select({ b: hostelBeds, name: studentName, gender: students.gender, admissionNo: students.admissionNo, className: classes.name, room: hostelRooms.name, roomId: hostelRooms.id, hostel: hostels.name, hostelId: hostels.id })
      .from(hostelBeds)
      .innerJoin(students, eq(students.id, hostelBeds.studentId))
      .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
      .innerJoin(hostels, eq(hostels.id, hostelRooms.hostelId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(and(...where))
      .orderBy(asc(hostels.name), asc(hostelRooms.name), asc(hostelBeds.bed))
      .limit(2000);
  });
}

/** Active students for the pickers, with their bed if they have one. */
export async function hostelStudents(db: DB, access: Access) {
  requireHostel(access);
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({ id: students.id, name: studentName, admissionNo: students.admissionNo, gender: students.gender, className: classes.name, roomId: hostelBeds.roomId })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(hostelBeds, eq(hostelBeds.studentId, students.id))
      .where(eq(students.status, "active"))
      .orderBy(asc(students.firstName), asc(students.lastName)),
  );
}

// ---------- Exeats ----------

const stamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time.");
/** "2026-10-23T15:00" in Lagos time. */
export function lagosStamp(s: string) {
  return new Date(`${s}:00+01:00`);
}

export const exeatSchema = z
  .object({
    studentId: z.string().uuid(),
    kind: z.enum(EXEAT_KINDS),
    reason: z.string().trim().min(3, "Say why they're going.").max(500),
    leaveAt: stamp,
    returnBy: stamp,
    collectedBy: z.string().trim().max(160).optional().transform((v) => v || null),
  })
  .refine((v) => v.returnBy > v.leaveAt, { path: ["returnBy"], message: "They have to come back after they leave." });

async function boarderOrThrow(tx: Tx, studentId: string) {
  const [row] = await tx.select({ st: students }).from(hostelBeds).innerJoin(students, eq(students.id, hostelBeds.studentId)).where(eq(hostelBeds.studentId, studentId));
  if (!row) throw new AppError("Only boarders need an exeat.", "invalid");
  return row.st;
}

async function wardensOf(tx: Tx, studentId: string) {
  const rows = await tx
    .select({ userId: memberships.userId })
    .from(hostelBeds)
    .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
    .innerJoin(hostels, eq(hostels.id, hostelRooms.hostelId))
    .innerJoin(memberships, eq(memberships.id, hostels.wardenId))
    .where(eq(hostelBeds.studentId, studentId));
  return rows.map((r) => r.userId);
}

/** Staff record an exeat. They hold the permission, so it starts approved. */
export async function createExeat(db: DB, access: Access, input: z.infer<typeof exeatSchema>, ip?: string | null) {
  requireHostel(access);
  return withTenant(db, access.school.id, async (tx) => {
    const st = await boarderOrThrow(tx, input.studentId);
    const [row] = await tx
      .insert(exeats)
      .values({
        schoolId: access.school.id,
        studentId: st.id,
        kind: input.kind,
        reason: input.reason,
        leaveAt: lagosStamp(input.leaveAt),
        returnBy: lagosStamp(input.returnBy),
        collectedBy: input.collectedBy,
        status: "approved",
        requestedByStaff: true,
        decidedBy: access.membershipId,
      })
      .returning();
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "hostel.exeat", summary: `Exeat for ${st.firstName} ${st.lastName}: ${EXEAT_KIND_LABEL[input.kind].toLowerCase()}`, entityType: "student", entityId: st.id });
    await tellParents(tx, access.school.id, row, st, "approved");
    return row;
  });
}

/** A parent asks for an exeat from the app. The warden is told. */
export async function requestExeat(db: DB, userId: string, input: z.infer<typeof exeatSchema>) {
  const child = await requireChild(db, userId, input.studentId);
  if (!child.school.features.includes("hostel")) throw new AppError("Boarding isn't switched on.", "upgrade");
  return withTenant(db, child.schoolId, async (tx) => {
    const [school] = await tx.select({ s: schools.hostelSettings }).from(schools).where(eq(schools.id, child.schoolId));
    if (!hostelSettings(school.s).parentRequests) throw new AppError("The school takes exeat requests in person.", "forbidden");
    const st = await boarderOrThrow(tx, input.studentId);
    if (lagosStamp(input.leaveAt) < new Date()) throw new AppError("Choose a time that hasn't passed.", "invalid");
    const [open] = await tx
      .select({ id: exeats.id })
      .from(exeats)
      .where(and(eq(exeats.studentId, st.id), inArray(exeats.status, ["pending", "approved", "out"])));
    if (open) throw new AppError(`${st.firstName} already has an exeat open. Wait for it to finish, or cancel it.`, "conflict");
    const [row] = await tx
      .insert(exeats)
      .values({
        schoolId: child.schoolId,
        studentId: st.id,
        kind: input.kind,
        reason: input.reason,
        leaveAt: lagosStamp(input.leaveAt),
        returnBy: lagosStamp(input.returnBy),
        collectedBy: input.collectedBy,
        requestedByUser: userId,
      })
      .returning();
    await notifyUsers(tx, child.schoolId, await wardensOf(tx, st.id), {
      kind: "exeat",
      title: `Exeat request for ${st.firstName} ${st.lastName}`,
      body: `${EXEAT_KIND_LABEL[input.kind]}: leaving ${when(row.leaveAt)}, back by ${when(row.returnBy)}.`,
      link: `/s/${child.school.slug}/hostel?tab=exeats`,
      ref: `exeat:${row.id}`,
    });
    return row;
  });
}

export async function cancelExeat(db: DB, userId: string, exeatId: string) {
  return withTenantForParent(db, userId, exeatId, async (tx, row) => {
    if (row.status !== "pending" && row.status !== "approved") throw new AppError("This exeat can't be cancelled now.", "conflict");
    await tx.update(exeats).set({ status: "cancelled" }).where(eq(exeats.id, row.id));
  });
}

async function withTenantForParent<T>(db: DB, userId: string, exeatId: string, fn: (tx: Tx, row: typeof exeats.$inferSelect) => Promise<T>) {
  const kids = await myChildren(db, userId);
  for (const k of kids) {
    const out = await withTenant(db, k.schoolId, async (tx) => {
      const [row] = await tx.select().from(exeats).where(and(eq(exeats.id, exeatId), eq(exeats.studentId, k.studentId)));
      return row ? { row, value: await fn(tx, row) } : null;
    });
    if (out) return out.value;
  }
  throw new AppError("That exeat wasn't found.", "not_found");
}

const MOVES: Record<"approve" | "decline" | "out" | "back", { from: ExeatStatus[]; to: ExeatStatus }> = {
  approve: { from: ["pending"], to: "approved" },
  decline: { from: ["pending", "approved"], to: "declined" },
  out: { from: ["approved"], to: "out" },
  back: { from: ["out"], to: "back" },
};

/** The warden approves or declines, then signs the student out and back in at the gate. */
export async function moveExeat(db: DB, access: Access, input: { id: string; action: keyof typeof MOVES; note?: string }, ip?: string | null) {
  requireHostel(access);
  const step = MOVES[input.action];
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.select().from(exeats).where(eq(exeats.id, input.id));
    if (!row) throw new AppError("That exeat wasn't found.", "not_found");
    if (!step.from.includes(row.status)) throw new AppError(`It's ${EXEAT_STATUS_LABEL[row.status].toLowerCase()}, so it can't be ${input.action === "out" ? "signed out" : input.action === "back" ? "signed in" : `${input.action}d`}.`, "conflict");
    const now = new Date();
    const [updated] = await tx
      .update(exeats)
      .set({
        status: step.to,
        ...(input.action === "approve" || input.action === "decline" ? { decidedBy: access.membershipId, decisionNote: input.note?.trim() || null } : {}),
        ...(input.action === "out" ? { outAt: now } : {}),
        ...(input.action === "back" ? { backAt: now } : {}),
      })
      .where(eq(exeats.id, row.id))
      .returning();
    const [st] = await tx.select().from(students).where(eq(students.id, row.studentId));
    const late = input.action === "back" && now > row.returnBy;
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: `hostel.exeat_${input.action}`,
      summary: `${st.firstName} ${st.lastName}: exeat ${{ approve: "approved", decline: "declined", out: "signed out", back: late ? "back late" : "back" }[input.action]}`,
      entityType: "student",
      entityId: st.id,
    });
    await tellParents(tx, access.school.id, updated, st, step.to, late);
    return { exeat: updated, late };
  });
}

async function tellParents(tx: Tx, schoolId: string, row: typeof exeats.$inferSelect, st: typeof students.$inferSelect, status: ExeatStatus, late = false) {
  const [school] = await tx.select({ s: schools.hostelSettings }).from(schools).where(eq(schools.id, schoolId));
  const s = hostelSettings(school.s);
  if ((status === "out" || status === "back") && !s.notifyMovements) return 0;
  const comms = await schoolComms(tx, schoolId);
  const name = st.firstName;
  const text = {
    approved: [`Exeat approved for ${name}`, `${name} may leave ${when(row.leaveAt)} and must be back by ${when(row.returnBy)}.`],
    declined: [`Exeat not approved for ${name}`, row.decisionNote ? `The school said: ${row.decisionNote}` : "Please contact the school if you'd like to discuss it."],
    out: [`${name} has signed out of school`, `Signed out at ${lagosClock(row.outAt ?? new Date())}${row.collectedBy ? ` with ${row.collectedBy}` : ""}. Back by ${when(row.returnBy)}.`],
    back: [late ? `${name} is back, late` : `${name} is back in school`, `Signed back in at ${lagosClock(row.backAt ?? new Date())}.${late ? ` They were due by ${when(row.returnBy)}.` : ""}`],
  } as Partial<Record<ExeatStatus, [string, string]>>;
  const t = text[status];
  if (!t) return 0;
  const r = await notifyGuardians(
    tx,
    comms,
    [st.id],
    () => ({ kind: "exeat", title: t[0], body: t[1], link: `/p/children/${st.id}?tab=hostel`, ref: `exeat:${row.id}:${status}`, sms: status === "out" || status === "back" ? `${comms.name}: ${t[1]}` : undefined }),
    { email: status === "approved" || status === "declined", sms: status === "out" || status === "back" },
  );
  return r.told;
}

export async function listExeats(db: DB, access: Access, filter: { view?: string; q?: string } = {}) {
  requireHostel(access);
  return withTenant(db, access.school.id, (tx) => {
    const where: SQL[] = [];
    const now = new Date().toISOString();
    if (filter.view === "pending") where.push(eq(exeats.status, "pending"));
    else if (filter.view === "out") where.push(eq(exeats.status, "out"));
    else if (filter.view === "late") where.push(eq(exeats.status, "out"), sql`${exeats.returnBy} < ${now}`);
    else if (filter.view === "upcoming") where.push(eq(exeats.status, "approved"));
    else if (filter.view === "done") where.push(inArray(exeats.status, ["back", "declined", "cancelled"]));
    if (filter.q) where.push(or(ilike(students.firstName, `%${filter.q}%`), ilike(students.lastName, `%${filter.q}%`), ilike(exeats.reason, `%${filter.q}%`))!);
    return tx
      .select({ e: exeats, name: studentName, className: classes.name, room: hostelRooms.name, hostel: hostels.name })
      .from(exeats)
      .innerJoin(students, eq(students.id, exeats.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(hostelBeds, eq(hostelBeds.studentId, students.id))
      .leftJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
      .leftJoin(hostels, eq(hostels.id, hostelRooms.hostelId))
      .where(and(...where))
      .orderBy(filter.view === "done" ? desc(exeats.leaveAt) : asc(exeats.leaveAt))
      .limit(300);
  });
}

// ---------- Billing ----------

export async function billBoarding(db: DB, access: Access, ip?: string | null) {
  requireHostel(access);
  return withTenant(db, access.school.id, async (tx) => {
    const rows = await tx
      .select({ studentId: hostelBeds.studentId, fee: hostels.termFeeKobo, hostel: hostels.name })
      .from(hostelBeds)
      .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
      .innerJoin(hostels, eq(hostels.id, hostelRooms.hostelId));
    return chargeOnTermInvoices(tx, access, "Boarding", rows.map((r) => ({ studentId: r.studentId, amountKobo: r.fee, description: `Boarding: ${r.hostel}` })), ip);
  });
}

// ---------- Parents ----------

export async function getChildBoarding(db: DB, userId: string, studentId: string) {
  const child = await requireChild(db, userId, studentId);
  if (!child.school.features.includes("hostel")) return null;
  return withTenant(db, child.schoolId, async (tx) => {
    const [bed] = await tx
      .select({ b: hostelBeds, room: hostelRooms.name, hostel: hostels.name, warden: users.name, wardenPhone: users.phone })
      .from(hostelBeds)
      .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
      .innerJoin(hostels, eq(hostels.id, hostelRooms.hostelId))
      .leftJoin(memberships, eq(memberships.id, hostels.wardenId))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(eq(hostelBeds.studentId, studentId));
    if (!bed) return null;
    const [list, [school]] = await Promise.all([
      tx.select().from(exeats).where(eq(exeats.studentId, studentId)).orderBy(desc(exeats.leaveAt)).limit(20),
      tx.select({ s: schools.hostelSettings }).from(schools).where(eq(schools.id, child.schoolId)),
    ]);
    return { ...bed, exeats: list, canRequest: hostelSettings(school.s).parentRequests, today: lagosToday() };
  });
}
