import { expect, test } from "@playwright/test";

const SLUG = "greenfield-college";
const run = `${Date.now()}`.slice(-6);

test("a class teacher records a merit and the parent sees it", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey; the parent side runs at phone size");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const note = `Helped tidy the lab after practicals ${run}`;

  const teacher = await (await browser.newContext()).newPage();
  await teacher.goto("/login");
  await teacher.getByLabel("Email").fill("adeyemi3@demo.schoolos.ng");
  await teacher.getByLabel("Password").fill("Demo2026!");
  await teacher.getByRole("button", { name: "Log in" }).click();
  await expect(teacher).toHaveURL(/\/s\//, { timeout: 60_000 });
  await teacher.goto(`/s/${SLUG}/discipline`);
  await teacher.getByRole("button", { name: "Record" }).click();
  const form = teacher.getByRole("dialog");
  await form.getByLabel("Student").fill("Oluwaseun");
  await form.getByRole("option", { name: /Oluwaseun Lawal/ }).click();
  await form.getByLabel("Category").selectOption("Helpfulness");
  await form.getByLabel(/What did they do/).fill(note);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText(/Recorded\./)).toBeVisible({ timeout: 30_000 });
  await form.getByRole("button", { name: "Done" }).click();
  await expect(teacher.getByText(note)).toBeVisible();

  const parent = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await parent.goto("/parent");
  await parent.getByLabel("Phone number or email").fill("parent8@example.com");
  await parent.getByRole("button", { name: "Send me a code" }).click();
  await expect(parent.getByLabel("6-digit code")).toBeVisible({ timeout: 30_000 });
  await parent.getByLabel("6-digit code").fill("123456");
  await parent.getByRole("button", { name: "Continue" }).click();
  await expect(parent).toHaveURL(/\/p$/, { timeout: 60_000 });
  const child = parent.locator("main a[href^='/p/children/']").filter({ hasText: "Oluwaseun" }).first();
  const href = await child.getAttribute("href");
  await parent.goto(`${href}?tab=conduct`);
  await expect(parent.getByText(note)).toBeVisible({ timeout: 30_000 });
});
