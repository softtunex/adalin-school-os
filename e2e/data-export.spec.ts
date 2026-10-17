import { expect, test } from "@playwright/test";

test("the proprietor downloads all the school's data and one student's data", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill("director@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });

  await page.goto("/s/adalin-college/settings?tab=data");
  const whole = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("link", { name: "Download everything" }).click();
  const zip = await whole;
  expect(zip.suggestedFilename()).toMatch(/^adalin-college-all-data-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(await zip.failure()).toBeNull();

  await page.goto("/s/adalin-college/students?q=Oluwaseun");
  await page.getByRole("link", { name: /Oluwaseun Lawal/ }).first().click();
  const one = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("link", { name: "Download their data" }).click();
  expect((await one).suggestedFilename()).toMatch(/^oluwaseun-lawal-data-/);

  await page.goto("/s/adalin-college/settings?tab=data");
  await expect(page.getByText("Downloaded the data held about Oluwaseun Lawal").first()).toBeVisible();
});
