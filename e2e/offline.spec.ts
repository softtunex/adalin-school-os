import { expect, test } from "@playwright/test";

test("a teacher reopens a register with no connection, and other pages say they're offline", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill("adeyemi3@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });

  // The offline service worker only runs in production builds (CI tests one).
  const sw = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
    return Boolean(reg);
  });
  test.skip(!sw, "service worker only runs in production builds");

  await page.goto("/s/adalin-college/attendance");
  await page.getByRole("link", { name: /Take register|View or edit register/ }).first().click();
  await expect(page.getByRole("button", { name: /Save register/ })).toBeVisible({ timeout: 30_000 });
  const register = page.url();
  // Let the worker take control, then visit once more so the page is saved for offline use.
  await page.reload();
  await expect(page.getByRole("button", { name: /Save register/ })).toBeVisible();

  await context.setOffline(true);
  await page.goto(register);
  await expect(page.getByRole("button", { name: /Save register/ })).toBeVisible();
  await page.goto("/s/adalin-college/fees");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);

  // Signing out lands on the login page, which clears saved pages, so a shared phone keeps nothing.
  await context.clearCookies();
  await page.goto("/login");
  await expect.poll(async () => page.evaluate(async () => (await caches.keys()).includes("sos-pages")), { timeout: 10_000 }).toBe(false);
});
