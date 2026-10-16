// Applies pending migrations when the local development server starts, so schema changes
// never need a separate step, then sends anything left in the message queue. Production runs `pnpm db:migrate` as part of deployment.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "production") return;
  const { getDatabase } = await import("./lib/db/client");
  const { seedPlans } = await import("./lib/db/seed-plans");
  const database = getDatabase();
  await database.migrate();
  await seedPlans(database.db);
  // Messages queued by seed scripts (or a server stopped mid-send) go out now. Without provider keys they're logged.
  const { drainOutbox } = await import("./lib/services/outbox");
  await drainOutbox(database.db, undefined, 1000).catch((error) => console.error("[outbox]", error));
}
