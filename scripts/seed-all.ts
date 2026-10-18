/*
 * Seeds a complete Adalin College (every module) into the database the environment points at.
 * Used by the e2e server and the demo-video server. Run directly: PGLITE_DIR=... npx tsx scripts/seed-all.ts
 */
import { spawnSync } from "node:child_process";

export const SEEDS = ["seed", "seed-results", "seed-fees", "seed-comms", "seed-timetable", "seed-students", "seed-teaching", "seed-cbt", "seed-materials", "seed-admissions", "seed-analytics", "seed-hr", "seed-payroll", "seed-discipline", "seed-library", "seed-inventory", "seed-health", "seed-transport", "seed-hostel", "seed-documents"];

export function seedAll(env: NodeJS.ProcessEnv, extra: string[] = []) {
  for (const script of [...SEEDS, ...extra]) {
    const r = spawnSync("npx", ["tsx", `scripts/${script}.ts`], { env, stdio: "inherit", shell: true });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-all.ts")) seedAll(process.env);
