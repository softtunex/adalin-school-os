import { expect, test } from "@playwright/test";

const SLUG = "adalin-college";
const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("a teacher shares a note and the student reads it", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey; the student side runs at phone size");
  test.setTimeout(process.env.CI ? 180_000 : 420_000);
  const title = `Decimals recap ${run}`;

  const teacher = await (await browser.newContext()).newPage();
  await teacher.goto("/login");
  await teacher.getByLabel("Email").fill("obi4@demo.adalinschoolhub.ng");
  await teacher.getByLabel("Password").fill("Demo2026!");
  await teacher.getByRole("button", { name: "Log in" }).click();
  await expect(teacher).toHaveURL(/\/s\//, { timeout: 60_000 });
  await teacher.goto(`/s/${SLUG}/materials`);
  await teacher.getByRole("button", { name: "Share material" }).click();
  const form = teacher.getByRole("dialog");
  await form.getByRole("radio", { name: /Note/ }).click();
  await form.getByLabel("Class and subject").selectOption({ label: "JSS 1 · Mathematics" });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Note").fill("0.5 = 1/2 and 0.25 = 1/4.");
  await form.getByRole("button", { name: "Share with students" }).click();
  await expect(teacher.getByText(title, { exact: true })).toBeVisible({ timeout: 30_000 });

  const student = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await student.goto(`/student?school=${SLUG}`);
  await student.getByLabel("Admission number").fill("ADC/2026/0009");
  await student.getByLabel("Password").fill("Student2026");
  await student.getByRole("button", { name: "Sign in" }).click();
  await expect(student).toHaveURL(/\/learn$/, { timeout: 60_000 });
  await student.getByRole("button", { name: "More", exact: true }).click();
  await student.getByRole("navigation", { name: "App tabs" }).getByRole("link", { name: "Materials" }).click();
  await student.getByRole("link", { name: new RegExp(title) }).click();
  await expect(student.getByText("0.5 = 1/2 and 0.25 = 1/4.")).toBeVisible({ timeout: 30_000 });
});
