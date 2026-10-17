import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { invoiceLines, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { saveFeeItem, saveFeeStructure } from "@/lib/services/fees";
import { generateTermInvoices } from "@/lib/services/invoices";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import {
  billTransport,
  getTrip,
  listRiders,
  removeRider,
  riderSchema,
  routeSchema,
  saveRoute,
  saveTrip,
  saveVehicle,
  setRider,
  transportOverview,
  tripSchema,
  vehicleSchema,
} from "@/lib/services/transport";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let officer: Access;
let teacher: Access;
let termId: string;
const kids: Record<string, string> = {};
let lekki: string;

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mr Bus", email: "bus@transport.test", password: "Transport1", schoolName: "Bus College" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  const gold = overview.levels[0].classes[0].id;
  termId = overview.sessions.flatMap((s) => s.terms).find((t) => t.isCurrent)!.id;
  officer = await staff("transport_officer", "officer@transport.test");
  teacher = await staff("subject_teacher", "teach@transport.test");
  for (const name of ["Ada", "Bayo", "Chidi"]) kids[name] = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Ride", gender: "female", classId: gold }), [])).id;
  const tuition = (await saveFeeItem(database.db, owner, { name: "Tuition", isOptional: false })).id;
  await saveFeeStructure(database.db, owner, { termId, amounts: [{ levelId: overview.levels[0].id, itemId: tuition, amount: 100_000_00 }] });
  await generateTermInvoices(database.db, owner, { termId });
});

afterAll(async () => {
  await database.close();
});

describe("transport", () => {
  it("sets up buses and routes for the transport officer only", async () => {
    await expect(saveVehicle(database.db, teacher, vehicleSchema.parse({ name: "Bus 1", capacity: 2 }))).rejects.toThrow(/permission/);
    const bus = await saveVehicle(database.db, officer, vehicleSchema.parse({ name: "Bus 1", plate: "LND 234 XY", capacity: 2, driverName: "Mr Musa", driverPhone: "0803 000 0001" }));
    expect(routeSchema.safeParse({ name: "Lekki", stops: [{ name: "Ajah", pickup: "6:45", dropoff: "15:30" }], termFeeKobo: 0 }).success).toBe(false);
    lekki = (
      await saveRoute(
        database.db,
        officer,
        routeSchema.parse({
          name: "Lekki – Ajah",
          vehicleId: bus.id,
          termFeeKobo: 45_000_00,
          stops: [
            { name: "Ajah roundabout", pickup: "06:30", dropoff: "15:50" },
            { name: "Jakande", pickup: "06:45", dropoff: "15:35" },
          ],
        }),
      )
    ).id;
  });

  it("puts students on a route within the bus's seats", async () => {
    await expect(setRider(database.db, officer, riderSchema.parse({ studentId: kids.Ada, routeId: lekki, stop: "Ikoyi" }))).rejects.toThrow(/isn't a stop/);
    await setRider(database.db, officer, riderSchema.parse({ studentId: kids.Ada, routeId: lekki, stop: "Jakande" }));
    await setRider(database.db, officer, riderSchema.parse({ studentId: kids.Bayo, routeId: lekki, stop: "Ajah roundabout", direction: "morning" }));
    await expect(setRider(database.db, officer, riderSchema.parse({ studentId: kids.Chidi, routeId: lekki, stop: "Jakande" }))).rejects.toThrow(/full \(2 seats\)/);
    await setRider(database.db, officer, riderSchema.parse({ studentId: kids.Ada, routeId: lekki, stop: "Ajah roundabout" }));
    expect((await listRiders(database.db, officer)).map((r) => [r.name, r.r.stop])).toEqual([
      ["Ada Ride", "Ajah roundabout"],
      ["Bayo Ride", "Ajah roundabout"],
    ]);
    await expect(saveRoute(database.db, officer, routeSchema.parse({ id: lekki, name: "Lekki – Ajah", termFeeKobo: 45_000_00, stops: [{ name: "Jakande", pickup: "06:45", dropoff: "15:35" }] }))).rejects.toThrow(/Ajah roundabout/);
    expect((await transportOverview(database.db, officer)).stats).toMatchObject({ routes: 1, riders: 2, seatsFree: 0, termFees: 90_000_00 });
  });

  it("keeps a register per trip, only for riders on that trip", async () => {
    const afternoon = await getTrip(database.db, officer, lekki, "afternoon");
    expect(afternoon.riders.map((r) => r.name)).toEqual(["Ada Ride"]);
    const r = await saveTrip(database.db, officer, tripSchema.parse({ routeId: lekki, direction: "morning", boarded: [kids.Ada, kids.Chidi] }));
    expect(r).toMatchObject({ boarded: 1, of: 2 });
    expect((await getTrip(database.db, officer, lekki, "morning")).trip?.boarded).toEqual([kids.Ada]);
  });

  it("bills the bus fee once onto term invoices, by staff who raise invoices", async () => {
    await expect(billTransport(database.db, officer)).rejects.toThrow(/raise invoices/);
    const first = await billTransport(database.db, owner);
    expect(first).toMatchObject({ added: 2, already: 0, noInvoice: 0, totalKobo: 90_000_00 });
    expect(await billTransport(database.db, owner)).toMatchObject({ added: 0, already: 2 });
    const lines = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(invoiceLines).where(eq(invoiceLines.amountKobo, 45_000_00)));
    expect(lines.map((l) => l.description).sort()).toEqual(["School bus: Lekki – Ajah", "School bus: Lekki – Ajah (morning only)"]);
    await removeRider(database.db, officer, kids.Bayo);
    expect((await listRiders(database.db, officer)).length).toBe(1);
  });
});
