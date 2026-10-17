import { expect, test } from "@playwright/test";
import { signInParent } from "./parent-session";

test("the warden approves a parent's exeat request and the parent sees it", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey; the parent side runs at phone size");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);

  const warden = await (await browser.newContext()).newPage();
  await warden.goto("/login");
  await warden.getByLabel("Email").fill("warden10@demo.schoolos.ng");
  await warden.getByLabel("Password").fill("Demo2026!");
  await warden.getByRole("button", { name: "Log in" }).click();
  await expect(warden).toHaveURL(/\/s\//, { timeout: 60_000 });
  await warden.goto("/s/greenfield-college/hostel?tab=exeats&view=pending");
  const row = warden.getByRole("row").filter({ hasText: "Folake Lawal" });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(warden.getByRole("row").filter({ hasText: "Folake Lawal" })).toHaveCount(0, { timeout: 30_000 });
  await warden.goto("/s/greenfield-college/hostel?tab=exeats&view=upcoming");
  await expect(warden.getByRole("row").filter({ hasText: "Folake Lawal" }).getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 30_000 });

  const parent = await signInParent(browser);
  const child = parent.locator("main a[href^='/p/children/']").filter({ hasText: "Folake" }).first();
  const href = await child.getAttribute("href");
  await parent.goto(`${href}?tab=hostel`);
  await expect(parent.getByText("Queen Amina House")).toBeVisible({ timeout: 30_000 });
  await expect(parent.getByText("Approved", { exact: true })).toBeVisible();
});
