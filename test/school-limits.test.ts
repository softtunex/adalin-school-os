import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { loadAccess } from "@/lib/services/access";
import { addSchool, registerSchoolOwner } from "@/lib/services/accounts";
import { changePlan } from "@/lib/services/billing";
import { MAX_SELF_SERVE_SCHOOLS, newSchoolTerms } from "@/lib/services/school-limits";
import { createTestDatabase } from "./helpers";

let database: Database;
let user: { id: string; name: string };
let firstSlug: string;

beforeAll(async () => {
  database = await createTestDatabase();
  const r = await registerSchoolOwner(database.db, { name: "Mrs Ngozi Okafor", email: "ngozi@limits.test", password: "Limits2026", schoolName: "Adalin Limits Nursery" });
  user = r.user;
  firstSlug = r.school.slug;
});

afterAll(async () => {
  await database.close();
});

const plan = async (slug: string) => (await database.db.select().from(schools).where(eq(schools.slug, slug)))[0];

describe("schools per proprietor", () => {
  it("keeps the first school free, and starts every other school on a trial that ends onto Basic", async () => {
    expect((await plan(firstSlug)).planKey).toBe("free");
    expect(await newSchoolTerms(database.db, user.id)).toMatchObject({ count: 1, atLimit: false, freeSchool: "Adalin Limits Nursery" });

    const second = await addSchool(database.db, user, "Adalin Limits Primary", "premium");
    const row = await plan(second.slug);
    expect(row).toMatchObject({ planKey: "premium", trialReturnPlanKey: "basic", trialUsed: true });
    expect(row.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });

  it("won't move a second school to Free while the first is free", async () => {
    const access = (await loadAccess(database.db, user.id, (await plan(firstSlug)).slug))!;
    const secondRow = (await database.db.select().from(schools).where(eq(schools.name, "Adalin Limits Primary")))[0];
    const second = (await loadAccess(database.db, user.id, secondRow.slug))!;
    await expect(changePlan(database.db, second, "free")).rejects.toThrow(/one free school/);
    // The free school itself can stay on Free.
    await expect(changePlan(database.db, access, "free")).resolves.toMatchObject({ change: "kept" });
  });

  it("lets a proprietor whose only school is paid add a free one", async () => {
    const r = await registerSchoolOwner(database.db, { name: "Mr Tunde Bello", email: "tunde@limits.test", password: "Limits2026", schoolName: "Adalin Paid College" });
    await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, r.school.id));
    const extra = await addSchool(database.db, r.user, "Adalin Free Annex");
    expect((await plan(extra.slug)).planKey).toBe("free");
  });

  it(`stops at ${MAX_SELF_SERVE_SCHOOLS} schools and points to Enterprise`, async () => {
    const terms = await newSchoolTerms(database.db, user.id);
    for (let i = terms.count; i < MAX_SELF_SERVE_SCHOOLS; i++) await addSchool(database.db, user, `Adalin Limits Campus ${i}`);
    expect((await newSchoolTerms(database.db, user.id)).atLimit).toBe(true);
    await expect(addSchool(database.db, user, "One Too Many")).rejects.toThrow(/Enterprise/);
  });
});
