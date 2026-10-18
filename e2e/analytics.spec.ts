import { expect, test, type Browser } from "@playwright/test";

const SLUG = "adalin-college";

async function signIn(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });
  return page;
}

test("the proprietor sees school analytics; a teacher can't", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 180_000 : 420_000);

  const director = await signIn(browser, "director@demo.adalinschoolhub.ng");
  await director.goto(`/s/${SLUG}/analytics`);
  await expect(director.getByRole("heading", { name: "Results over time" })).toBeVisible({ timeout: 60_000 });
  await expect(director.getByRole("img", { name: "Average score and pass rate by term" })).toBeVisible();
  await director.goto(`/s/${SLUG}/analytics?tab=academics`);
  await expect(director.getByRole("heading", { name: "Subjects, weakest first" })).toBeVisible({ timeout: 60_000 });
  await director.goto(`/s/${SLUG}/analytics?tab=students`);
  await expect(director.getByRole("heading", { name: "Students who need attention" })).toBeVisible({ timeout: 60_000 });
  await director.goto(`/s/${SLUG}/analytics?tab=teachers`);
  await expect(director.getByRole("cell", { name: "Mr Emeka Obi" })).toBeVisible({ timeout: 60_000 });

  const teacher = await signIn(browser, "obi4@demo.adalinschoolhub.ng");
  await expect(teacher.getByRole("link", { name: "Analytics" })).toHaveCount(0);
  const res = await teacher.goto(`/s/${SLUG}/analytics`);
  expect(res?.status()).toBe(404);
});
