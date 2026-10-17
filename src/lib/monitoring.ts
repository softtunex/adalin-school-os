import { randomUUID } from "node:crypto";

/*
 * Error reporting without an SDK: errors go to the server log and, when SENTRY_DSN is set, to
 * Sentry through its HTTP API. (Sentry's browser SDK would add about 50 KB to every page, which
 * the 3G budget can't afford.) Nothing personal is sent: no cookies, request bodies or form data.
 */

type Context = { platform?: "node" | "javascript"; url?: string; method?: string; digest?: string; route?: string; tags?: Record<string, string> };

function parseDsn(dsn: string) {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return { key: u.username, endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/` };
  } catch {
    return null;
  }
}

function frames(stack: string | undefined) {
  if (!stack) return undefined;
  // Sentry wants the oldest call first.
  return stack
    .split("\n")
    .slice(1, 40)
    .map((line) => {
      const m = line.trim().match(/^at (?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/);
      return m ? { function: m[1] || "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]), in_app: !m[2].includes("node_modules") } : { function: line.trim() };
    })
    .reverse();
}

/** Strips query strings, which can hold tokens (pay links, reset links). */
const safeUrl = (url?: string) => url?.split("?")[0];

export async function reportError(error: unknown, ctx: Context = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[error] ${ctx.method ?? ""} ${safeUrl(ctx.url) ?? ""} ${ctx.digest ? `digest=${ctx.digest} ` : ""}${err.name}: ${err.message}`);
  const dsn = process.env.SENTRY_DSN ? parseDsn(process.env.SENTRY_DSN) : null;
  if (!dsn) return;
  const eventId = randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: ctx.platform ?? "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tags: { ...ctx.tags, ...(ctx.route ? { route: ctx.route } : {}), ...(ctx.digest ? { digest: ctx.digest } : {}) },
    request: ctx.url ? { url: safeUrl(ctx.url), method: ctx.method } : undefined,
    exception: { values: [{ type: err.name, value: err.message.slice(0, 1000), stacktrace: frames(err.stack) ? { frames: frames(err.stack) } : undefined }] },
  };
  const body = [JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
  try {
    await fetch(`${dsn.endpoint}?sentry_key=${dsn.key}&sentry_version=7`, { method: "POST", headers: { "Content-Type": "application/x-sentry-envelope" }, body, signal: AbortSignal.timeout(3000) });
  } catch {
    // Reporting must never break the request it's reporting on.
  }
}

/** What a production deployment needs to run safely. Fatal problems stop it starting. */
export function productionEnvProblems(env: NodeJS.ProcessEnv = process.env) {
  const fatal: string[] = [];
  const warn: string[] = [];
  for (const key of ["DATABASE_URL", "APP_URL", "CRON_SECRET", "SESSION_SECRET"]) if (!env[key]) fatal.push(`${key} is not set.`);
  // Test switches show login codes on screen and fake payments: never on the live site.
  for (const key of ["ALLOW_TEST_LOGIN_CODES", "PAYMENTS_TEST_MODE", "ALLOW_LOCAL_DB"]) if (env[key]) fatal.push(`${key} must not be set on the live site.`);
  if (env.APP_URL && !env.APP_URL.startsWith("https://")) fatal.push("APP_URL must start with https://");
  for (const key of ["RESEND_API_KEY", "PAYSTACK_SECRET_KEY", "TERMII_API_KEY", "CLOUDINARY_CLOUD_NAME", "R2_BUCKET", "SENTRY_DSN"]) if (!env[key]) warn.push(`${key} is not set; that feature is off or local-only.`);
  return { fatal, warn };
}
