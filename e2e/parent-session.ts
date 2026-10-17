import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";

// Kept in the test output folder, which Playwright empties at the start of every run.
const STATE = "test-results/parent-session.json";

/**
 * The demo parent, signed in at phone size. The first test to need them signs in with a code;
 * later tests reuse that session, so the run stays inside the login-code rate limit (three
 * codes per number every 15 minutes) instead of tripping it.
 */
export async function signInParent(browser: Browser, viewport = { width: 412, height: 860 }): Promise<Page> {
  if (existsSync(STATE)) {
    const page = await (await browser.newContext({ viewport, storageState: STATE })).newPage();
    await page.goto("/p");
    if (new URL(page.url()).pathname === "/p") return page;
    await page.context().close();
  }
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto("/parent");
  await page.getByLabel("Phone number or email").fill("parent8@example.com");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/p$/, { timeout: 60_000 });
  mkdirSync(dirname(STATE), { recursive: true });
  await page.context().storageState({ path: STATE });
  return page;
}
