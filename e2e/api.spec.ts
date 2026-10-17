import { expect, test } from "@playwright/test";

test("an Enterprise school makes an API key, reads with it, adds a webhook and tests it", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill("director@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });

  // Greenfield is on Premium: the API is an Enterprise feature, so Adalin switches it on for this school.
  await page.goto("/s/greenfield-college/settings?tab=api");
  await expect(page.getByText(/Connect your website, accounting software/)).toBeVisible({ timeout: 30_000 });
  const setFeature = async (on: boolean) => {
    await page.goto("/admin/schools?q=greenfield");
    await page.getByRole("row").filter({ hasText: "greenfield-college" }).getByRole("link").first().click();
    await page.getByRole("button", { name: "Change features" }).click();
    const box = page.getByRole("dialog").getByRole("checkbox", { name: /API access/ });
    if ((await box.isChecked()) !== on) await box.click();
    await page.getByRole("dialog").getByRole("button", { name: "Save features" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
  };
  await setFeature(true);

  try {
    await page.goto("/s/greenfield-college/settings?tab=api");
    // Clear anything an earlier, interrupted run left behind.
    await expect(page.getByRole("button", { name: "New key" })).toBeVisible({ timeout: 30_000 });
    const leftoverHooks = page.getByRole("button", { name: "Remove" });
    while ((await leftoverHooks.count()) > 0) {
      const before = await leftoverHooks.count();
      await leftoverHooks.first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
      await expect(leftoverHooks).toHaveCount(before - 1, { timeout: 30_000 });
    }
    const leftoverKeys = page.getByRole("row").filter({ hasText: "E2E website" }).getByRole("button", { name: "Revoke" });
    while ((await leftoverKeys.count()) > 0) {
      const before = await leftoverKeys.count();
      await leftoverKeys.first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Revoke key" }).click();
      await expect(leftoverKeys).toHaveCount(before - 1, { timeout: 30_000 });
    }
    await page.getByRole("button", { name: "New key" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("E2E website");
    await dialog.getByRole("checkbox", { name: /Students and their parents/ }).check();
    await dialog.getByRole("button", { name: "Create key" }).click();
    const key = await dialog.getByLabel("API key").inputValue({ timeout: 30_000 });
    expect(key).toMatch(/^sosk_/);
    await dialog.getByRole("button", { name: "Done" }).click();

    const school = await page.request.get("/api/v1/school", { headers: { Authorization: `Bearer ${key}` } });
    expect(school.status()).toBe(200);
    expect((await school.json()).data.code).toBe("greenfield-college");
    const students = await (await page.request.get("/api/v1/students?per_page=2", { headers: { Authorization: `Bearer ${key}` } })).json();
    expect(students.data).toHaveLength(2);
    expect((await page.request.get("/api/v1/invoices", { headers: { Authorization: `Bearer ${key}` } })).status()).toBe(403);

    await page.getByRole("button", { name: "Add webhook" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Address").fill(`${new URL(page.url()).origin}/api/v1/school`);
    await dialog.getByRole("checkbox", { name: /A fee payment is recorded/ }).check();
    await dialog.getByRole("button", { name: "Add webhook" }).click();
    expect(await dialog.getByLabel("Signing secret").inputValue({ timeout: 30_000 })).toMatch(/^whsec_/);
    await dialog.getByRole("button", { name: "Done" }).click();

    // That address only takes GET, so the test reaches it and is turned away: the reason is shown.
    await page.getByRole("button", { name: "Send a test" }).click();
    await expect(page.getByText(/The test didn.t arrive: The address answered 405./)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("No webhooks yet")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("row").filter({ hasText: "E2E website" }).getByRole("button", { name: "Revoke" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Revoke key" }).click();
    await expect(page.getByRole("row").filter({ hasText: "E2E website" }).getByRole("button", { name: "Revoke" })).toHaveCount(0, { timeout: 30_000 });
    expect((await page.request.get("/api/v1/school", { headers: { Authorization: `Bearer ${key}` } })).status()).toBe(401);
  } finally {
    await setFeature(false);
  }
});
