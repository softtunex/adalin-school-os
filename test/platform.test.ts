import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { plans, platformAudit, schools, users } from "@/lib/db/schema";
import { loadAccess, listUserSchools, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import {
  addManualBill,
  grantSupport,
  listSchools,
  markBillPaid,
  openAsSupport,
  requirePlatformAdmin,
  revokeSupport,
  setFeatureOverrides,
  setSchoolStatus,
  supportNotice,
  updatePlan,
  voidBill,
  type Admin,
} from "@/lib/services/platform";
import { listStaff } from "@/lib/services/staff";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let admin: Admin;

const refresh = async () => {
  owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
};

beforeAll(async () => {
  database = await createTestDatabase();
  const a = await registerSchoolOwner(database.db, { name: "Mrs Proprietor", email: "owner@platform.test", password: "Platform123", schoolName: "Client College" });
  owner = (await loadAccess(database.db, a.user.id, a.school.slug))!;
  const b = await registerSchoolOwner(database.db, { name: "Ade Support", email: "ade@platform.test", password: "Platform123", schoolName: "Adalin Sandbox" });
  await database.db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, b.user.id));
  admin = await requirePlatformAdmin(database.db, b.user.id);
});

afterAll(async () => {
  await database.close();
});

describe("admin console", () => {
  it("keeps everyone else out", async () => {
    await expect(requirePlatformAdmin(database.db, owner.user.id)).rejects.toThrow(/Adalin team/);
  });

  it("finds schools by name and filters by plan", async () => {
    expect((await listSchools(database.db, { q: "client" })).rows.map((r) => r.school.name)).toEqual(["Client College"]);
    expect((await listSchools(database.db, { plan: "enterprise" })).total).toBe(0);
  });

  it("switches single features on and off over the plan", async () => {
    expect(owner.plan.features).not.toContain("hostel");
    expect(owner.plan.features).toContain("attendance");
    await setFeatureOverrides(database.db, admin, owner.school.id, { grants: ["hostel"], blocks: ["attendance"] });
    await refresh();
    expect(owner.plan.features).toContain("hostel");
    expect(owner.plan.features).not.toContain("attendance");
    await setFeatureOverrides(database.db, admin, owner.school.id, { grants: [], blocks: [] });
    await refresh();
    expect(owner.plan.features).not.toContain("hostel");
  });

  it("marks a transfer paid, which lifts read-only", async () => {
    await setSchoolStatus(database.db, admin, owner.school.id, "read_only", "Testing");
    const bill = await addManualBill(database.db, admin, owner.school.id, { description: "Data migration", amountKobo: 50_000_00, dueInDays: 0 });
    expect(bill.kind).toBe("manual");
    await expect(markBillPaid(database.db, admin, bill.id, "x")).rejects.toThrow(/how it was paid/);
    await markBillPaid(database.db, admin, bill.id, "GTB transfer 0042");
    const [s] = await database.db.select().from(schools).where(eq(schools.id, owner.school.id));
    expect(s.status).toBe("active");
    await expect(voidBill(database.db, admin, bill.id, "Mistake")).rejects.toThrow(/waiting for payment/);
  });

  it("changes a plan's price for every school on it, and logs it", async () => {
    const [basic] = await database.db.select().from(plans).where(eq(plans.key, "basic"));
    await updatePlan(database.db, admin, { key: "basic", name: "Basic", pricePerStudentKobo: 70_000, features: basic.features, limits: { students: null, staff: null, audit_days: 0 } });
    const [after] = await database.db.select().from(plans).where(eq(plans.key, "basic"));
    expect(after.pricePerStudentKobo).toBe(70_000);
    const log = await database.db.select().from(platformAudit).where(eq(platformAudit.action, "plan.updated"));
    expect(log[0].summary).toContain("₦700");
  });
});

describe("support access", () => {
  it("can't get in until the school opens it", async () => {
    await expect(openAsSupport(database.db, admin, owner.school.id)).rejects.toThrow(/hasn't let Adalin support in/);
  });

  it("gets in as a proprietor while it's open, without showing as staff", async () => {
    await expect(grantSupport(database.db, owner, { hours: 5, reason: "" })).rejects.toThrow(/24 or 72/);
    await grantSupport(database.db, owner, { hours: 24, reason: "Report cards" });
    expect((await supportNotice(database.db, owner))?.text).toMatch(/can sign in to your school until/);
    const slug = await openAsSupport(database.db, admin, owner.school.id);
    expect(slug).toBe(owner.school.slug);
    const support = await loadAccess(database.db, admin.id, slug);
    expect(support?.supportUntil).toBeInstanceOf(Date);
    expect(support?.permissions.has("school:billing")).toBe(true);
    expect((await supportNotice(database.db, support!))?.self).toBe(true);
    expect((await listStaff(database.db, owner)).staff.map((m) => m.name)).not.toContain("Ade Support");
    expect((await listUserSchools(database.db, admin.id)).map((s) => s.slug)).toContain(slug);
  });

  it("ends at once when the school closes it", async () => {
    await revokeSupport(database.db, owner);
    expect(await loadAccess(database.db, admin.id, owner.school.slug)).toBeNull();
    expect((await listUserSchools(database.db, admin.id)).map((s) => s.slug)).not.toContain(owner.school.slug);
    await expect(openAsSupport(database.db, admin, owner.school.id)).rejects.toThrow(/hasn't let Adalin support in/);
  });
});
