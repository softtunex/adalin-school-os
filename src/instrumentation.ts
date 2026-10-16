// Applies pending migrations when the local development server starts, so schema changes
// never need a separate step. Production runs `pnpm db:migrate` as part of deployment.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "production") return;
  const { getDatabase } = await import("./lib/db/client");
  const { seedPlans } = await import("./lib/db/seed-plans");
  const database = getDatabase();
  await database.migrate();
  await seedPlans(database.db);
}
