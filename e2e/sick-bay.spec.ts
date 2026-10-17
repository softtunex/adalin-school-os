import { expect, test } from "@playwright/test";

const run = `${Date.now()}`.slice(-6);

test("the nurse records a visit, is warned about an allergy, and the parent sees it", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey; the parent side runs at phone size");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const complaint = `Headache in maths ${run}`;

  const nurse = await (await browser.newContext()).newPage();
  await nurse.goto("/login");
  await nurse.getByLabel("Email").fill("nurse8@demo.schoolos.ng");
  await nurse.getByLabel("Password").fill("Demo2026!");
  await nurse.getByRole("button", { name: "Log in" }).click();
  await expect(nurse).toHaveURL(/\/s\//, { timeout: 60_000 });
  await nurse.goto("/s/greenfield-college/sick-bay");
  await nurse.getByRole("button", { name: "New visit" }).click();
  const form = nurse.getByRole("dialog");
  await form.getByLabel("Student").fill("Oluwaseun La");
  await form.getByRole("option", { name: /Oluwaseun Lawal/ }).click();
  await expect(form.getByText("Groundnuts", { exact: true })).toBeVisible();
  await form.getByLabel("What's wrong?").fill(complaint);
  await form.getByLabel("Temperature (°C)").fill("37.4");
  await form.getByLabel("Medicine").fill("Groundnut oil rub");
  await form.getByLabel("Dose").fill("a little");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(form.getByText(/Allergic to Groundnuts\./)).toBeVisible();
  await form.getByRole("button", { name: "Remove Groundnut oil rub" }).click();
  await form.getByLabel("Medicine").fill("Paracetamol");
  await form.getByLabel("Dose").fill("500mg");
  await form.getByRole("button", { name: "Add" }).click();
  await form.getByLabel("How they left").selectOption("rested");
  await form.getByRole("button", { name: "Save visit" }).click();
  await expect(form).toBeHidden({ timeout: 30_000 });
  await expect(nurse.getByText(complaint)).toBeVisible({ timeout: 30_000 });

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
  await parent.goto(`${href}?tab=health`);
  await expect(parent.getByText(complaint)).toBeVisible({ timeout: 30_000 });
  await expect(parent.getByText("Given: Paracetamol 500mg").first()).toBeVisible();
});
