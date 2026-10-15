import { createPgliteDatabase, type Database } from "@/lib/db/client";
import { seedPlans } from "@/lib/db/seed-plans";

export async function createTestDatabase(): Promise<Database> {
  const database = createPgliteDatabase();
  await database.migrate();
  await seedPlans(database.db);
  return database;
}
