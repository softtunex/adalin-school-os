import { sql } from "drizzle-orm";
import type { DB, Tx } from "./client";
import { APP_ROLE } from "./rls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction scoped to one school. Inside it the connection drops to the
 * restricted role, so Postgres itself refuses rows from any other school, even if a query
 * forgets its school_id filter.
 */
export async function withTenant<T>(db: DB, schoolId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(schoolId)) throw new Error("Invalid school id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
    await tx.execute(sql.raw(`set local role ${APP_ROLE}`));
    return fn(tx);
  });
}
