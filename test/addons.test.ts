import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { platformInvoices, schools, terms } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { addonsOverview, buyAddon, cancelAddon, syncExtraFeatures } from "@/lib/services/addons";
import { lagosToday } from "@/lib/services/attendance";
import { ensureTermBill, payBill } from "@/lib/services/billing";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let termIds: string[];

function shift(days: number) {
  const d = new Date(`${lagosToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const refresh = async () => {
  owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
};

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mr Extra", email: "extra@addons.test", password: "Addons123", schoolName: "Extra College" });
  await database.db.update(schools).set({ planKey: "basic" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  termIds = overview.sessions.flatMap((s) => s.terms).map((t) => t.id);
  await withTenant(database.db, owner.school.id, (tx) => tx.update(terms).set({ startsOn: shift(-30), endsOn: shift(60) }).where(eq(terms.isCurrent, true)));
  await createStudent(database.db, owner, studentInputSchema.parse({ firstName: "Ada", lastName: "Extra", gender: "female", classId: overview.levels[0].classes[0].id }), []);
});

afterAll(async () => {
  await database.close();
});

describe("add-ons", () => {
  it("switches School colours on for a Basic school once it's paid", async () => {
    expect(owner.plan.features).not.toContain("brand_theme");
    const { bill } = await buyAddon(database.db, owner, { key: "brand_theme" });
    expect(bill.kind).toBe("addon");
    expect(bill.totalKobo).toBeLessThan(15_000_00);
    await expect(buyAddon(database.db, owner, { key: "brand_theme" })).rejects.toThrow(/waiting for its bill/);
    await refresh();
    expect(owner.plan.features).not.toContain("brand_theme");
    await payBill(database.db, owner, bill.id, "http://localhost");
    await refresh();
    expect(owner.plan.features).toContain("brand_theme");
    expect((await addonsOverview(database.db, owner)).catalogue.find((a) => a.key === "brand_theme")?.active).toBe(true);
  });

  it("refuses an add-on the plan already has", async () => {
    await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, owner.school.id));
    const premium = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
    await expect(buyAddon(database.db, premium, { key: "brand_theme" })).rejects.toThrow(/already on|already in your plan/);
    await database.db.update(schools).set({ planKey: "basic" }).where(eq(schools.id, owner.school.id));
    await refresh();
  });

  it("puts a term add-on on next term's bill, and stops it at the end of the term", async () => {
    await withTenant(database.db, owner.school.id, async (tx) => {
      await tx.update(terms).set({ isCurrent: false });
      await tx.update(terms).set({ isCurrent: true, startsOn: shift(0), endsOn: shift(90) }).where(eq(terms.id, termIds[1]));
    });
    const bill = await ensureTermBill(database.db, owner.school.id);
    expect(bill?.lines.map((l) => l.description)).toEqual(["Basic: 1 student on roll × ₦600", "School colours add-on"]);
    const addon = (await addonsOverview(database.db, owner)).bought.find((b) => b.key === "brand_theme")!;
    await cancelAddon(database.db, owner, addon.id);
    await refresh();
    // Paid for the last term, which is over: it stops now.
    expect(owner.plan.features).not.toContain("brand_theme");
  });

  it("sells one-off services by the unit", async () => {
    const { bill, addon } = await buyAddon(database.db, owner, { key: "pin_cards", quantity: 300 });
    expect(bill.totalKobo).toBe(60_000_00);
    expect(addon.note).toBe("300 cards");
    const [row] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(platformInvoices).where(eq(platformInvoices.id, bill.id)));
    expect(row.status).toBe("open");
    expect(await syncExtraFeatures(database.db, owner.school.id)).toEqual([]);
  });
});
