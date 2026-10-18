/**
 * Measures the core flows on a throttled 3G connection against a running production build:
 * how much JavaScript each page downloads (compressed) and how long until it's usable.
 *
 *   BASE_URL=http://localhost:3205 npx tsx scripts/perf-3g.ts
 *
 * Budgets (Phase 8): under 175 KB of JavaScript per core page (about 140 KB of it is React and
 * Next.js); usable within 10 seconds on Fast 3G and 20 on Slow 3G (PROFILE=slow).
 */
import { chromium, type CDPSession, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3005";
const SLUG = process.env.SCHOOL ?? "adalin-college";
// React and Next.js alone ship about 140 KB (compressed) to every page; our own code stays under 35 KB on top.
const JS_BUDGET_KB = 175;
// Chrome DevTools' "Fast 3G" profile: what most Nigerian phones see on a decent day.
const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
// "Slow 3G": a bad day, or a crowded mast. Run with PROFILE=slow.
const SLOW_3G = { offline: false, latency: 2000, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8 };
const SLOW = process.env.PROFILE === "slow";
const THREE_G = SLOW ? SLOW_3G : FAST_3G;
const TIME_BUDGET_S = SLOW ? 20 : 10;

type Result = { page: string; jsKB: number; totalKB: number; seconds: number };

async function measure(page: Page, cdp: CDPSession, name: string, path: string, ready: (p: Page) => Promise<unknown>): Promise<Result> {
  // Bytes on the wire (compressed), from Chrome's own network events.
  const types = new Map<string, string>();
  let js = 0;
  let total = 0;
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    total += e.encodedDataLength;
    if (types.get(e.requestId) === "Script") js += e.encodedDataLength;
  });
  const start = Date.now();
  // Usable = the page's scripts have downloaded and run (it responds to taps), and its main control is there.
  await page.goto(BASE + path, { waitUntil: "load", timeout: 120_000 });
  await ready(page);
  const seconds = (Date.now() - start) / 1000;
  await page.waitForLoadState("networkidle").catch(() => {});
  return { page: name, jsKB: Math.round(js / 1024), totalKB: Math.round(total / 1024), seconds: Math.round(seconds * 10) / 10 };
}

async function main() {
  const browser = await chromium.launch();
  // A fresh context per flow: nothing cached, as on a first visit.
  const results: Result[] = [];
  const run = async (name: string, path: string, ready: (p: Page) => Promise<unknown>, signIn?: (p: Page) => Promise<void>) => {
    const device = { viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (Linux; Android 13) Mobile" };
    // Sign in in one browser, then measure in a fresh one that has only the session cookie: nothing cached.
    let storageState: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>> | undefined;
    if (signIn) {
      const login = await browser.newContext(device);
      await signIn(await login.newPage());
      storageState = await login.storageState();
      await login.close();
    }
    const ctx = await browser.newContext({ ...device, storageState });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", THREE_G);
    results.push(await measure(page, cdp, name, path, ready));
    await ctx.close();
  };
  const staff = (email: string) => async (page: Page) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Demo2026!");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/s\//, { timeout: 60_000 });
  };

  await run("Login", "/login", (p) => p.getByRole("button", { name: "Log in" }).waitFor());
  await run("Teacher dashboard", `/s/${SLUG}`, (p) => p.getByRole("heading", { level: 1 }).waitFor(), staff("adeyemi3@demo.adalinschoolhub.ng"));
  await run("Attendance list", `/s/${SLUG}/attendance`, (p) => p.getByRole("link", { name: /Take (a )?register|View or edit register/ }).first().waitFor(), staff("adeyemi3@demo.adalinschoolhub.ng"));
  await run("Results", `/s/${SLUG}/results`, (p) => p.getByRole("heading", { level: 1 }).waitFor(), staff("obi4@demo.adalinschoolhub.ng"));
  await run("Fees (bursar)", `/s/${SLUG}/fees`, (p) => p.getByRole("heading", { level: 1 }).waitFor(), staff("musa2@demo.adalinschoolhub.ng"));
  await run("Parent sign-in", "/parent", (p) => p.getByRole("button").first().waitFor());
  await browser.close();

  console.log(`\n3G (${SLOW ? "Slow" : "Fast"} 3G profile), first visit, nothing cached. Budgets: ${JS_BUDGET_KB} KB JS, ${TIME_BUDGET_S}s.\n`);
  console.log("Page".padEnd(22) + "JS (KB)".padStart(9) + "All (KB)".padStart(10) + "Usable (s)".padStart(12));
  let over = 0;
  for (const r of results) {
    const flag = r.jsKB > JS_BUDGET_KB || r.seconds > TIME_BUDGET_S ? "  ← over budget" : "";
    if (flag) over++;
    console.log(r.page.padEnd(22) + String(r.jsKB).padStart(9) + String(r.totalKB).padStart(10) + String(r.seconds).padStart(12) + flag);
  }
  process.exitCode = over ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
