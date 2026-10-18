import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // The live site refuses to start without its secrets, or with test switches on.
  if (process.env.VERCEL_ENV === "production") {
    const { productionEnvProblems } = await import("./lib/monitoring");
    const { fatal, warn } = productionEnvProblems();
    for (const w of warn) console.warn(`[env] ${w}`);
    if (fatal.length) throw new Error(`Adalin SchoolHub can't start safely:\n- ${fatal.join("\n- ")}`);
  }

  // Applies pending migrations when the local development server starts, so schema changes
  // never need a separate step, then sends anything left in the message queue. Production runs `pnpm db:migrate` as part of deployment.
  if (process.env.NODE_ENV === "production") return;
  const { getDatabase } = await import("./lib/db/client");
  const { seedPlans } = await import("./lib/db/seed-plans");
  const database = getDatabase();
  await database.migrate();
  await seedPlans(database.db);
  // Messages queued by seed scripts (or a server stopped mid-send) go out now. Without provider keys they're logged.
  const { drainOutbox } = await import("./lib/services/outbox");
  await drainOutbox(database.db, undefined, 1000).catch((error) => console.error("[outbox]", error));
}

/** Every unexpected server error (pages, actions, routes) is reported. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./lib/monitoring");
  await reportError(error, {
    url: request.path,
    method: request.method,
    digest: (error as { digest?: string }).digest,
    route: context.routePath,
    tags: { kind: context.routeType },
  });
};
