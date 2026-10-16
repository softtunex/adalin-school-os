import { defineConfig, devices } from "@playwright/test";

// CI starts a production build on 3005 itself. On a laptop the tests get their own seeded server on 3105,
// so they never write into the demo school you're clicking around in.
const CI = !!process.env.CI;
const PORT = Number(process.env.E2E_PORT ?? (CI ? 3005 : 3105));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Tests run on a single-connection in-process database, so they run one at a time.
  workers: 1,
  retries: 0,
  // A cold local dev server compiles each page on first visit; CI tests a production build.
  timeout: CI ? 60_000 : 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: CI ? `pnpm next dev -p ${PORT}` : "npx tsx scripts/e2e-server.ts",
    env: { E2E_PORT: String(PORT) },
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: CI,
    timeout: 300_000,
  },
});
