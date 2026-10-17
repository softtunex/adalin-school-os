/*
 * The demo school's store: a storekeeper (Mr Sunday Eze, storekeeper7@demo.schoolos.ng,
 * password Demo2026!), consumables and assets, a delivery or two, chalk issued to teachers,
 * projectors and chairs signed out, and two items running low. Run with the dev server stopped.
 */
import { eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { inventoryItems, memberships, roles } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { adjustStock, countSchema, giveOut, giveOutSchema, itemSchema, saveItem, stockIn, stockInSchema } from "../src/lib/services/inventory";
import { acceptInvitation, inviteStaff } from "../src/lib/services/staff";

type Seed = [name: string, kind: "consumable" | "asset", category: string, unit: string, qty: number, reorder: number, costNaira: number, location: string, tag?: string];

const ITEMS: Seed[] = [
  ["White chalk (box of 12)", "consumable", "Stationery", "boxes", 60, 15, 600, "Main store"],
  ["Whiteboard markers", "consumable", "Stationery", "packets", 24, 10, 2_500, "Main store"],
  ["40-leaf exercise books", "consumable", "Stationery", "cartons", 18, 5, 14_000, "Main store"],
  ["A4 paper (ream)", "consumable", "Stationery", "reams", 3, 10, 6_500, "Main store"],
  ["Diesel", "consumable", "Fuel and power", "litres", 40, 100, 1_250, "Main store"],
  ["Liquid soap (5 litres)", "consumable", "Cleaning supplies", "gallons", 9, 4, 4_800, "Main store"],
  ["Toilet roll (pack of 12)", "consumable", "Cleaning supplies", "packs", 14, 6, 5_200, "Main store"],
  ["First aid refill kit", "consumable", "Laboratory", "kits", 4, 2, 9_000, "Sick bay"],
  ["Epson projector", "asset", "ICT equipment", "units", 3, 0, 385_000, "ICT lab", "ADC-ICT-001"],
  ["HP laptop", "asset", "ICT equipment", "units", 6, 0, 520_000, "ICT lab", "ADC-ICT-010"],
  ["Plastic chairs", "asset", "Furniture", "chairs", 150, 0, 9_500, "Hall"],
  ["Student microscope", "asset", "Laboratory", "units", 8, 0, 145_000, "Science lab", "ADC-LAB-020"],
  ["Football", "asset", "Sports", "balls", 10, 0, 12_000, "Main store"],
  ["Mikano 20kVA generator", "asset", "Fuel and power", "units", 1, 0, 9_800_000, "Main store", "ADC-PWR-001"],
];

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const existing = await withTenant(db, owner.school.id, (tx) => tx.select({ id: inventoryItems.id }).from(inventoryItems).limit(1));
  if (existing.length) {
    console.log("Inventory demo data already there.");
    await database.close();
    return;
  }
  let keeperUser = await findUserByEmail(db, "storekeeper7@demo.schoolos.ng");
  if (!keeperUser) {
    const [role] = await withTenant(db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "storekeeper")));
    const { token } = await inviteStaff(db, owner, { name: "Mr Sunday Eze", email: "storekeeper7@demo.schoolos.ng", roleIds: [role.id] });
    await acceptInvitation(db, token, { name: "Mr Sunday Eze", password: "Demo2026!" });
    keeperUser = await findUserByEmail(db, "storekeeper7@demo.schoolos.ng");
  }
  const keeper = (await loadAccess(db, keeperUser!.id, "adalin-college"))!;
  const member = async (email: string) => {
    const u = await findUserByEmail(db, email);
    if (!u) return null;
    const [m] = await withTenant(db, owner.school.id, (tx) => tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, u.id)));
    return m?.id ?? null;
  };
  const ids: Record<string, string> = {};
  for (const [name, kind, category, unit, qty, reorder, cost, location, tag] of ITEMS) {
    const row = await saveItem(db, keeper, itemSchema.parse({ name, kind, category, unit, quantity: qty, reorderLevel: reorder, unitCostKobo: cost * 100, location, tag }));
    ids[name] = row.id;
  }
  await stockIn(db, keeper, stockInSchema.parse({ itemId: ids["White chalk (box of 12)"], quantity: 40, unitCostKobo: 650_00, supplier: "CSS Bookshops, Broad Street", recordExpense: true, expenseCategory: "Teaching materials" }));
  await stockIn(db, keeper, stockInSchema.parse({ itemId: ids["40-leaf exercise books"], quantity: 10, unitCostKobo: 14_500_00, supplier: "Tonia Stationery" }));
  const obi = await member("obi4@demo.schoolos.ng");
  const adeyemi = await member("adeyemi3@demo.schoolos.ng");
  const bello = await member("bello5@demo.schoolos.ng");
  const principal = await member("ogunleye0@demo.schoolos.ng");
  const out = (itemId: string, quantity: number, to: { membershipId?: string | null; location?: string }, note?: string) =>
    giveOut(db, keeper, giveOutSchema.parse({ itemId, quantity, membershipId: to.membershipId ?? null, location: to.location, note }));
  for (const t of [obi, adeyemi, bello]) if (t) await out(ids["White chalk (box of 12)"], 6, { membershipId: t }, "For the term");
  if (obi) await out(ids["Whiteboard markers"], 3, { membershipId: obi });
  await out(ids["40-leaf exercise books"], 12, { location: "Staff room" }, "Second-term exercise books for JSS 1");
  await out(ids["Diesel"], 25, { location: "Main store" }, "Generator, Monday to Wednesday");
  if (obi) await out(ids["Epson projector"], 1, { membershipId: obi }, "JSS 1 Maths lessons");
  await out(ids["Epson projector"], 1, { location: "Hall" }, "Assembly and PTA meetings");
  if (principal) await out(ids["HP laptop"], 1, { membershipId: principal });
  await out(ids["HP laptop"], 4, { location: "ICT lab" });
  await out(ids["Plastic chairs"], 120, { location: "Hall" });
  await out(ids["Student microscope"], 6, { location: "Science lab" });
  if (adeyemi) await out(ids["Football"], 2, { membershipId: adeyemi }, "Inter-house sports practice");
  await adjustStock(db, keeper, countSchema.parse({ itemId: ids["Toilet roll (pack of 12)"], counted: 12, note: "Two packs found opened in the store" }));
  console.log(`Inventory demo: ${ITEMS.length} items. Storekeeper: storekeeper7@demo.schoolos.ng / Demo2026!`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
