/**
 * Checks that a database (usually one just restored from a backup) is whole and safe to use:
 * every migration applied, row-level security on every school table, schools isolated, and
 * (with --compare) the same rows as the copy it was restored from.
 *
 *   DATABASE_URL=<restored branch> npx tsx scripts/restore-check.ts --save before.json   # on the source
 *   DATABASE_URL=<restored branch> npx tsx scripts/restore-check.ts --compare before.json # on the restore
 *
 * Locally, PGLITE_DIR picks the database folder instead of DATABASE_URL.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { TENANT_TABLES } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown) => (Array.isArray(r) ? r : (r as { rows: Row[] }).rows) as Row[];

async function main() {
  const args = process.argv.slice(2);
  const save = args.includes("--save") ? args[args.indexOf("--save") + 1] : null;
  const compare = args.includes("--compare") ? args[args.indexOf("--compare") + 1] : null;
  const database = createDatabaseFromEnv();
  const { db } = database;
  const problems: string[] = [];

  // 1. Migrations: everything in the journal is applied.
  const journal = JSON.parse(readFileSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
  const [{ n: applied }] = rowsOf(await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`));
  if (applied !== journal.entries.length) problems.push(`Migrations: ${applied} applied, ${journal.entries.length} expected.`);

  // 2. Row-level security on every school table.
  const rls = rowsOf(
    await db.execute(sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_policies p on p.tablename = c.relname and p.policyname = 'tenant_isolation' where n.nspname = 'public' and c.relrowsecurity`),
  ).map((r) => r.t as string);
  const unprotected = TENANT_TABLES.filter((t) => !rls.includes(t));
  if (unprotected.length) problems.push(`No row-level security on: ${unprotected.join(", ")}`);

  // 3. Isolation still holds: as one school, no other school's students are visible.
  const schools = rowsOf(await db.execute(sql`select id from schools order by created_at limit 2`)).map((r) => r.id as string);
  if (schools.length === 2) {
    const leak = rowsOf(await withTenant(db, schools[0], (tx) => tx.execute(sql`select count(*)::int as n from students where school_id = ${schools[1]}`)));
    if (leak[0].n !== 0) problems.push("Isolation: one school can see another's students.");
  }

  // 4. Row counts, to compare with the source.
  const counts: Record<string, number> = {};
  for (const t of ["schools", "users", ...TENANT_TABLES]) {
    counts[t] = rowsOf(await db.execute(sql`select count(*)::int as n from ${sql.identifier(t)}`))[0].n as number;
  }
  if (save) writeFileSync(save, JSON.stringify(counts, null, 2));
  if (compare) {
    const before = JSON.parse(readFileSync(compare, "utf8")) as Record<string, number>;
    const diffs = Object.keys(before).filter((t) => before[t] !== counts[t]).map((t) => `${t}: ${before[t]} → ${counts[t] ?? "missing"}`);
    if (diffs.length) problems.push(`Row counts differ:\n    ${diffs.join("\n    ")}`);
  }

  await database.close();
  console.log(`Migrations ${applied}/${journal.entries.length} · ${rls.length} tables protected · ${counts.schools} schools · ${counts.students} students · ${counts.payments} payments`);
  if (problems.length) {
    console.error(`\nRESTORE CHECK FAILED\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(compare ? "Restore check passed: the restored database matches the source." : "Database check passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
