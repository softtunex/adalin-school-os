import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";
import { applyRowLevelSecurity } from "./rls";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type Database = {
  db: DB;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export function createPgliteDatabase(dataDir?: string): Database {
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema }) as unknown as DB;
  return {
    db,
    migrate: async () => {
      await migratePglite(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
      await applyRowLevelSecurity(db);
    },
    close: () => client.close(),
  };
}

export function createPostgresDatabase(url: string): Database {
  const client = postgres(url, { prepare: false, max: 10 });
  const db = drizzlePostgres(client, { schema }) as unknown as DB;
  return {
    db,
    migrate: async () => {
      await migratePostgres(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
      await applyRowLevelSecurity(db);
    },
    close: () => client.end(),
  };
}

export function createDatabaseFromEnv(): Database {
  const url = process.env.DATABASE_URL;
  if (url) return createPostgresDatabase(url);
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB !== "1") {
    throw new Error("DATABASE_URL is required in production.");
  }
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(path.dirname(dataDir), { recursive: true });
  return createPgliteDatabase(dataDir);
}

const globalForDb = globalThis as unknown as { __schoolOsDb?: Database };

export function getDatabase(): Database {
  if (!globalForDb.__schoolOsDb) globalForDb.__schoolOsDb = createDatabaseFromEnv();
  return globalForDb.__schoolOsDb;
}

export function getDb(): DB {
  return getDatabase().db;
}
