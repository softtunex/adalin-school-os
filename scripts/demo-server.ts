/*
 * A clean copy of the app for recording the demo video: its own freshly seeded database (no test
 * leftovers, separate from the demo school you click around in), served from a production build so
 * there's no dev overlay. Payments and parent sign-in codes run in test mode; never use this live.
 *
 *   npx tsx scripts/demo-server.ts           reseed, build if needed, serve on :3305
 *   npx tsx scripts/demo-server.ts --keep    serve the existing database as it is
 *   npx tsx scripts/demo-server.ts --build   rebuild the app first
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { seedAll } from "./seed-all";

const port = process.env.DEMO_PORT ?? "3305";
const dataDir = path.join(process.cwd(), ".data", "demo-video-pglite");
const filesDir = path.join(process.cwd(), ".data", "demo-video-files");
const distDir = ".next-demo";
const env = {
  ...process.env,
  PGLITE_DIR: dataDir,
  FILES_DIR: filesDir,
  NEXT_DIST_DIR: distDir,
  ALLOW_LOCAL_DB: "1",
  PAYMENTS_TEST_MODE: "1",
  ALLOW_TEST_LOGIN_CODES: "1",
  APP_URL: `http://localhost:${port}`,
};

if (!process.argv.includes("--keep") || !existsSync(dataDir)) {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(filesDir, { recursive: true, force: true });
  seedAll(env, ["seed-enterprise"]);
}
if (process.argv.includes("--build") || !existsSync(path.join(distDir, "BUILD_ID"))) {
  rmSync(distDir, { recursive: true, force: true });
  const r = spawnSync("npx", ["next", "build"], { env, stdio: "inherit", shell: true });
  // The build adds its folder to tsconfig's includes; put the file back.
  spawnSync("git", ["checkout", "tsconfig.json"], { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const server = spawn("npx", ["next", "start", "-p", port], { env, stdio: "inherit", shell: true });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
