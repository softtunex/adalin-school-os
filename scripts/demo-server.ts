/*
 * A clean copy of the app for recording the demo video: its own freshly seeded database (no test
 * leftovers, separate from the demo school you click around in), served from a production build so
 * there's no dev overlay. Payments and parent sign-in codes run in test mode; never use this live.
 * It runs on a demo clock set to a school-day morning (DEMO_NOW to choose), so any day works.
 *
 *   npx tsx scripts/demo-server.ts           reseed, build if needed, serve on :3305
 *   npx tsx scripts/demo-server.ts --keep    serve the existing database as it is
 *   npx tsx scripts/demo-server.ts --build   rebuild the app first
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { seedAll } from "./seed-all";

const port = process.env.DEMO_PORT ?? "3305";

/** 08:30 in Lagos on the next school day (today if it's a weekday), unless DEMO_NOW says otherwise. */
function schoolMorning() {
  const day = new Date(Date.now() + 3_600_000); // Lagos is UTC+1 all year
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  return `${day.toISOString().slice(0, 10)}T08:30:00+01:00`;
}
const dataDir = path.join(process.cwd(), ".data", "demo-video-pglite");
const keep = process.argv.includes("--keep") && existsSync(dataDir);

// One fixed shift for every process (seeds, server) and the recorder, which reads it from this file.
// Kept with --keep, so the clock carries on from the data already there.
const clockFile = path.join(process.cwd(), ".data", "demo-video", "clock.json");
const saved = keep && existsSync(clockFile) ? (JSON.parse(readFileSync(clockFile, "utf8")) as { offsetMs: number }) : null;
const offsetMs = saved?.offsetMs ?? Date.parse(process.env.DEMO_NOW ?? schoolMorning()) - Date.now();
mkdirSync(path.dirname(clockFile), { recursive: true });
writeFileSync(clockFile, JSON.stringify({ offsetMs }));
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
  // Placeholder sign-in apps so the Google and Microsoft options show as they will once the real
  // credentials are added (checklist item 15). The recording never signs in through them.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "demo-google-client",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "demo-google-secret",
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID ?? "demo-microsoft-client",
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET ?? "demo-microsoft-secret",
  // Every process (seeds, build, server) runs on the demo clock, so the data and the app agree.
  DEMO_CLOCK_OFFSET_MS: String(offsetMs),
  // Forward slashes: NODE_OPTIONS parsing drops Windows backslashes.
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require "${path.join(process.cwd(), "scripts", "demo-video", "clock.cjs").replace(/\\/g, "/")}"`.trim(),
};
console.log(`Demo clock: ${new Date(Date.now() + offsetMs).toISOString()}`);

if (!keep) {
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
