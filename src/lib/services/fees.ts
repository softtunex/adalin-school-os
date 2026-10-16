import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { academicSessions, classLevels, discountSchemes, feeAmounts, feeItems, invoices, students, studentDiscounts, terms } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira, nairaField } from "../money";
import { requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

const actor = (access: Access, ip?: string | null) => ({ userId: access.user.id, name: access.user.name, ip });

/** Every term the school has, newest first, labelled "First term · 2026/2027". */
export async function listTermOptions(tx: Tx) {
  const rows = await tx
    .select({ id: terms.id, name: terms.name, number: terms.number, isCurrent: terms.isCurrent, session: academicSessions.name })
    .from(terms)
    .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
    .orderBy(desc(academicSessions.name), desc(terms.number));
  return rows.map((t) => ({ ...t, label: `${t.name} · ${t.session}` }));
}

/** The requested term, else the current one, else the newest. */
export async function pickTerm(tx: Tx, termId?: string | null) {
  const options = await listTermOptions(tx);
  const term = (termId && options.find((t) => t.id === termId)) || options.find((t) => t.isCurrent) || options[0];
  if (!term) throw new AppError("Set up a session and its terms in Academics before adding fees.", "not_found");
  return { term, options };
}

export async function getFeeSetup(db: DB, access: Access, termId?: string | null) {
  requirePermission(access, "fees:view");
  requireFeature(access.plan, "fees_basic");
  return withTenant(db, access.school.id, async (tx) => {
    const { term, options } = await pickTerm(tx, termId);
    const [levels, items, amounts, schemes, assigned, [{ invoiced }]] = await Promise.all([
      tx.select({ id: classLevels.id, name: classLevels.name, section: classLevels.section }).from(classLevels).orderBy(asc(classLevels.sort)),
      tx.select().from(feeItems).orderBy(asc(feeItems.sort), asc(feeItems.name)),
      tx.select().from(feeAmounts).where(eq(feeAmounts.termId, term.id)),
      tx.select().from(discountSchemes).orderBy(asc(discountSchemes.name)),
      tx.select({ schemeId: studentDiscounts.schemeId, n: count() }).from(studentDiscounts).groupBy(studentDiscounts.schemeId),
      tx.select({ invoiced: count() }).from(invoices).where(and(eq(invoices.termId, term.id), eq(invoices.kind, "term"))),
    ]);
    const grid: Record<string, Record<string, number>> = {};
    for (const a of amounts) (grid[a.levelId] ??= {})[a.itemId] = a.amountKobo;
    const assignedBy = new Map(assigned.map((a) => [a.schemeId, a.n]));
    const compulsory = new Set(items.filter((i) => !i.isOptional).map((i) => i.id));
    const levelTotals = Object.fromEntries(
      levels.map((l) => [l.id, Object.entries(grid[l.id] ?? {}).reduce((n, [itemId, k]) => n + (compulsory.has(itemId) ? k : 0), 0)]),
    );
    return {
      term,
      terms: options,
      levels,
      items,
      grid,
      levelTotals,
      invoiced,
      schemes: schemes.map((s) => ({ ...s, students: assignedBy.get(s.id) ?? 0 })),
    };
  });
}

// ---------- Fee items ----------

export const feeItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name the fee item, e.g. Tuition.").max(60),
  isOptional: z.boolean().default(false),
});

export async function saveFeeItem(db: DB, access: Access, input: z.infer<typeof feeItemSchema>, ip?: string | null) {
  requirePermission(access, "fees:manage");
  requireFeature(access.plan, "fees_basic");
  return withTenant(db, access.school.id, async (tx) => {
    const [clash] = await tx.select({ id: feeItems.id }).from(feeItems).where(eq(feeItems.name, input.name));
    if (clash && clash.id !== input.id) throw new AppError(`There's already a fee item called ${input.name}.`, "conflict");
    if (input.id) {
      const [row] = await tx.update(feeItems).set({ name: input.name, isOptional: input.isOptional }).where(eq(feeItems.id, input.id)).returning();
      if (!row) throw new AppError("That fee item wasn't found.", "not_found");
      return row;
    }
    const [{ top }] = await tx.select({ top: max(feeItems.sort) }).from(feeItems);
    const [row] = await tx.insert(feeItems).values({ schoolId: access.school.id, name: input.name, isOptional: input.isOptional, sort: (top ?? -1) + 1 }).returning();
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "fees.item_created", summary: `Added the fee item ${input.name}`, entityType: "fee_item", entityId: row.id });
    return row;
  });
}

/** Invoices keep their own copy of each line, so removing an item never changes issued invoices. */
export async function deleteFeeItem(db: DB, access: Access, itemId: string, ip?: string | null) {
  requirePermission(access, "fees:manage");
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.delete(feeItems).where(eq(feeItems.id, itemId)).returning();
    if (!row) throw new AppError("That fee item wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "fees.item_deleted", summary: `Removed the fee item ${row.name}`, entityType: "fee_item", entityId: row.id });
  });
}

// ---------- Fee structure ----------

export const feeStructureSchema = z.object({
  termId: z.string().uuid(),
  amounts: z.array(z.object({ levelId: z.string().uuid(), itemId: z.string().uuid(), amount: nairaField("fee", { allowZero: true }) })).max(2000),
});

/** Replaces the whole structure for a term. Blank or zero amounts mean the level doesn't pay that item. */
export async function saveFeeStructure(db: DB, access: Access, input: z.infer<typeof feeStructureSchema>, ip?: string | null) {
  requirePermission(access, "fees:manage");
  requireFeature(access.plan, "fees_basic");
  await withTenant(db, access.school.id, async (tx) => {
    const { term } = await pickTerm(tx, input.termId);
    if (term.id !== input.termId) throw new AppError("That term wasn't found.", "not_found");
    await tx.delete(feeAmounts).where(eq(feeAmounts.termId, term.id));
    const rows = input.amounts.filter((a) => a.amount > 0).map((a) => ({ schoolId: access.school.id, termId: term.id, levelId: a.levelId, itemId: a.itemId, amountKobo: a.amount }));
    if (rows.length) await tx.insert(feeAmounts).values(rows);
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "fees.structure_saved", summary: `Updated the fee structure for ${term.label}` });
  });
}

export async function copyFeeStructure(db: DB, access: Access, input: { fromTermId: string; toTermId: string }, ip?: string | null) {
  requirePermission(access, "fees:manage");
  requireFeature(access.plan, "fees_basic");
  if (input.fromTermId === input.toTermId) throw new AppError("Pick a different term to copy from.");
  return withTenant(db, access.school.id, async (tx) => {
    const options = await listTermOptions(tx);
    const from = options.find((t) => t.id === input.fromTermId);
    const to = options.find((t) => t.id === input.toTermId);
    if (!from || !to) throw new AppError("That term wasn't found.", "not_found");
    const source = await tx.select().from(feeAmounts).where(eq(feeAmounts.termId, from.id));
    if (!source.length) throw new AppError(`${from.label} has no fees to copy.`, "conflict");
    await tx.delete(feeAmounts).where(eq(feeAmounts.termId, to.id));
    await tx.insert(feeAmounts).values(source.map((s) => ({ schoolId: s.schoolId, termId: to.id, levelId: s.levelId, itemId: s.itemId, amountKobo: s.amountKobo })));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "fees.structure_copied", summary: `Copied fees from ${from.label} to ${to.label}` });
    return source.length;
  });
}

// ---------- Discounts and scholarships ----------

export const discountSchemeSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, "Name the discount, e.g. Sibling discount.").max(60),
    kind: z.enum(["percent", "fixed"]),
    percent: z.coerce.number().int().optional(),
    amount: z.unknown().optional(),
    itemId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional()),
  })
  .transform((v, ctx) => {
    let value: number;
    if (v.kind === "percent") {
      if (!v.percent || v.percent < 1 || v.percent > 100) {
        ctx.addIssue({ code: "custom", path: ["percent"], message: "Enter a percentage from 1 to 100." });
        return z.NEVER;
      }
      value = v.percent;
    } else {
      const parsed = nairaField("discount").safeParse(v.amount);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: parsed.error.issues[0]?.message ?? "Enter an amount." });
        return z.NEVER;
      }
      value = parsed.data;
    }
    return { id: v.id, name: v.name, kind: v.kind, value, itemId: v.itemId ?? null };
  });

export function describeScheme(s: { kind: "percent" | "fixed"; value: number }, itemName?: string | null) {
  const amount = s.kind === "percent" ? `${s.value}%` : formatNaira(s.value);
  return `${amount} off ${itemName ?? "all compulsory fees"}`;
}

export async function saveDiscountScheme(db: DB, access: Access, input: { id?: string; name: string; kind: "percent" | "fixed"; value: number; itemId: string | null }, ip?: string | null) {
  requirePermission(access, "fees:discount");
  requireFeature(access.plan, "debtors");
  return withTenant(db, access.school.id, async (tx) => {
    const [clash] = await tx.select({ id: discountSchemes.id }).from(discountSchemes).where(eq(discountSchemes.name, input.name));
    if (clash && clash.id !== input.id) throw new AppError(`There's already a discount called ${input.name}.`, "conflict");
    const values = { name: input.name, kind: input.kind, value: input.value, itemId: input.itemId };
    const [row] = input.id
      ? await tx.update(discountSchemes).set(values).where(eq(discountSchemes.id, input.id)).returning()
      : await tx.insert(discountSchemes).values({ schoolId: access.school.id, ...values }).returning();
    if (!row) throw new AppError("That discount wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: input.id ? "fees.discount_updated" : "fees.discount_created",
      summary: `${input.id ? "Updated" : "Created"} the discount ${row.name}`,
      entityType: "discount_scheme",
      entityId: row.id,
    });
    return row;
  });
}

export async function deleteDiscountScheme(db: DB, access: Access, schemeId: string, ip?: string | null) {
  requirePermission(access, "fees:discount");
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.delete(discountSchemes).where(eq(discountSchemes.id, schemeId)).returning();
    if (!row) throw new AppError("That discount wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "fees.discount_deleted", summary: `Deleted the discount ${row.name}`, entityType: "discount_scheme", entityId: row.id });
  });
}

export async function listSchemeStudents(db: DB, access: Access, schemeId: string) {
  requirePermission(access, "fees:view");
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNo: students.admissionNo })
      .from(studentDiscounts)
      .innerJoin(students, eq(students.id, studentDiscounts.studentId))
      .where(eq(studentDiscounts.schemeId, schemeId))
      .orderBy(asc(students.lastName), asc(students.firstName)),
  );
}

/** Sets exactly which discounts a student gets. Applies to invoices raised from now on. */
export async function setStudentDiscounts(db: DB, access: Access, studentId: string, schemeIds: string[], ip?: string | null) {
  requirePermission(access, "fees:discount");
  requireFeature(access.plan, "debtors");
  await withTenant(db, access.school.id, async (tx) => {
    const [student] = await tx.select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(students).where(eq(students.id, studentId));
    if (!student) throw new AppError("That student wasn't found.", "not_found");
    const unique = [...new Set(schemeIds)];
    const found = unique.length ? await tx.select({ id: discountSchemes.id, name: discountSchemes.name }).from(discountSchemes).where(inArray(discountSchemes.id, unique)) : [];
    if (found.length !== unique.length) throw new AppError("One of those discounts no longer exists.", "not_found");
    await tx.delete(studentDiscounts).where(eq(studentDiscounts.studentId, studentId));
    if (unique.length) await tx.insert(studentDiscounts).values(unique.map((schemeId) => ({ schoolId: access.school.id, studentId, schemeId })));
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "fees.student_discounts",
      summary: `Set discounts for ${student.firstName} ${student.lastName}: ${found.map((f) => f.name).join(", ") || "none"}`,
      entityType: "student",
      entityId: studentId,
    });
  });
}
