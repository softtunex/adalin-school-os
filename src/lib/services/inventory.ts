import { and, asc, count, desc, eq, gt, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { ASSET_CONDITIONS, EXPENSE_CATEGORIES, expenses, inventoryAssignments, inventoryItems, inventoryMoves, membershipRoles, memberships, roles, schools, users, type InventorySettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira } from "../money";
import { hasFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { notifyUsers } from "./notify";

/*
 * The school store. Consumables (chalk, exercise books, diesel) go in and out by count; assets
 * (projectors, laptops, generators) are signed out to a member of staff or a room and come back
 * with a condition. Every change is a move, so the store count always has a history behind it.
 */

export const ITEM_PAGE_SIZE = 25;
export const MOVE_PAGE_SIZE = 40;

export const DEFAULT_INVENTORY: Required<InventorySettings> = {
  categories: ["Stationery", "Teaching aids", "ICT equipment", "Furniture", "Cleaning supplies", "Laboratory", "Sports", "Kitchen", "Fuel and power", "Uniforms"],
  locations: ["Main store", "Staff room", "Principal's office", "ICT lab", "Science lab", "Library", "Hall", "Kitchen", "Sick bay"],
  recordPurchases: true,
};

export function inventorySettings(s: InventorySettings): Required<InventorySettings> {
  return { ...DEFAULT_INVENTORY, ...s };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireInventory(access: Access) {
  if (!hasFeature(access.plan, "inventory")) throw new AppError("Inventory is on the Premium plan.", "upgrade");
  requirePermission(access, "operations:inventory");
}

const plural = (n: number, unit: string) => `${n} ${n === 1 ? unit.replace(/s$/, "") : unit}`;

// ---------- Settings ----------

const list = (label: string) => z.array(z.string().trim().min(1).max(60)).min(1, `Add at least one ${label}.`).max(60);

export const inventorySettingsSchema = z.object({
  categories: list("category"),
  locations: list("location"),
  recordPurchases: z.boolean(),
});

export async function saveInventorySettings(db: DB, access: Access, input: z.infer<typeof inventorySettingsSchema>, ip?: string | null) {
  requireInventory(access);
  const clean = { ...input, categories: [...new Set(input.categories)], locations: [...new Set(input.locations)] };
  await db.update(schools).set({ inventorySettings: clean }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, actor(access, ip), { action: "inventory.settings", summary: `Inventory: ${clean.categories.length} categories, ${clean.locations.length} locations` }),
  );
}

// ---------- Items ----------

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const itemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter the item's name.").max(160),
  kind: z.enum(["consumable", "asset"]),
  category: opt(60),
  unit: z.string().trim().min(1).max(30).default("pieces"),
  /** Opening count for a new item. Ignored on edit: counts change through moves. */
  quantity: z.number().int().min(0).max(1_000_000).default(0),
  reorderLevel: z.number().int().min(0).max(1_000_000).default(0),
  unitCostKobo: z.number().int().min(0).max(10_000_000_000).default(0),
  location: opt(60),
  tag: opt(60),
  condition: z.enum(ASSET_CONDITIONS).default("good"),
  note: opt(300),
});

export async function saveItem(db: DB, access: Access, input: z.infer<typeof itemSchema>, ip?: string | null) {
  requireInventory(access);
  const today = lagosToday();
  return withTenant(db, access.school.id, async (tx) => {
    const values = {
      name: input.name,
      kind: input.kind,
      category: input.category,
      unit: input.unit,
      reorderLevel: input.reorderLevel,
      unitCostKobo: input.unitCostKobo,
      location: input.location,
      tag: input.tag,
      condition: input.condition,
      note: input.note,
    };
    if (input.id) {
      const [row] = await tx.update(inventoryItems).set(values).where(eq(inventoryItems.id, input.id)).returning();
      if (!row) throw new AppError("That item wasn't found.", "not_found");
      return row;
    }
    const [dup] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(and(sql`lower(${inventoryItems.name}) = lower(${input.name})`, input.tag ? eq(inventoryItems.tag, input.tag) : isNull(inventoryItems.tag)));
    if (dup) throw new AppError(`"${input.name}" is already in the store. Use Stock in to add more.`, "conflict");
    const [row] = await tx
      .insert(inventoryItems)
      .values({ ...values, schoolId: access.school.id, quantity: input.quantity })
      .returning();
    if (input.quantity > 0) {
      await tx.insert(inventoryMoves).values({ schoolId: access.school.id, itemId: row.id, kind: "in", change: input.quantity, balance: input.quantity, unitCostKobo: input.unitCostKobo || null, note: "Opening stock", movedOn: today, recordedBy: access.membershipId });
    }
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "inventory.item_added", summary: `Added ${row.name} (${plural(row.quantity, row.unit)})`, entityType: "inventory_item", entityId: row.id });
    return row;
  });
}

async function openAssigned(tx: Tx, itemId: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`coalesce(sum(${inventoryAssignments.quantity}), 0)`.mapWith(Number) })
    .from(inventoryAssignments)
    .where(and(eq(inventoryAssignments.itemId, itemId), isNull(inventoryAssignments.returnedOn)));
  return n;
}

export async function deleteItem(db: DB, access: Access, id: string, ip?: string | null) {
  requireInventory(access);
  await withTenant(db, access.school.id, async (tx) => {
    const out = await openAssigned(tx, id);
    if (out > 0) throw new AppError(`${out} still signed out. Take ${out === 1 ? "it" : "them"} back first.`, "conflict");
    const [row] = await tx.delete(inventoryItems).where(eq(inventoryItems.id, id)).returning();
    if (row) await recordAudit(tx, access.school.id, actor(access, ip), { action: "inventory.item_removed", summary: `Removed ${row.name} from the store` });
  });
}

const assignedOut = sql<number>`(select coalesce(sum(a.quantity), 0) from inventory_assignments a where a.item_id = "inventory_items"."id" and a.returned_on is null)`.mapWith(Number);
const isLow = sql`${inventoryItems.kind} = 'consumable' and ${inventoryItems.reorderLevel} > 0 and ${inventoryItems.quantity} <= ${inventoryItems.reorderLevel}`;

export async function lowStockCount(db: DB, access: Access) {
  if (!hasFeature(access.plan, "inventory")) return 0;
  return withTenant(db, access.school.id, async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(inventoryItems).where(isLow);
    return n;
  });
}

export async function listItems(db: DB, access: Access, filter: { q?: string; category?: string; kind?: string; show?: string; page?: number } = {}) {
  requireInventory(access);
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [];
    if (filter.q) where.push(or(ilike(inventoryItems.name, `%${filter.q}%`), ilike(inventoryItems.tag, `%${filter.q}%`), ilike(inventoryItems.location, `%${filter.q}%`))!);
    if (filter.category) where.push(eq(inventoryItems.category, filter.category));
    if (filter.kind === "consumable" || filter.kind === "asset") where.push(eq(inventoryItems.kind, filter.kind));
    if (filter.show === "low") where.push(isLow);
    if (filter.show === "out") where.push(sql`${assignedOut} > 0`);
    if (filter.show === "damaged") where.push(or(eq(inventoryItems.condition, "damaged"), eq(inventoryItems.condition, "lost"))!);
    const page = Math.max(1, filter.page ?? 1);
    const [[{ total }], rows, [stats], [out], categories] = await Promise.all([
      tx.select({ total: count() }).from(inventoryItems).where(and(...where)),
      tx
        .select({ item: inventoryItems, out: assignedOut })
        .from(inventoryItems)
        .where(and(...where))
        .orderBy(asc(inventoryItems.name))
        .limit(ITEM_PAGE_SIZE)
        .offset((page - 1) * ITEM_PAGE_SIZE),
      tx
        .select({
          items: count(),
          low: sql<number>`count(*) filter (where ${isLow})`.mapWith(Number),
          storeValue: sql<number>`coalesce(sum(${inventoryItems.quantity}::bigint * ${inventoryItems.unitCostKobo}), 0)`.mapWith(Number),
        })
        .from(inventoryItems),
      tx
        .select({
          units: sql<number>`coalesce(sum(${inventoryAssignments.quantity}), 0)`.mapWith(Number),
          value: sql<number>`coalesce(sum(${inventoryAssignments.quantity}::bigint * ${inventoryItems.unitCostKobo}), 0)`.mapWith(Number),
        })
        .from(inventoryAssignments)
        .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryAssignments.itemId))
        .where(isNull(inventoryAssignments.returnedOn)),
      tx.selectDistinct({ category: inventoryItems.category }).from(inventoryItems).where(isNotNull(inventoryItems.category)).orderBy(asc(inventoryItems.category)),
    ]);
    return {
      rows,
      total,
      stats: { items: stats.items, low: stats.low, value: stats.storeValue + out.value, assigned: out.units },
      categories: categories.map((c) => c.category!),
    };
  });
}

// ---------- Moves ----------

async function lockItem(tx: Tx, id: string) {
  const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id)).for("update");
  if (!item) throw new AppError("That item wasn't found.", "not_found");
  return item;
}

async function staffName(tx: Tx, membershipId: string) {
  const [m] = await tx
    .select({ name: users.name, userId: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.id, membershipId), eq(memberships.status, "active")));
  if (!m) throw new AppError("That member of staff wasn't found.", "not_found");
  return m;
}

export const stockInSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1, "Enter how many came in.").max(1_000_000),
  unitCostKobo: z.number().int().min(0).max(10_000_000_000).default(0),
  supplier: opt(120),
  note: opt(200),
  /** Book the cost in Expenses as pending, for approval. */
  recordExpense: z.boolean().default(false),
  expenseCategory: z.enum(EXPENSE_CATEGORIES).default("Teaching materials"),
});

export async function stockIn(db: DB, access: Access, input: z.infer<typeof stockInSchema>, ip?: string | null) {
  requireInventory(access);
  const today = lagosToday();
  return withTenant(db, access.school.id, async (tx) => {
    const item = await lockItem(tx, input.itemId);
    const balance = item.quantity + input.quantity;
    const total = input.quantity * input.unitCostKobo;
    let expenseId: string | null = null;
    if (input.recordExpense && total > 0 && hasFeature(access.plan, "expenses")) {
      const [e] = await tx
        .insert(expenses)
        .values({
          schoolId: access.school.id,
          spentOn: today,
          category: input.expenseCategory,
          description: `${plural(input.quantity, item.unit)} of ${item.name} for the store`,
          amountKobo: total,
          method: "transfer",
          vendor: input.supplier,
          status: "pending",
          recordedBy: access.membershipId,
        })
        .returning({ id: expenses.id });
      expenseId = e.id;
    }
    await tx
      .update(inventoryItems)
      .set({ quantity: balance, ...(input.unitCostKobo ? { unitCostKobo: input.unitCostKobo } : {}) })
      .where(eq(inventoryItems.id, item.id));
    await tx.insert(inventoryMoves).values({
      schoolId: access.school.id,
      itemId: item.id,
      kind: "in",
      change: input.quantity,
      balance,
      unitCostKobo: input.unitCostKobo || null,
      supplier: input.supplier,
      expenseId,
      note: input.note,
      movedOn: today,
      recordedBy: access.membershipId,
    });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "inventory.stock_in",
      summary: `${plural(input.quantity, item.unit)} of ${item.name} in${total ? ` (${formatNaira(total)})` : ""}`,
      entityType: "inventory_item",
      entityId: item.id,
    });
    return { balance, expense: Boolean(expenseId) };
  });
}

export const giveOutSchema = z
  .object({
    itemId: z.string().uuid(),
    quantity: z.number().int().min(1, "Enter how many.").max(1_000_000),
    membershipId: z.string().uuid().nullable().default(null),
    location: opt(60),
    note: opt(200),
  })
  .refine((v) => v.membershipId || v.location, { path: ["membershipId"], message: "Choose who or where it's going to." });

/** Consumables leave the store for good; assets are signed out and expected back. */
export async function giveOut(db: DB, access: Access, input: z.infer<typeof giveOutSchema>, ip?: string | null) {
  requireInventory(access);
  const today = lagosToday();
  return withTenant(db, access.school.id, async (tx) => {
    const item = await lockItem(tx, input.itemId);
    if (input.quantity > item.quantity) throw new AppError(`Only ${plural(item.quantity, item.unit)} in the store.`, "conflict");
    const who = input.membershipId ? await staffName(tx, input.membershipId) : null;
    const to = who?.name ?? input.location!;
    const balance = item.quantity - input.quantity;
    await tx.update(inventoryItems).set({ quantity: balance }).where(eq(inventoryItems.id, item.id));
    if (item.kind === "asset") {
      await tx.insert(inventoryAssignments).values({
        schoolId: access.school.id,
        itemId: item.id,
        quantity: input.quantity,
        membershipId: input.membershipId,
        location: input.location,
        assignedOn: today,
        note: input.note,
        assignedBy: access.membershipId,
      });
      if (who) {
        await notifyUsers(tx, access.school.id, [who.userId], {
          kind: "inventory",
          title: `${input.quantity === 1 ? item.name : `${input.quantity} × ${item.name}`} signed out to you`,
          body: "You're responsible for it until it goes back to the store.",
          link: `/s/${access.school.slug}/hr`,
          ref: `inventory:${item.id}:${today}`,
        });
      }
    }
    await tx.insert(inventoryMoves).values({
      schoolId: access.school.id,
      itemId: item.id,
      kind: item.kind === "asset" ? "assign" : "out",
      change: -input.quantity,
      balance,
      membershipId: input.membershipId,
      location: input.location,
      note: input.note,
      movedOn: today,
      recordedBy: access.membershipId,
    });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: item.kind === "asset" ? "inventory.assigned" : "inventory.issued",
      summary: `${plural(input.quantity, item.unit)} of ${item.name} ${item.kind === "asset" ? "signed out" : "issued"} to ${to}`,
      entityType: "inventory_item",
      entityId: item.id,
    });
    return { balance, low: item.kind === "consumable" && item.reorderLevel > 0 && balance <= item.reorderLevel, to, asset: item.kind === "asset" };
  });
}

/** An assigned asset comes back. Lost items don't return to the store count. */
export async function takeBack(db: DB, access: Access, assignmentId: string, condition: (typeof ASSET_CONDITIONS)[number], ip?: string | null) {
  requireInventory(access);
  const today = lagosToday();
  return withTenant(db, access.school.id, async (tx) => {
    const [a] = await tx.select().from(inventoryAssignments).where(eq(inventoryAssignments.id, assignmentId));
    if (!a) throw new AppError("That assignment wasn't found.", "not_found");
    if (a.returnedOn) throw new AppError("Already back in the store.", "conflict");
    const item = await lockItem(tx, a.itemId);
    const back = condition === "lost" ? 0 : a.quantity;
    const balance = item.quantity + back;
    await tx.update(inventoryAssignments).set({ returnedOn: today, returnCondition: condition }).where(eq(inventoryAssignments.id, a.id));
    await tx
      .update(inventoryItems)
      .set({ quantity: balance, ...(condition !== "good" && item.condition === "good" ? { condition } : {}) })
      .where(eq(inventoryItems.id, item.id));
    await tx.insert(inventoryMoves).values({
      schoolId: access.school.id,
      itemId: item.id,
      kind: "return",
      change: back,
      balance,
      membershipId: a.membershipId,
      location: a.location,
      note: condition === "good" ? null : `Came back ${condition}`,
      movedOn: today,
      recordedBy: access.membershipId,
    });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "inventory.returned",
      summary: condition === "lost" ? `${plural(a.quantity, item.unit)} of ${item.name} reported lost` : `${plural(a.quantity, item.unit)} of ${item.name} back in the store (${condition})`,
      entityType: "inventory_item",
      entityId: item.id,
    });
    return { balance, name: item.name };
  });
}

export const countSchema = z.object({
  itemId: z.string().uuid(),
  counted: z.number().int().min(0).max(1_000_000),
  note: z.string().trim().min(2, "Say why the count changed.").max(200),
});

/** A stock count: sets the store number to what was physically counted. */
export async function adjustStock(db: DB, access: Access, input: z.infer<typeof countSchema>, ip?: string | null) {
  requireInventory(access);
  return withTenant(db, access.school.id, async (tx) => {
    const item = await lockItem(tx, input.itemId);
    const change = input.counted - item.quantity;
    if (change === 0) return { change };
    await tx.update(inventoryItems).set({ quantity: input.counted }).where(eq(inventoryItems.id, item.id));
    await tx.insert(inventoryMoves).values({ schoolId: access.school.id, itemId: item.id, kind: "adjust", change, balance: input.counted, note: input.note, movedOn: lagosToday(), recordedBy: access.membershipId });
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "inventory.counted",
      summary: `${item.name} counted: ${item.quantity} → ${input.counted} (${input.note})`,
      entityType: "inventory_item",
      entityId: item.id,
    });
    return { change };
  });
}

// ---------- Lists ----------

export async function listAssignments(db: DB, access: Access, filter: { view?: string; q?: string } = {}) {
  requireInventory(access);
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [filter.view === "returned" ? isNotNull(inventoryAssignments.returnedOn) : isNull(inventoryAssignments.returnedOn)];
    if (filter.q) where.push(or(ilike(inventoryItems.name, `%${filter.q}%`), ilike(inventoryItems.tag, `%${filter.q}%`), ilike(users.name, `%${filter.q}%`), ilike(inventoryAssignments.location, `%${filter.q}%`))!);
    return tx
      .select({ a: inventoryAssignments, name: inventoryItems.name, tag: inventoryItems.tag, unit: inventoryItems.unit, staff: users.name })
      .from(inventoryAssignments)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryAssignments.itemId))
      .leftJoin(memberships, eq(memberships.id, inventoryAssignments.membershipId))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(and(...where))
      .orderBy(filter.view === "returned" ? desc(inventoryAssignments.returnedOn) : asc(inventoryAssignments.assignedOn))
      .limit(300);
  });
}

export async function listMoves(db: DB, access: Access, filter: { q?: string; kind?: string; itemId?: string; page?: number; all?: boolean } = {}) {
  requireInventory(access);
  return withTenant(db, access.school.id, async (tx) => {
    const by = sql`(select u.name from memberships m join users u on u.id = m.user_id where m.id = ${inventoryMoves.recordedBy})`;
    const where: SQL[] = [];
    if (filter.itemId) where.push(eq(inventoryMoves.itemId, filter.itemId));
    if (filter.kind && (["in", "out", "adjust", "assign", "return"] as string[]).includes(filter.kind)) where.push(sql`${inventoryMoves.kind} = ${filter.kind}`);
    if (filter.q) where.push(or(ilike(inventoryItems.name, `%${filter.q}%`), ilike(users.name, `%${filter.q}%`), ilike(inventoryMoves.location, `%${filter.q}%`), ilike(inventoryMoves.supplier, `%${filter.q}%`))!);
    const page = Math.max(1, filter.page ?? 1);
    const base = tx
      .select({ m: inventoryMoves, name: inventoryItems.name, unit: inventoryItems.unit, staff: users.name, by: sql<string | null>`${by}` })
      .from(inventoryMoves)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMoves.itemId))
      .leftJoin(memberships, eq(memberships.id, inventoryMoves.membershipId))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(and(...where))
      .orderBy(desc(inventoryMoves.createdAt));
    const [[{ total }], rows] = await Promise.all([
      tx
        .select({ total: count() })
        .from(inventoryMoves)
        .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMoves.itemId))
        .leftJoin(memberships, eq(memberships.id, inventoryMoves.membershipId))
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(and(...where)),
      filter.all ? base.limit(5000) : base.limit(MOVE_PAGE_SIZE).offset((page - 1) * MOVE_PAGE_SIZE),
    ]);
    return { rows, total };
  });
}

/** Staff and items for the give-out form. */
export async function storeOptions(db: DB, access: Access) {
  requireInventory(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [staff, items] = await Promise.all([
      tx
        .selectDistinct({ id: memberships.id, name: users.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff"))),
      tx
        .select({ id: inventoryItems.id, name: inventoryItems.name, kind: inventoryItems.kind, unit: inventoryItems.unit, quantity: inventoryItems.quantity, tag: inventoryItems.tag })
        .from(inventoryItems)
        .where(gt(inventoryItems.quantity, 0))
        .orderBy(asc(inventoryItems.name)),
    ]);
    return { staff: staff.sort((a, b) => a.name.localeCompare(b.name)), items };
  });
}

/** What a member of staff has signed out to them, for their own view. */
export async function myItems(db: DB, access: Access) {
  if (!hasFeature(access.plan, "inventory")) return [];
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({ a: inventoryAssignments, name: inventoryItems.name, tag: inventoryItems.tag, unit: inventoryItems.unit })
      .from(inventoryAssignments)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryAssignments.itemId))
      .where(and(eq(inventoryAssignments.membershipId, access.membershipId), isNull(inventoryAssignments.returnedOn)))
      .orderBy(asc(inventoryAssignments.assignedOn)),
  );
}
