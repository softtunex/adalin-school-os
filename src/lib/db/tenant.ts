import { sql } from "drizzle-orm";
import type { DB, Tx } from "./client";
import { APP_ROLE } from "./rls";

const SLOW_MS = Number(process.env.SLOW_QUERY_MS ?? 1000);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction scoped to one school. Inside it the connection drops to the
 * restricted role, so Postgres itself refuses rows from any other school, even if a query
 * forgets its school_id filter.
 */
export async function withTenant<T>(db: DB, schoolId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(schoolId)) throw new Error("Invalid school id");
  const started = performance.now();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
      await tx.execute(sql.raw(`set local role ${APP_ROLE}`));
      return fn(tx);
    });
  } finally {
    // Slow school queries show up in the logs (and Neon's query insights) to be indexed or reworked.
    const ms = performance.now() - started;
    if (ms > SLOW_MS) console.warn(`[slow] school ${schoolId.slice(0, 8)} transaction took ${Math.round(ms)} ms`);
  }
}
