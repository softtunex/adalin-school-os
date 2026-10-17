/*
 * The demo school's buses: a transport officer (Mr Tunde Bakare, transport9@demo.schoolos.ng,
 * password Demo2026!), three buses on three Lagos routes, students on each, and this morning's
 * bus register. Oluwaseun Lawal rides the Lekki bus from Jakande. Run with the dev server stopped.
 */
import { asc, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { roles, students, transportRoutes } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { acceptInvitation, inviteStaff } from "../src/lib/services/staff";
import { listRiders, riderSchema, routeSchema, saveRoute, saveTrip, saveVehicle, setRider, tripSchema, vehicleSchema } from "../src/lib/services/transport";

const BUSES = [
  { name: "Bus 1 (Coaster)", plate: "LND 234 XY", capacity: 26, driverName: "Mr Musa Abdullahi", driverPhone: "0803 412 7781", attendantName: "Mrs Rose Eze", attendantPhone: "0806 115 2093" },
  { name: "Bus 2 (Hiace)", plate: "KJA 581 BC", capacity: 14, driverName: "Mr Femi Oladipo", driverPhone: "0812 330 4456", attendantName: "Miss Joy Akpan", attendantPhone: "0703 228 9011" },
  { name: "Bus 3 (Hiace)", plate: "EPE 902 FG", capacity: 14, driverName: "Mr Sunday Okon", driverPhone: "0905 774 3120" },
];

const ROUTES = [
  {
    name: "Lekki – Ajah",
    bus: 0,
    fee: 65_000,
    stops: [
      ["Ajah roundabout", "06:20", "16:05"],
      ["Abraham Adesanya", "06:30", "15:55"],
      ["Jakande", "06:45", "15:40"],
      ["Chevron", "06:55", "15:30"],
      ["Lekki Phase 1 gate", "07:10", "15:15"],
    ],
  },
  {
    name: "Ikeja – Maryland",
    bus: 1,
    fee: 55_000,
    stops: [
      ["Allen roundabout", "06:35", "15:50"],
      ["Ikeja GRA (Isaac John)", "06:45", "15:40"],
      ["Maryland Mall", "07:00", "15:25"],
    ],
  },
  {
    name: "Surulere – Yaba",
    bus: 2,
    fee: 50_000,
    stops: [
      ["Adeniran Ogunsanya", "06:40", "15:45"],
      ["Ojuelegba", "06:50", "15:35"],
      ["Sabo, Yaba", "07:05", "15:20"],
    ],
  },
];

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const existing = await withTenant(db, owner.school.id, (tx) => tx.select({ id: transportRoutes.id }).from(transportRoutes).limit(1));
  if (existing.length) {
    console.log("Transport demo data already there.");
    await database.close();
    return;
  }
  let officerUser = await findUserByEmail(db, "transport9@demo.schoolos.ng");
  if (!officerUser) {
    const [role] = await withTenant(db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "transport_officer")));
    const { token } = await inviteStaff(db, owner, { name: "Mr Tunde Bakare", email: "transport9@demo.schoolos.ng", roleIds: [role.id] });
    await acceptInvitation(db, token, { name: "Mr Tunde Bakare", password: "Demo2026!" });
    officerUser = await findUserByEmail(db, "transport9@demo.schoolos.ng");
  }
  const officer = (await loadAccess(db, officerUser!.id, "adalin-college"))!;
  const buses = [];
  for (const b of BUSES) buses.push(await saveVehicle(db, officer, vehicleSchema.parse(b)));
  const routes = [];
  for (const r of ROUTES) {
    routes.push(
      await saveRoute(
        db,
        officer,
        routeSchema.parse({ name: r.name, vehicleId: buses[r.bus].id, termFeeKobo: r.fee * 100, stops: r.stops.map(([name, pickup, dropoff]) => ({ name, pickup, dropoff })) }),
      ),
    );
  }
  const kids = await withTenant(db, owner.school.id, (tx) => tx.select().from(students).where(eq(students.status, "active")).orderBy(asc(students.admissionNo)));
  const seun = kids.find((k) => k.admissionNo === "ADC/2026/0009");
  const others = kids.filter((k) => k.id !== seun?.id);
  if (seun) await setRider(db, officer, riderSchema.parse({ studentId: seun.id, routeId: routes[0].id, stop: "Jakande" }));
  const plan: [route: number, count: number][] = [
    [0, 11],
    [1, 8],
    [2, 6],
  ];
  let k = 0;
  for (const [ri, count] of plan) {
    const stops = ROUTES[ri].stops;
    for (let i = 0; i < count && k < others.length; i++, k += 2) {
      await setRider(db, officer, riderSchema.parse({ studentId: others[k].id, routeId: routes[ri].id, stop: stops[i % stops.length][0], direction: i % 7 === 3 ? "morning" : i % 9 === 5 ? "afternoon" : "both" }));
    }
  }
  // This morning's registers: everyone on except a couple.
  for (const [ri] of plan.slice(0, 2)) {
    const riders = (await listRiders(db, officer, { routeId: routes[ri].id })).filter((r) => r.r.direction !== "afternoon");
    await saveTrip(db, officer, tripSchema.parse({ routeId: routes[ri].id, direction: "morning", boarded: riders.filter((r, i) => r.r.studentId === seun?.id || i % 6 !== 4).map((r) => r.r.studentId) }));
  }
  console.log(`Transport demo: ${buses.length} buses, ${routes.length} routes. Transport officer: transport9@demo.schoolos.ng / Demo2026!`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
