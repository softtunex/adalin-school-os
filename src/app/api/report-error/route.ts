import { reportError } from "@/lib/monitoring";

/*
 * Errors from people's browsers (the error screens send them here). Small, rate-limited and
 * stripped of anything personal, so it can't be used to flood the log or the error tracker.
 */
const PER_MINUTE = 10;
const recent = new Map<string, { start: number; n: number }>();

function allowed(ip: string) {
  const now = Date.now();
  const w = recent.get(ip);
  if (!w || now - w.start > 60_000) {
    if (recent.size > 5000) recent.clear();
    recent.set(ip, { start: now, n: 1 });
    return true;
  }
  return ++w.n <= PER_MINUTE;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowed(ip)) return new Response(null, { status: 204 });
  const raw = await request.text();
  if (raw.length > 8_000) return new Response(null, { status: 204 });
  let body: { message?: unknown; stack?: unknown; digest?: unknown; url?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 204 });
  }
  const error = new Error(String(body.message ?? "Unknown browser error").slice(0, 500));
  error.name = "BrowserError";
  if (typeof body.stack === "string") error.stack = body.stack.slice(0, 4000);
  await reportError(error, { platform: "javascript", url: typeof body.url === "string" ? body.url.slice(0, 300) : undefined, digest: typeof body.digest === "string" ? body.digest.slice(0, 40) : undefined });
  return new Response(null, { status: 204 });
}
