import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { TENANT_TABLES } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { createStudent, guardianInputSchema, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

/*
 * Every school table, not just a sample: the rules are in place on all of them, and with two
 * schools full of real data, neither can read, change or delete the other's rows.
 */

// Tables with a school_id that deliberately sit outside row-level security, and why.
const NOT_TENANT: Record<string, string> = {
  platform_audit: "Adalin's own log of admin-console actions; never read with a school's role",
};

let database: Database;
let a: Access;
let b: Access;

type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => ((Array.isArray(r) ? r : (r as { rows: Row[] }).rows) as Row[]);

async function fill(access: Access, prefix: string) {
  await setupAcademics(database.db, access, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const classId = (await getAcademicOverview(database.db, access)).levels[0].classes[0].id;
  for (let i = 0; i < 3; i++) {
    await createStudent(
      database.db,
      access,
      studentInputSchema.parse({ firstName: `${prefix}${i}`, lastName: "Isolation", gender: i % 2 ? "male" : "female", classId }),
      [guardianInputSchema.parse({ name: `Parent of ${prefix}${i}`, phone: `0803000${prefix === "A" ? 1 : 2}00${i}` })],
    );
  }
}

beforeAll(async () => {
  database = await createTestDatabase();
  const ra = await registerSchoolOwner(database.db, { name: "Owner A", email: "a@isolation.test", password: "Isolate123", schoolName: "Isolation School A" });
  const rb = await registerSchoolOwner(database.db, { name: "Owner B", email: "b@isolation.test", password: "Isolate123", schoolName: "Isolation School B" });
  a = (await loadAccess(database.db, ra.user.id, ra.school.slug))!;
  b = (await loadAccess(database.db, rb.user.id, rb.school.slug))!;
  await fill(a, "A");
  await fill(b, "B");
});

afterAll(async () => {
  await database.close();
});

describe("tenant isolation on every table", () => {
  it("puts every table that holds school data under row-level security", async () => {
    const withSchool = rowsOf(
      await database.db.execute(sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'school_id' order by table_name`),
    ).map((r) => r.table_name as string);
    const missing = withSchool.filter((t) => !(TENANT_TABLES as readonly string[]).includes(t) && !NOT_TENANT[t]);
    expect(missing, "tables with school_id that aren't in TENANT_TABLES").toEqual([]);

    const policies = rowsOf(
      await database.db.execute(sql`
        select c.relname as table, c.relrowsecurity as rls, p.qual, p.with_check
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        left join pg_policies p on p.tablename = c.relname and p.policyname = 'tenant_isolation'
        where n.nspname = 'public' and c.relkind = 'r'`),
    );
    for (const table of TENANT_TABLES) {
      const p = policies.find((x) => x.table === table);
      expect(p?.rls, `${table}: row-level security`).toBe(true);
      expect(String(p?.qual), `${table}: read rule`).toContain("app.school_id");
      expect(String(p?.with_check), `${table}: write rule`).toContain("app.school_id");
    }
  });

  it("never shows, changes or deletes another school's rows, on any table", async () => {
    let checked = 0;
    for (const table of TENANT_TABLES) {
      const t = sql.identifier(table);
      const [{ n: theirs }] = rowsOf(await database.db.execute(sql`select count(*)::int as n from ${t} where school_id = ${a.school.id}`));
      if (!theirs) continue;
      checked++;
      // As school B: A's rows are invisible, even asked for by id...
      const seen = rowsOf(await withTenant(database.db, b.school.id, (tx) => tx.execute(sql`select count(*)::int as n from ${t} where school_id = ${a.school.id}`)));
      expect(seen[0].n, `${table}: B can read A's rows`).toBe(0);
      // ...and untouchable.
      await withTenant(database.db, b.school.id, async (tx) => {
        await tx.execute(sql`update ${t} set school_id = school_id where school_id = ${a.school.id}`);
        await tx.execute(sql`delete from ${t} where school_id = ${a.school.id}`);
      });
      const [{ n: after }] = rowsOf(await database.db.execute(sql`select count(*)::int as n from ${t} where school_id = ${a.school.id}`));
      expect(after, `${table}: B changed A's rows`).toBe(theirs);
    }
    // The fixture should exercise a good spread of tables (the policy check above covers the rest).
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  it("refuses to move a row into another school", async () => {
    await expect(withTenant(database.db, b.school.id, (tx) => tx.execute(sql`update students set school_id = ${a.school.id}`))).rejects.toThrow();
  });
});
