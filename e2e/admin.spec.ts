import { expect, test } from "@playwright/test";

test("Adalin's team finds a school, bills it and cancels the bill; the proprietor opens and closes support access", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill("director@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });

  await page.goto("/admin/schools");
  await page.getByPlaceholder("Name, code, email or city…").fill("adalin");
  await page.getByRole("row").filter({ hasText: "adalin-college" }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "New bill" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("What it's for").fill("E2E onsite training");
  await dialog.getByLabel("Amount (₦)").fill("25000");
  await dialog.getByRole("button", { name: "Raise bill" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const row = page.getByRole("row").filter({ hasText: "E2E onsite training" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Cancel", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Why").fill("Raised by the e2e test");
  await dialog.getByRole("button", { name: "Cancel bill" }).click();
  await expect(row.getByText("Cancelled")).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/activity");
  await expect(page.getByText(/Cancelled ADL-\d{4}-\d{5} \(Raised by the e2e test\)/).first()).toBeVisible();

  await page.goto("/s/adalin-college/settings?tab=plan");
  await page.getByLabel("What do you need help with?").fill("E2E check");
  await page.getByRole("button", { name: "Let support in" }).click();
  await expect(page.getByText("Adalin support can sign in for the next 24 hours.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Adalin support can sign in to your school until/)).toBeVisible();
  await page.getByRole("button", { name: "Close it now" }).click();
  await expect(page.getByText("Support access is closed.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Let support in" })).toBeVisible();
});
