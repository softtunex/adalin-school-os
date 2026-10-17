import { expect, test } from "@playwright/test";

test("a proprietor groups campuses and compares them on the group dashboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill("director@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });

  await page.goto("/s/adalin-college/settings?tab=campuses");
  await expect(page.getByText(/Run several campuses as one group/)).toBeVisible({ timeout: 30_000 });

  // Multi-campus is an Enterprise feature: Adalin switches it on for this school for the test.
  const setFeature = async (on: boolean) => {
    await page.goto("/admin/schools?q=adalin");
    await page.getByRole("row").filter({ hasText: "adalin-college" }).getByRole("link").first().click();
    await page.getByRole("button", { name: "Change features" }).click();
    const box = page.getByRole("dialog").getByRole("checkbox", { name: /Multi-campus/ });
    if ((await box.isChecked()) !== on) await box.click();
    await page.getByRole("dialog").getByRole("button", { name: "Save features" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
  };
  await setFeature(true);
  try {
    await page.goto("/s/adalin-college/settings?tab=campuses");
    // An earlier interrupted run may have left the group: close it first.
    if (await page.getByRole("link", { name: "Open the group dashboard" }).isVisible()) {
      await page.getByRole("button", { name: "Remove" }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Take it out" }).click();
      await expect(page.getByLabel("Group name")).toBeVisible({ timeout: 30_000 });
    }
    await page.getByLabel("Group name").fill("E2E Schools");
    await page.getByRole("button", { name: "Start the group" }).click();
    await page.getByRole("link", { name: "Open the group dashboard" }).click({ timeout: 30_000 });

    await expect(page.getByRole("heading", { name: /E2E Schools/ })).toBeVisible({ timeout: 30_000 });
    const row = page.getByRole("row").filter({ hasText: /First Term|No current term/ }).first();
    await expect(row).toBeVisible();
    await expect(page.getByText(/Active, across every campus/)).toBeVisible();
    const csv = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export" }).click();
    expect((await csv).suggestedFilename()).toMatch(/^E2E_Schools-campuses-/);

    await page.goto("/schools?pick=1");
    await expect(page.getByRole("link", { name: /E2E Schools/ })).toBeVisible();

    await page.goto("/s/adalin-college/settings?tab=campuses");
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("dialog").getByText(/the group closes/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Take it out" }).click();
    await expect(page.getByLabel("Group name")).toBeVisible({ timeout: 30_000 });
  } finally {
    await setFeature(false);
  }
});
