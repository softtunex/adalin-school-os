import { createDatabaseFromEnv } from "../src/lib/db/client";
import { seedPlans } from "../src/lib/db/seed-plans";

async function main() {
  // On Vercel, migrate over the direct (unpooled) connection when one is provided.
  if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
  const database = createDatabaseFromEnv();
  await database.migrate();
  await seedPlans(database.db);
  await database.close();
  console.log("Database migrated.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
