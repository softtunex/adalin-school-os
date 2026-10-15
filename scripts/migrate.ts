import { createDatabaseFromEnv } from "../src/lib/db/client";
import { seedPlans } from "../src/lib/db/seed-plans";

async function main() {
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
