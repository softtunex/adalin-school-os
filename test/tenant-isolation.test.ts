import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { auditLogs, memberships, schools, users } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { createTestDatabase } from "./helpers";

let database: Database;
let schoolA: string;
let schoolB: string;

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [a] = await db.insert(schools).values({ name: "Alpha College", slug: "alpha", planKey: "free" }).returning();
  const [b] = await db.insert(schools).values({ name: "Beta Academy", slug: "beta", planKey: "free" }).returning();
  schoolA = a.id;
  schoolB = b.id;
  const [ua] = await db.insert(users).values({ name: "Ada", email: "ada@alpha.test" }).returning();
  const [ub] = await db.insert(users).values({ name: "Bola", email: "bola@beta.test" }).returning();
  await db.insert(memberships).values([
    { schoolId: schoolA, userId: ua.id },
    { schoolId: schoolB, userId: ub.id },
  ]);
  await db.insert(auditLogs).values([
    { schoolId: schoolA, action: "test", summary: "alpha event" },
    { schoolId: schoolB, action: "test", summary: "beta event" },
  ]);
});

afterAll(async () => {
  await database.close();
});

describe("tenant isolation", () => {
  it("an unfiltered query only returns the current school's rows", async () => {
    const rows = await withTenant(database.db, schoolA, (tx) => tx.select().from(auditLogs));
    expect(rows.map((r) => r.summary)).toEqual(["alpha event"]);
  });

  it("cannot see other schools or their users", async () => {
    const visibleSchools = await withTenant(database.db, schoolA, (tx) => tx.select().from(schools));
    expect(visibleSchools.map((s) => s.slug)).toEqual(["alpha"]);
    const visibleUsers = await withTenant(database.db, schoolA, (tx) => tx.select().from(users));
    expect(visibleUsers.map((u) => u.name)).toEqual(["Ada"]);
  });

  it("cannot write a row into another school", async () => {
    await expect(
      withTenant(database.db, schoolA, (tx) =>
        tx.insert(auditLogs).values({ schoolId: schoolB, action: "x", summary: "smuggled" }),
      ),
    ).rejects.toThrow();
  });

  it("cannot update or delete another school's rows", async () => {
    await withTenant(database.db, schoolA, async (tx) => {
      await tx.update(auditLogs).set({ summary: "hacked" }).where(eq(auditLogs.schoolId, schoolB));
      await tx.delete(auditLogs).where(eq(auditLogs.schoolId, schoolB));
    });
    const beta = await database.db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolB));
    expect(beta.map((r) => r.summary)).toEqual(["beta event"]);
  });

  it("cannot read platform tables like sessions", async () => {
    await expect(
      withTenant(database.db, schoolA, (tx) => tx.execute(sql`select * from sessions`)),
    ).rejects.toSatisfy((e: unknown) => /permission denied/i.test(String((e as { cause?: unknown }).cause ?? e)));
  });

  it("rejects a malformed school id", async () => {
    await expect(withTenant(database.db, "' or 1=1 --", async () => 1)).rejects.toThrow("Invalid school id");
  });
});
