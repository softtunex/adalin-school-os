import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { academicSessions, platformInvoices, schoolAddons, schools, terms } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira } from "../money";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { addDays, charge, nextBillNumber, termFraction } from "./billing-core";

/*
 * Add-ons a school buys on top of its plan. Feature add-ons (School colours) are billed each
 * term with the plan and switch the feature on for that school; services (setup, printed PIN
 * cards) are one-off and delivered by the Adalin team, who tick them off in the admin console.
 */

export type Addon = {
  key: string;
  name: string;
  description: string;
  priceKobo: number;
  /** "term": billed every term while active. "once": a one-off service. */
  billing: "term" | "once";
  /** Features it switches on. */
  grants?: string[];
  /** Bought in multiples of this many (e.g. PIN cards by the hundred). */
  unit?: { size: number; label: string };
};

export const ADDONS: Addon[] = [
  {
    key: "brand_theme",
    name: "School colours",
    description: "Your school's own colour across the app, ID cards, certificates, letters, report cards, receipts and your public pages.",
    priceKobo: 15_000_00,
    billing: "term",
    grants: ["brand_theme"],
  },
  {
    key: "setup_remote",
    name: "Guided setup",
    description: "On a video call we import your students, parents, staff and fee structure from your spreadsheets, set up classes and subjects, and show your team around.",
    priceKobo: 50_000_00,
    billing: "once",
  },
  {
    key: "setup_onsite",
    name: "On-site setup and training",
    description: "Two days at your school in Lagos: everything set up, and hands-on training for your teachers, bursar and office staff. Travel is extra outside Lagos.",
    priceKobo: 250_000_00,
    billing: "once",
  },
  {
    key: "pin_cards",
    name: "Printed result PIN cards",
    description: "Scratch cards printed with your school's name and result-checker PINs, delivered to the school. Sold by the hundred.",
    priceKobo: 20_000_00,
    billing: "once",
    unit: { size: 100, label: "cards" },
  },
];

export const addonByKey = (key: string) => ADDONS.find((a) => a.key === key);

/**
 * Recomputes the school's extra features from Adalin's grants and its paid add-ons. A cancelled
 * add-on keeps working until the term it was paid for is over.
 */
export async function syncExtraFeatures(db: DB, schoolId: string) {
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  if (!school) return;
  const rows = await withTenant(db, schoolId, async (tx) => {
    const [current] = await tx.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true));
    const list = await tx
      .select({ key: schoolAddons.key, status: schoolAddons.status, termId: platformInvoices.termId })
      .from(schoolAddons)
      .leftJoin(platformInvoices, eq(platformInvoices.id, schoolAddons.invoiceId))
      .where(inArray(schoolAddons.status, ["active", "cancelled"]));
    return list.filter((a) => a.status === "active" || (current && a.termId === current.id));
  });
  const granted = rows.flatMap((r) => addonByKey(r.key)?.grants ?? []);
  const extra = [...new Set([...(school.adminGrants ?? []), ...granted])];
  await db.update(schools).set({ extraFeatures: extra }).where(eq(schools.id, schoolId));
  return extra;
}

export async function addonsOverview(db: DB, access: Access) {
  requirePermission(access, "school:billing");
  return withTenant(db, access.school.id, async (tx) => {
    const mine = await tx.select().from(schoolAddons).orderBy(desc(schoolAddons.createdAt)).limit(100);
    const bills = mine.length ? await tx.select().from(platformInvoices).where(inArray(platformInvoices.id, mine.map((m) => m.invoiceId).filter((x): x is string => !!x))) : [];
    return {
      catalogue: ADDONS.map((a) => ({
        ...a,
        // A feature the plan already has can't be bought again.
        inPlan: !!a.grants?.length && a.grants.every((g) => access.plan.features.includes(g)) && !mine.some((m) => m.key === a.key && m.status === "active"),
        active: mine.some((m) => m.key === a.key && m.status === "active"),
      })),
      bought: mine.map((m) => ({ ...m, addon: addonByKey(m.key), bill: bills.find((b) => b.id === m.invoiceId) ?? null })),
    };
  });
}

/**
 * Buys an add-on: a bill for it (a term add-on is charged for the rest of this term) and a
 * pending add-on that switches on when the bill is paid.
 */
export async function buyAddon(db: DB, access: Access, input: { key: string; quantity?: number }, ip?: string | null) {
  requirePermission(access, "school:billing");
  const addon = addonByKey(input.key);
  if (!addon) throw new AppError("That add-on wasn't found.", "not_found");
  const units = addon.unit ? Math.max(1, Math.min(50, Math.floor((input.quantity ?? addon.unit.size) / addon.unit.size))) : 1;
  const { termRow, existing } = await withTenant(db, access.school.id, async (tx) => {
    const [termRow] = await tx
      .select({ term: terms, session: academicSessions.name })
      .from(terms)
      .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
      .where(eq(terms.isCurrent, true));
    const [existing] = addon.billing === "term" ? await tx.select().from(schoolAddons).where(and(eq(schoolAddons.key, addon.key), inArray(schoolAddons.status, ["active", "pending"]))) : [];
    return { termRow: termRow ?? null, existing: existing ?? null };
  });
  if (existing) throw new AppError(existing.status === "active" ? `${addon.name} is already on.` : `${addon.name} is waiting for its bill to be paid.`, "conflict");
  if (addon.grants?.every((g) => access.plan.features.includes(g))) throw new AppError(`${addon.name} is already in your plan.`, "conflict");
  const today = lagosToday();
  let amount = addon.priceKobo * units;
  let description = addon.unit ? `${addon.name}: ${units * addon.unit.size} ${addon.unit.label}` : addon.name;
  if (addon.billing === "term" && termRow) {
    const share = termFraction(termRow.term, today);
    amount = charge(addon.priceKobo, 1, share);
    description = `${addon.name}, rest of this term (${Math.round(share * 100)}%), then ${formatNaira(addon.priceKobo)} a term`;
  }
  const number = await nextBillNumber(db);
  return withTenant(db, access.school.id, async (tx) => {
    const [bill] = await tx
      .insert(platformInvoices)
      .values({
        schoolId: access.school.id,
        number,
        kind: "addon",
        termId: termRow?.term.id ?? null,
        period: termRow ? `${termRow.term.name}, ${termRow.session}` : today.slice(0, 4),
        planKey: access.plan.key,
        lines: [{ description, amountKobo: amount }],
        totalKobo: amount,
        issuedOn: today,
        dueOn: addDays(today, 14),
      })
      .returning();
    const [row] = await tx
      .insert(schoolAddons)
      .values({ schoolId: access.school.id, key: addon.key, invoiceId: bill.id, note: addon.unit ? `${units * addon.unit.size} ${addon.unit.label}` : null, boughtBy: access.membershipId })
      .returning();
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "billing.addon", summary: `Ordered ${description} (${formatNaira(amount)})` });
    return { addon: row, bill };
  });
}

/** Called when a bill is paid: switches on whatever add-ons it was for. */
export async function activateAddonsForBill(db: DB, schoolId: string, billId: string) {
  const changed = await withTenant(db, schoolId, (tx) => tx.update(schoolAddons).set({ status: "active" }).where(and(eq(schoolAddons.invoiceId, billId), eq(schoolAddons.status, "pending"))).returning());
  if (changed.some((a) => addonByKey(a.key)?.grants?.length)) await syncExtraFeatures(db, schoolId);
  return changed.length;
}

/** Stops a term add-on. It keeps working for the term already paid for. */
export async function cancelAddon(db: DB, access: Access, addonId: string, ip?: string | null) {
  requirePermission(access, "school:billing");
  const [row] = await withTenant(db, access.school.id, (tx) => tx.update(schoolAddons).set({ status: "cancelled" }).where(and(eq(schoolAddons.id, addonId), eq(schoolAddons.status, "active"))).returning());
  if (!row) throw new AppError("That add-on isn't active.", "not_found");
  const addon = addonByKey(row.key);
  if (addon?.billing !== "term") throw new AppError("One-off services can't be cancelled once paid. Talk to us.", "conflict");
  await syncExtraFeatures(db, access.school.id);
  await withTenant(db, access.school.id, (tx) => recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "billing.addon_cancelled", summary: `Stopped ${addon.name} from next term` }));
}

/** Term add-ons that go on the next term bill (bought before this term, still active). */
export async function termAddonLines(db: DB, schoolId: string, termId: string) {
  const rows = await withTenant(db, schoolId, (tx) =>
    tx
      .select({ key: schoolAddons.key, termId: platformInvoices.termId })
      .from(schoolAddons)
      .leftJoin(platformInvoices, eq(platformInvoices.id, schoolAddons.invoiceId))
      .where(eq(schoolAddons.status, "active")),
  );
  return rows
    .filter((r) => r.termId !== termId)
    .map((r) => addonByKey(r.key))
    .filter((a): a is Addon => !!a && a.billing === "term")
    .map((a) => ({ description: `${a.name} add-on`, amountKobo: a.priceKobo }));
}
