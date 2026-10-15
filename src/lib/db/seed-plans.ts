import { sql } from "drizzle-orm";
import { DEFAULT_PLANS } from "../plans/catalog";
import type { DB } from "./client";
import { plans } from "./schema";

/** Inserts default plans. Existing rows are left alone so admin-console edits survive redeploys. */
export async function seedPlans(db: DB) {
  await db
    .insert(plans)
    .values(
      DEFAULT_PLANS.map((p) => ({
        key: p.key,
        name: p.name,
        pricePerStudentKobo: p.pricePerStudentKobo,
        features: p.features,
        limits: p.limits as Record<string, number>,
        sort: p.sort,
      })),
    )
    .onConflictDoNothing({ target: plans.key });
  await db.execute(sql`select 1`);
}
