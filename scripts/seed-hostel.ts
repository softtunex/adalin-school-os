/*
 * The demo school's boarding house: a warden (Mrs Esther Okoro, warden10@demo.adalinschoolhub.ng,
 * password Demo2026!), a girls' and a boys' hostel with rooms and beds, about twenty boarders,
 * and exeats in every state. Folake Lawal boards, and her parent has an exeat request waiting.
 * Run with the dev server stopped.
 */
import { asc, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { exeats, hostels, roles, students } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { assignBed, bedSchema, createExeat, exeatSchema, hostelSchema, moveExeat, requestExeat, roomSchema, saveHostel, saveRoom } from "../src/lib/services/hostel";
import { acceptInvitation, inviteStaff } from "../src/lib/services/staff";

function at(days: number, time: string) {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })}T${time}`;
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.adalinschoolhub.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const existing = await withTenant(db, owner.school.id, (tx) => tx.select({ id: hostels.id }).from(hostels).limit(1));
  if (existing.length) {
    console.log("Hostel demo data already there.");
    await database.close();
    return;
  }
  let wardenUser = await findUserByEmail(db, "warden10@demo.adalinschoolhub.ng");
  if (!wardenUser) {
    const [role] = await withTenant(db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "hostel_warden")));
    const { token } = await inviteStaff(db, owner, { name: "Mrs Esther Okoro", email: "warden10@demo.adalinschoolhub.ng", roleIds: [role.id] });
    await acceptInvitation(db, token, { name: "Mrs Esther Okoro", password: "Demo2026!" });
    wardenUser = await findUserByEmail(db, "warden10@demo.adalinschoolhub.ng");
  }
  const warden = (await loadAccess(db, wardenUser!.id, "adalin-college"))!;
  const girls = await saveHostel(db, warden, hostelSchema.parse({ name: "Queen Amina House", gender: "female", wardenId: warden.membershipId, termFeeKobo: 280_000_00 }));
  const boys = await saveHostel(db, warden, hostelSchema.parse({ name: "King Jaja House", gender: "male", wardenId: warden.membershipId, termFeeKobo: 280_000_00 }));
  const rooms: Record<"female" | "male", string[]> = { female: [], male: [] };
  for (const [h, g] of [
    [girls, "female"],
    [boys, "male"],
  ] as const) {
    for (const [name, beds] of [
      ["Room 1", 6],
      ["Room 2", 6],
      ["Room 3", 8],
      ["Room 4", 4],
    ] as const) {
      rooms[g].push((await saveRoom(db, warden, roomSchema.parse({ hostelId: h.id, name, beds }))).id);
    }
  }
  const kids = await withTenant(db, owner.school.id, (tx) => tx.select().from(students).where(eq(students.status, "active")).orderBy(asc(students.admissionNo)));
  const folake = kids.find((k) => k.firstName === "Folake" && k.lastName === "Lawal");
  const seun = kids.find((k) => k.admissionNo === "ADC/2026/0009");
  const pool = kids.filter((k) => k.id !== seun?.id && k.id !== folake?.id).filter((_, i) => i % 3 === 1);
  const boarders = [...(folake ? [folake] : []), ...pool.slice(0, 21)];
  const count = { female: 0, male: 0 };
  for (const k of boarders) {
    const g = k.gender as "female" | "male";
    const roomId = rooms[g][Math.floor(count[g]++ / 3) % 4];
    await assignBed(db, warden, bedSchema.parse({ studentId: k.id, roomId })).catch(() => assignBed(db, warden, bedSchema.parse({ studentId: k.id, roomId: rooms[g][2] })));
  }
  const others = boarders.filter((k) => k.id !== folake?.id);
  // Finished exeats from earlier in the term, one of them back late.
  for (const [i, k] of others.slice(0, 3).entries()) {
    const e = await createExeat(db, warden, exeatSchema.parse({ studentId: k.id, kind: i === 2 ? "medical" : "weekend", reason: i === 2 ? "Dental appointment at Reddington" : "Weekend at home", leaveAt: at(1, "15:00"), returnBy: at(3, "17:00"), collectedBy: "Parent" }));
    await moveExeat(db, warden, { id: e.id, action: "out" });
    await moveExeat(db, warden, { id: e.id, action: "back" });
    const leave = new Date(Date.now() - (12 - i * 3) * 86_400_000);
    const back = new Date(leave.getTime() + (i === 1 ? 52 : 48) * 3_600_000);
    await withTenant(db, owner.school.id, (tx) =>
      tx
        .update(exeats)
        .set({ leaveAt: leave, outAt: leave, returnBy: new Date(leave.getTime() + 50 * 3_600_000), backAt: back })
        .where(eq(exeats.id, e.id)),
    );
  }
  // One out right now, due back this evening.
  if (others[3]) {
    const e = await createExeat(db, warden, exeatSchema.parse({ studentId: others[3].id, kind: "day", reason: "Cousin's wedding in Ikeja", leaveAt: at(1, "08:00"), returnBy: at(1, "19:00"), collectedBy: "Mr Ade (uncle)" }));
    await moveExeat(db, warden, { id: e.id, action: "out" });
    await withTenant(db, owner.school.id, (tx) =>
      tx
        .update(exeats)
        .set({ leaveAt: new Date(Date.now() - 4 * 3_600_000), outAt: new Date(Date.now() - 4 * 3_600_000), returnBy: new Date(Date.now() + 5 * 3_600_000) })
        .where(eq(exeats.id, e.id)),
    );
  }
  // Approved for next weekend.
  if (others[4]) await createExeat(db, warden, exeatSchema.parse({ studentId: others[4].id, kind: "family", reason: "Grandfather's 70th birthday in Abeokuta", leaveAt: at(6, "14:00"), returnBy: at(8, "18:00"), collectedBy: "Mrs Okafor (mother)" }));
  // Folake's parent has asked for next weekend.
  const parent = await findUserByEmail(db, "parent8@example.com");
  if (folake && parent) {
    await requestExeat(db, parent.id, exeatSchema.parse({ studentId: folake.id, kind: "weekend", reason: "Family thanksgiving service in Surulere", leaveAt: at(6, "15:00"), returnBy: at(8, "17:00"), collectedBy: "Mrs Blessing Lawal (mother)" })).catch((e) => console.log("Folake's request skipped:", e.message));
  }
  console.log(`Hostel demo: 2 hostels, ${boarders.length} boarders. Warden: warden10@demo.adalinschoolhub.ng / Demo2026!`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
