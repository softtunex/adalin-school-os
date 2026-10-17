import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { classes, schools, students, transportRiders, transportRoutes, transportTrips, transportVehicles, RIDE_DIRECTIONS, TRIP_DIRECTIONS, type TransportSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira } from "../money";
import { hasFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { chargeOnTermInvoices } from "./extra-charges";
import { lagosClock } from "./hr";
import { notifyGuardians, schoolComms } from "./notify";
import { requireChild } from "./parent-portal";

/*
 * School buses: vehicles with their driver and attendant, routes with stops and times, the
 * students on each route, and a register for every trip. Parents can hear when their child
 * gets on the bus, and the bus fee goes onto the term invoice in one step.
 */

export type Direction = (typeof RIDE_DIRECTIONS)[number];
export type TripDirection = (typeof TRIP_DIRECTIONS)[number];
export const DIRECTION_LABEL: Record<Direction, string> = { both: "Morning and afternoon", morning: "Mornings only", afternoon: "Afternoons only" };
export const DEFAULT_TRANSPORT: Required<TransportSettings> = { notifyBoarding: true };

export function transportSettings(s: TransportSettings): Required<TransportSettings> {
  return { ...DEFAULT_TRANSPORT, ...s };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireTransport(access: Access) {
  if (!hasFeature(access.plan, "transport")) throw new AppError("Transport is on the Premium plan.", "upgrade");
  requirePermission(access, "operations:transport");
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times look like 06:45.");

export const transportSettingsSchema = z.object({ notifyBoarding: z.boolean() });

export async function saveTransportSettings(db: DB, access: Access, input: z.infer<typeof transportSettingsSchema>, ip?: string | null) {
  requireTransport(access);
  await db.update(schools).set({ transportSettings: input }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, actor(access, ip), { action: "transport.settings", summary: `Transport: parents ${input.notifyBoarding ? "are" : "aren't"} told when their child gets on the bus` }),
  );
}

// ---------- Vehicles ----------

export const vehicleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name the bus.").max(60),
  plate: opt(20),
  capacity: z.number().int().min(1, "How many seats?").max(100),
  driverName: opt(120),
  driverPhone: opt(30),
  attendantName: opt(120),
  attendantPhone: opt(30),
});

export async function saveVehicle(db: DB, access: Access, input: z.infer<typeof vehicleSchema>, ip?: string | null) {
  requireTransport(access);
  return withTenant(db, access.school.id, async (tx) => {
    const { id, ...values } = input;
    const [row] = id
      ? await tx.update(transportVehicles).set(values).where(eq(transportVehicles.id, id)).returning()
      : await tx
          .insert(transportVehicles)
          .values({ ...values, schoolId: access.school.id })
          .returning();
    if (!row) throw new AppError("That bus wasn't found.", "not_found");
    if (!id) await recordAudit(tx, access.school.id, actor(access, ip), { action: "transport.vehicle", summary: `Added ${row.name}${row.plate ? ` (${row.plate})` : ""}` });
    return row;
  });
}

export async function deleteVehicle(db: DB, access: Access, id: string, ip?: string | null) {
  requireTransport(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.delete(transportVehicles).where(eq(transportVehicles.id, id)).returning();
    if (row) await recordAudit(tx, access.school.id, actor(access, ip), { action: "transport.vehicle_removed", summary: `Removed ${row.name}` });
  });
}

// ---------- Routes ----------

export const routeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name the route.").max(80),
  vehicleId: z.string().uuid().nullable().default(null),
  stops: z
    .array(z.object({ name: z.string().trim().min(1, "Name every stop.").max(80), pickup: time, dropoff: time }))
    .min(1, "Add at least one stop.")
    .max(40),
  termFeeKobo: z.number().int().min(0).max(10_000_000_00),
});

export async function saveRoute(db: DB, access: Access, input: z.infer<typeof routeSchema>, ip?: string | null) {
  requireTransport(access);
  return withTenant(db, access.school.id, async (tx) => {
    const { id, ...values } = input;
    if (id) {
      const names = new Set(values.stops.map((s) => s.name));
      const orphaned = await tx.select({ stop: transportRiders.stop }).from(transportRiders).where(eq(transportRiders.routeId, id));
      const lost = [...new Set(orphaned.map((o) => o.stop).filter((s) => !names.has(s)))];
      if (lost.length) throw new AppError(`Students are picked up at ${lost.join(", ")}. Move them before removing ${lost.length === 1 ? "that stop" : "those stops"}.`, "conflict");
    }
    const [row] = id
      ? await tx.update(transportRoutes).set(values).where(eq(transportRoutes.id, id)).returning()
      : await tx
          .insert(transportRoutes)
          .values({ ...values, schoolId: access.school.id })
          .returning();
    if (!row) throw new AppError("That route wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: id ? "transport.route_updated" : "transport.route",
      summary: `${id ? "Updated" : "Added"} the ${row.name} route (${row.stops.length} stops, ${formatNaira(row.termFeeKobo)} a term)`,
    });
    return row;
  });
}

export async function deleteRoute(db: DB, access: Access, id: string, ip?: string | null) {
  requireTransport(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(transportRiders).where(eq(transportRiders.routeId, id));
    if (n) throw new AppError(`${n} student${n === 1 ? " is" : "s are"} on this route. Move them first.`, "conflict");
    const [row] = await tx.delete(transportRoutes).where(eq(transportRoutes.id, id)).returning();
    if (row) await recordAudit(tx, access.school.id, actor(access, ip), { action: "transport.route_removed", summary: `Removed the ${row.name} route` });
  });
}

// ---------- Riders ----------

export const riderSchema = z.object({
  studentId: z.string().uuid("Choose the student."),
  routeId: z.string().uuid("Choose the route."),
  stop: z.string().trim().min(1, "Choose the stop."),
  direction: z.enum(RIDE_DIRECTIONS).default("both"),
});

/** Puts a student on a route, or moves them to another. Checks the bus has a seat. */
export async function setRider(db: DB, access: Access, input: z.infer<typeof riderSchema>, ip?: string | null) {
  requireTransport(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [route] = await tx.select().from(transportRoutes).where(eq(transportRoutes.id, input.routeId));
    if (!route) throw new AppError("That route wasn't found.", "not_found");
    if (!route.stops.some((s) => s.name === input.stop)) throw new AppError(`${input.stop} isn't a stop on ${route.name}.`, "invalid");
    const [st] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!st || st.status !== "active") throw new AppError("That student wasn't found.", "not_found");
    const [current] = await tx.select().from(transportRiders).where(eq(transportRiders.studentId, st.id));
    if (route.vehicleId && current?.routeId !== route.id) {
      const [bus] = await tx.select().from(transportVehicles).where(eq(transportVehicles.id, route.vehicleId));
      const [{ n }] = await tx.select({ n: count() }).from(transportRiders).where(eq(transportRiders.routeId, route.id));
      if (bus && n >= bus.capacity) throw new AppError(`${bus.name} is full (${bus.capacity} seats).`, "conflict");
    }
    const values = { routeId: route.id, stop: input.stop, direction: input.direction };
    if (current) await tx.update(transportRiders).set(values).where(eq(transportRiders.id, current.id));
    else await tx.insert(transportRiders).values({ ...values, schoolId: access.school.id, studentId: st.id, startedOn: lagosToday() });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: current ? "transport.rider_moved" : "transport.rider_added",
      summary: `${st.firstName} ${st.lastName} ${current ? "moved to" : "put on"} the ${route.name} bus at ${input.stop}`,
      entityType: "student",
      entityId: st.id,
    });
  });
}

export async function removeRider(db: DB, access: Access, studentId: string, ip?: string | null) {
  requireTransport(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.delete(transportRiders).where(eq(transportRiders.studentId, studentId)).returning();
    if (row) await recordAudit(tx, access.school.id, actor(access, ip), { action: "transport.rider_removed", summary: "Took a student off the bus", entityType: "student", entityId: studentId });
  });
}

const studentName = sql<string>`${students.firstName} || ' ' || ${students.lastName}`;

export async function transportOverview(db: DB, access: Access) {
  requireTransport(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [vehicles, routes, riderCounts] = await Promise.all([
      tx.select().from(transportVehicles).orderBy(asc(transportVehicles.name)),
      tx.select().from(transportRoutes).orderBy(asc(transportRoutes.name)),
      tx.select({ routeId: transportRiders.routeId, n: count() }).from(transportRiders).groupBy(transportRiders.routeId),
    ]);
    const riders = new Map(riderCounts.map((r) => [r.routeId, r.n]));
    const rows = routes.map((r) => ({ route: r, vehicle: vehicles.find((v) => v.id === r.vehicleId) ?? null, riders: riders.get(r.id) ?? 0 }));
    const totalRiders = riderCounts.reduce((n, r) => n + r.n, 0);
    const seats = rows.reduce((n, r) => n + (r.vehicle?.capacity ?? 0), 0);
    return { vehicles, routes: rows, stats: { routes: routes.length, riders: totalRiders, seatsFree: Math.max(0, seats - totalRiders), termFees: rows.reduce((n, r) => n + r.riders * r.route.termFeeKobo, 0) } };
  });
}

export async function listRiders(db: DB, access: Access, filter: { q?: string; routeId?: string } = {}) {
  requireTransport(access);
  return withTenant(db, access.school.id, (tx) => {
    const where: SQL[] = [];
    if (filter.routeId) where.push(eq(transportRiders.routeId, filter.routeId));
    if (filter.q) where.push(or(ilike(students.firstName, `%${filter.q}%`), ilike(students.lastName, `%${filter.q}%`), ilike(students.admissionNo, `%${filter.q}%`), ilike(transportRiders.stop, `%${filter.q}%`))!);
    return tx
      .select({ r: transportRiders, name: studentName, admissionNo: students.admissionNo, className: classes.name, route: transportRoutes.name, stops: transportRoutes.stops })
      .from(transportRiders)
      .innerJoin(students, eq(students.id, transportRiders.studentId))
      .innerJoin(transportRoutes, eq(transportRoutes.id, transportRiders.routeId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(and(...where))
      .orderBy(asc(transportRoutes.name), asc(students.firstName))
      .limit(1000);
  });
}

/** Active students for the add-rider picker. */
export async function transportStudents(db: DB, access: Access) {
  requireTransport(access);
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({ id: students.id, name: studentName, admissionNo: students.admissionNo, className: classes.name, onRoute: transportRiders.routeId })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(transportRiders, eq(transportRiders.studentId, students.id))
      .where(eq(students.status, "active"))
      .orderBy(asc(students.firstName), asc(students.lastName)),
  );
}

// ---------- Trips ----------

/** The register for a route today: who should be on this trip and who was marked on. */
export async function getTrip(db: DB, access: Access, routeId: string, direction: TripDirection, date = lagosToday()) {
  requireTransport(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [route] = await tx.select().from(transportRoutes).where(eq(transportRoutes.id, routeId));
    if (!route) throw new AppError("That route wasn't found.", "not_found");
    const [riders, [trip]] = await Promise.all([
      tx
        .select({ studentId: transportRiders.studentId, name: studentName, className: classes.name, stop: transportRiders.stop })
        .from(transportRiders)
        .innerJoin(students, eq(students.id, transportRiders.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(and(eq(transportRiders.routeId, routeId), inArray(transportRiders.direction, ["both", direction]))),
      tx
        .select()
        .from(transportTrips)
        .where(and(eq(transportTrips.routeId, routeId), eq(transportTrips.tripDate, date), eq(transportTrips.direction, direction))),
    ]);
    const order = new Map(route.stops.map((s, i) => [s.name, i]));
    riders.sort((a, b) => (order.get(a.stop) ?? 99) - (order.get(b.stop) ?? 99) || a.name.localeCompare(b.name));
    return { route, riders, trip: trip ?? null, date, direction };
  });
}

export const tripSchema = z.object({
  routeId: z.string().uuid(),
  direction: z.enum(TRIP_DIRECTIONS),
  boarded: z.array(z.string().uuid()).max(200),
});

/** Saves today's register. Parents of children newly marked on are told, if the school wants. */
export async function saveTrip(db: DB, access: Access, input: z.infer<typeof tripSchema>, ip?: string | null) {
  requireTransport(access);
  const date = lagosToday();
  const s = transportSettings(access.school.transportSettings);
  return withTenant(db, access.school.id, async (tx) => {
    const [route] = await tx.select().from(transportRoutes).where(eq(transportRoutes.id, input.routeId));
    if (!route) throw new AppError("That route wasn't found.", "not_found");
    const riders = await tx.select({ studentId: transportRiders.studentId, stop: transportRiders.stop }).from(transportRiders).where(eq(transportRiders.routeId, route.id));
    const allowed = new Set(riders.map((r) => r.studentId));
    const boarded = [...new Set(input.boarded)].filter((id) => allowed.has(id));
    const [prev] = await tx
      .select()
      .from(transportTrips)
      .where(and(eq(transportTrips.routeId, route.id), eq(transportTrips.tripDate, date), eq(transportTrips.direction, input.direction)));
    const now = new Date();
    if (prev) await tx.update(transportTrips).set({ boarded, recordedBy: access.membershipId, recordedAt: now }).where(eq(transportTrips.id, prev.id));
    else await tx.insert(transportTrips).values({ schoolId: access.school.id, routeId: route.id, tripDate: date, direction: input.direction, boarded, recordedBy: access.membershipId, recordedAt: now });
    const fresh = boarded.filter((id) => !prev?.boarded.includes(id));
    let told = 0;
    if (s.notifyBoarding && fresh.length) {
      const comms = await schoolComms(tx, access.school.id);
      const at = lagosClock(now);
      const r = await notifyGuardians(
        tx,
        comms,
        fresh,
        (c) => ({
          kind: "transport",
          title: input.direction === "morning" ? `${c.studentFirstName} is on the school bus` : `${c.studentFirstName} is on the bus home`,
          body: `${c.studentFirstName} got on the ${route.name} bus at ${at}.`,
          link: `/p/children/${c.studentId}?tab=bus`,
          ref: `bus:${route.id}:${date}:${input.direction}:${c.studentId}`,
        }),
        { email: false, sms: false },
      );
      told = r.told;
    }
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "transport.trip", summary: `${route.name} ${input.direction} bus: ${boarded.length} of ${riders.length} on board` });
    return { boarded: boarded.length, of: riders.length, told };
  });
}

// ---------- Billing ----------

/** Adds each rider's route fee to their term invoice for the current term. */
export async function billTransport(db: DB, access: Access, ip?: string | null) {
  requireTransport(access);
  return withTenant(db, access.school.id, async (tx) => {
    const rows = await tx
      .select({ studentId: transportRiders.studentId, fee: transportRoutes.termFeeKobo, route: transportRoutes.name, direction: transportRiders.direction })
      .from(transportRiders)
      .innerJoin(transportRoutes, eq(transportRoutes.id, transportRiders.routeId));
    return chargeOnTermInvoices(
      tx,
      access,
      "School bus",
      rows.map((r) => ({ studentId: r.studentId, amountKobo: r.fee, description: `School bus: ${r.route}${r.direction === "both" ? "" : ` (${r.direction} only)`}` })),
      ip,
    );
  });
}

// ---------- Parents ----------

export async function getChildBus(db: DB, userId: string, studentId: string) {
  const child = await requireChild(db, userId, studentId);
  if (!child.school.features.includes("transport")) return null;
  return withTenant(db, child.schoolId, async (tx) => {
    const [row] = await tx
      .select({ r: transportRiders, route: transportRoutes, vehicle: transportVehicles })
      .from(transportRiders)
      .innerJoin(transportRoutes, eq(transportRoutes.id, transportRiders.routeId))
      .leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId))
      .where(eq(transportRiders.studentId, studentId));
    if (!row) return null;
    const trips = await tx
      .select()
      .from(transportTrips)
      .where(eq(transportTrips.routeId, row.route.id))
      .orderBy(sql`${transportTrips.tripDate} desc`, asc(transportTrips.direction))
      .limit(20);
    return { ...row, stop: row.route.stops.find((s) => s.name === row.r.stop) ?? null, trips: trips.map((t) => ({ date: t.tripDate, direction: t.direction, on: t.boarded.includes(studentId), at: t.recordedAt })) };
  });
}
