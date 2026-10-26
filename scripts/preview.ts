/*
 * Runs a built copy of the app on the local demo database, the way the live site runs: every page
 * is compiled up front, so nothing waits on the dev compiler. No hot reload; run it again after changes.
 * Stop `pnpm dev` first: the local database opens in one process at a time.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const port = process.env.PREVIEW_PORT ?? "3005";

// A production build also reads .env.production.local, which holds the live keys. Blank them (a variable
// already set, even to "", wins over the file) so the preview never emails, texts or charges anyone for real.
// Only the AI key stays, from .env.local.
const KEEP = new Set(["GROQ_API_KEY"]);
const live = existsSync(".env.production.local")
  ? [...readFileSync(".env.production.local", "utf8").matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]).filter((k) => !KEEP.has(k))
  : [];
// The demo parent code (123456) and the built-in test checkout work here as they do under pnpm dev.
// This only ever runs on a laptop; the live site refuses to start with either switch set.
const testSwitches = { ALLOW_TEST_LOGIN_CODES: "1", PAYMENTS_TEST_MODE: "1" };
const env = { ...process.env, ...Object.fromEntries(live.map((k) => [k, ""])), ...testSwitches, NODE_ENV: "production" as const, ALLOW_LOCAL_DB: "1", NEXT_DIST_DIR: ".next-preview" };

execSync("npx tsx scripts/migrate.ts", { env, stdio: "inherit" });
// pnpm preview --no-build restarts the last build (after a reboot, or to reset the server).
if (!process.argv.includes("--no-build")) execSync("npx next build", { env, stdio: "inherit" });
const server = spawn("npx", ["next", "start", "-p", port], { env, stdio: "inherit", shell: true });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
