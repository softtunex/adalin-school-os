/*
 * Starts a throwaway copy of the app for browser tests on a laptop: its own database,
 * freshly seeded, on its own port and build folder. Tests never touch the demo school
 * you click around in. (CI tests a production build against its own fresh database.)
 */
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const port = process.env.E2E_PORT ?? "3105";
const dataDir = path.join(process.cwd(), ".data", "e2e-pglite");
const env = { ...process.env, PGLITE_DIR: dataDir, FILES_DIR: ".data/e2e-files", NEXT_DIST_DIR: ".next-e2e" };

rmSync(dataDir, { recursive: true, force: true });
for (const script of ["seed", "seed-results", "seed-fees", "seed-comms", "seed-timetable", "seed-students", "seed-teaching", "seed-cbt", "seed-materials", "seed-admissions", "seed-analytics", "seed-hr", "seed-payroll", "seed-discipline", "seed-library"]) {
  const r = spawnSync("npx", ["tsx", `scripts/${script}.ts`], { env, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const server = spawn("npx", ["next", "dev", "-p", port], { env, stdio: "inherit", shell: true });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
