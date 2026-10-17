import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { expenses, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import {
  adjustStock,
  countSchema,
  giveOut,
  giveOutSchema,
  inventorySettingsSchema,
  itemSchema,
  listAssignments,
  listItems,
  listMoves,
  lowStockCount,
  myItems,
  saveInventorySettings,
  saveItem,
  stockIn,
  stockInSchema,
  takeBack,
  deleteItem,
} from "@/lib/services/inventory";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let keeper: Access;
let teacher: Access;
const items: Record<string, string> = {};

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mr Store", email: "store@inv.test", password: "Store1234", schoolName: "Store College" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  keeper = await staff("storekeeper", "keeper@inv.test");
  teacher = await staff("subject_teacher", "teach@inv.test");
});

afterAll(async () => {
  await database.close();
});

describe("inventory", () => {
  it("is the storekeeper's, not a teacher's", async () => {
    await expect(saveItem(database.db, teacher, itemSchema.parse({ name: "Chalk", kind: "consumable" }))).rejects.toThrow(/permission/);
    items.chalk = (await saveItem(database.db, keeper, itemSchema.parse({ name: "White chalk", kind: "consumable", unit: "packets", quantity: 40, reorderLevel: 10, unitCostKobo: 800_00 }))).id;
    items.projector = (await saveItem(database.db, keeper, itemSchema.parse({ name: "Epson projector", kind: "asset", unit: "units", quantity: 2, unitCostKobo: 350_000_00, tag: "ADC-ICT-001" }))).id;
    await expect(saveItem(database.db, keeper, itemSchema.parse({ name: "white chalk", kind: "consumable" }))).rejects.toThrow(/already in the store/);
    const { stats } = await listItems(database.db, keeper);
    expect(stats).toMatchObject({ items: 2, low: 0, assigned: 0, value: 40 * 800_00 + 2 * 350_000_00 });
  });

  it("stocks in and books the purchase as a pending expense", async () => {
    const r = await stockIn(database.db, keeper, stockInSchema.parse({ itemId: items.chalk, quantity: 20, unitCostKobo: 900_00, supplier: "Bookshop Ltd", recordExpense: true, expenseCategory: "Stationery and printing" }));
    expect(r).toEqual({ balance: 60, expense: true });
    const [e] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(expenses));
    expect(e).toMatchObject({ amountKobo: 20 * 900_00, status: "pending", category: "Stationery and printing", vendor: "Bookshop Ltd" });
  });

  it("issues consumables and flags low stock", async () => {
    expect(giveOutSchema.safeParse({ itemId: items.chalk, quantity: 1 }).success).toBe(false);
    await expect(giveOut(database.db, keeper, giveOutSchema.parse({ itemId: items.chalk, quantity: 61, membershipId: teacher.membershipId }))).rejects.toThrow(/Only 60 packets/);
    const r = await giveOut(database.db, keeper, giveOutSchema.parse({ itemId: items.chalk, quantity: 52, membershipId: teacher.membershipId }));
    expect(r).toMatchObject({ balance: 8, low: true, asset: false });
    expect(await lowStockCount(database.db, keeper)).toBe(1);
    expect(await listAssignments(database.db, keeper)).toHaveLength(0);
  });

  it("signs assets out and back, and lost ones don't return to the count", async () => {
    await giveOut(database.db, keeper, giveOutSchema.parse({ itemId: items.projector, quantity: 1, membershipId: teacher.membershipId }));
    await giveOut(database.db, keeper, giveOutSchema.parse({ itemId: items.projector, quantity: 1, location: "ICT lab" }));
    expect((await myItems(database.db, teacher)).map((i) => i.name)).toEqual(["Epson projector"]);
    expect((await listItems(database.db, keeper, { show: "out" })).rows[0]).toMatchObject({ out: 2 });
    await expect(deleteItem(database.db, keeper, items.projector)).rejects.toThrow(/still signed out/);
    const [toTeacher, toLab] = await listAssignments(database.db, keeper);
    expect((await takeBack(database.db, keeper, toTeacher.a.id, "good")).balance).toBe(1);
    expect((await takeBack(database.db, keeper, toLab.a.id, "lost")).balance).toBe(1);
    await expect(takeBack(database.db, keeper, toLab.a.id, "good")).rejects.toThrow(/Already back/);
    expect(await myItems(database.db, teacher)).toHaveLength(0);
    const { rows } = await listItems(database.db, keeper, { show: "damaged" });
    expect(rows.map((r) => r.item.condition)).toEqual(["lost"]);
  });

  it("keeps a history and corrects counts", async () => {
    expect(countSchema.safeParse({ itemId: items.chalk, counted: 5, note: "" }).success).toBe(false);
    expect((await adjustStock(database.db, keeper, countSchema.parse({ itemId: items.chalk, counted: 6, note: "Two packets damp" }))).change).toBe(-2);
    const chalk = await listMoves(database.db, keeper, { itemId: items.chalk });
    expect(chalk.rows.map((r) => [r.m.kind, r.m.change, r.m.balance])).toEqual([
      ["adjust", -2, 6],
      ["out", -52, 8],
      ["in", 20, 60],
      ["in", 40, 40],
    ]);
    expect((await listMoves(database.db, keeper, { kind: "return" })).total).toBe(2);
  });

  it("keeps its lists in Settings", async () => {
    expect(inventorySettingsSchema.safeParse({ categories: [], locations: ["Store"], recordPurchases: true }).success).toBe(false);
    await saveInventorySettings(database.db, keeper, inventorySettingsSchema.parse({ categories: ["Stationery", "Stationery", "ICT"], locations: ["Store"], recordPurchases: false }));
    const [s] = await database.db.select({ s: schools.inventorySettings }).from(schools).where(eq(schools.id, owner.school.id));
    expect(s.s).toEqual({ categories: ["Stationery", "ICT"], locations: ["Store"], recordPurchases: false });
  });
});
