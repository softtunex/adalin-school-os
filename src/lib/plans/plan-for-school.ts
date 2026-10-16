import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { plans } from "../db/schema";

export async function getPlanForSchool(db: DB, planKey: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.key, planKey));
  return plan ?? null;
}
