import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { TENANT_TABLES } from "./schema";

export const APP_ROLE = "app_user";

const CURRENT_SCHOOL = `nullif(current_setting('app.school_id', true), '')::uuid`;

/**
 * Tenant queries run as the restricted `app_user` role (see withTenant), which only
 * sees rows for the school set in `app.school_id`. Platform code runs as the owner
 * role and is not subject to these policies. Idempotent, runs after every migration.
 */
export async function applyRowLevelSecurity(db: PgDatabase<PgQueryResultHKT, Record<string, unknown>>) {
  const statements: string[] = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
         CREATE ROLE ${APP_ROLE} NOLOGIN;
       END IF;
     END $$`,
    `GRANT ${APP_ROLE} TO CURRENT_USER`,
    `GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`,
    `GRANT SELECT ON plans TO ${APP_ROLE}`,
    `GRANT SELECT, UPDATE ON schools TO ${APP_ROLE}`,
    `GRANT SELECT ON users TO ${APP_ROLE}`,
  ];

  for (const table of TENANT_TABLES) {
    statements.push(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO ${APP_ROLE}`,
      `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON ${table}`,
      `CREATE POLICY tenant_isolation ON ${table} TO ${APP_ROLE}
         USING (school_id = ${CURRENT_SCHOOL})
         WITH CHECK (school_id = ${CURRENT_SCHOOL})`,
    );
  }

  statements.push(
    `ALTER TABLE schools ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS tenant_isolation ON schools`,
    `CREATE POLICY tenant_isolation ON schools TO ${APP_ROLE}
       USING (id = ${CURRENT_SCHOOL}) WITH CHECK (id = ${CURRENT_SCHOOL})`,
    `ALTER TABLE users ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS tenant_members ON users`,
    `CREATE POLICY tenant_members ON users FOR SELECT TO ${APP_ROLE}
       USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.school_id = ${CURRENT_SCHOOL}))`,
  );

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}
