import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { platformInvoices, schools, terms } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { lagosToday } from "@/lib/services/attendance";
import { billingOverview, changePlan, charge, ensureTermBill, payBill, runBilling, startTrial, termFraction } from "@/lib/services/billing";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;

function shift(days: number) {
  const d = new Date(`${lagosToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function refresh() {
  owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Ledger", email: "ledger@billing.test", password: "Billing123", schoolName: "Ledger College" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  const gold = overview.levels[0].classes[0].id;
  const current = overview.sessions.flatMap((s) => s.terms).find((t) => t.isCurrent)!;
  // The term started 30 days ago and ends in 60: two thirds of it left (61 of 91 days).
  await withTenant(database.db, owner.school.id, (tx) => tx.update(terms).set({ startsOn: shift(-30), endsOn: shift(60) }).where(eq(terms.id, current.id)));
  for (let i = 0; i < 10; i++) await createStudent(database.db, owner, studentInputSchema.parse({ firstName: `Pupil${i}`, lastName: "Ledger", gender: i % 2 ? "male" : "female", classId: gold }), []);
});

afterAll(async () => {
  await database.close();
});

describe("billing", () => {
  it("works out term shares and charges in whole naira", () => {
    expect(termFraction({ startsOn: "2026-09-01", endsOn: "2026-09-10" }, "2026-08-20")).toBe(1);
    expect(termFraction({ startsOn: "2026-09-01", endsOn: "2026-09-10" }, "2026-09-06")).toBe(0.5);
    expect(termFraction({ startsOn: "2026-09-01", endsOn: "2026-09-10" }, "2026-10-01")).toBe(0);
    expect(termFraction({ startsOn: null, endsOn: null }, "2026-10-01")).toBe(1);
    expect(charge(1_200_00, 10, 1 / 3)).toBe(4_000_00);
  });

  it("doesn't bill a free school, and gives one free trial", async () => {
    expect(await ensureTermBill(database.db, owner.school.id)).toBeNull();
    await expect(startTrial(database.db, owner, "basic")).rejects.toThrow(/Standard and Premium/);
    await startTrial(database.db, owner, "premium");
    await refresh();
    expect(owner.plan.key).toBe("premium");
    expect(await ensureTermBill(database.db, owner.school.id)).toBeNull();
    await expect(startTrial(database.db, owner, "standard")).rejects.toThrow(/already had its free trial/);
  });

  it("ends the trial back on the old plan", async () => {
    await database.db.update(schools).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(schools.id, owner.school.id));
    const r = await runBilling(database.db);
    expect(r.trialsEnded).toBe(1);
    await refresh();
    expect(owner.plan.key).toBe("free");
  });

  it("upgrades now, charging for the rest of the term", async () => {
    const r = await changePlan(database.db, owner, "standard");
    expect(r.change).toBe("now");
    const share = termFraction({ startsOn: shift(-30), endsOn: shift(60) }, lagosToday());
    expect(r.bill?.totalKobo).toBe(charge(1_200_00, 10, share));
    expect(r.bill?.kind).toBe("term");
    await refresh();
    // Upgrading again bills only the difference, on the same student count.
    const up = await changePlan(database.db, owner, "premium");
    expect(up.bill).toMatchObject({ kind: "upgrade", totalKobo: charge(600_00, 10, share) });
  });

  it("moves to a cheaper plan only from next term", async () => {
    await refresh();
    const r = await changePlan(database.db, owner, "basic");
    expect(r.change).toBe("next_term");
    await refresh();
    expect(owner.plan.key).toBe("premium");
    const o = await billingOverview(database.db, owner);
    expect(o.pending?.key).toBe("basic");
    expect(o.bills).toHaveLength(2);
    expect(o.owed).toBe(o.bills.reduce((n, b) => n + b.totalKobo, 0));
  });

  it("puts the school in read-only a week after the due date, and payment lifts it", async () => {
    await withTenant(database.db, owner.school.id, (tx) => tx.update(platformInvoices).set({ dueOn: shift(-8) }));
    const r = await runBilling(database.db);
    expect(r.readOnly).toBe(1);
    await refresh();
    expect(owner.school.status).toBe("read_only");
    const { bills } = await billingOverview(database.db, owner);
    for (const bill of bills) await payBill(database.db, owner, bill.id, "http://localhost");
    await refresh();
    expect(owner.school.status).toBe("active");
    expect((await billingOverview(database.db, owner)).owed).toBe(0);
    await expect(payBill(database.db, owner, bills[0].id, "http://localhost")).rejects.toThrow(/already paid/);
  });
});
