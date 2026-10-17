import { expect, test, type Browser } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const SLUG = "adalin-college";

async function staffPage(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });
  return page;
}

test("a teacher sets homework, a student hands it in with a file, and the teacher marks it", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey; the student side is checked at phone size below");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const dir = mkdtempSync(path.join(tmpdir(), "sos-e2e-"));
  const worksheet = path.join(dir, "worksheet.pdf");
  const answer = path.join(dir, "my-answer.pdf");
  writeFileSync(worksheet, "%PDF-1.4\n% worksheet\n");
  writeFileSync(answer, "%PDF-1.4\n% answer\n");
  const title = `Long division ${run}`;

  // The JSS 1 Gold Maths teacher sets work with a worksheet.
  const teacher = await staffPage(browser, "obi4@demo.schoolos.ng");
  await teacher.goto(`/s/${SLUG}/assignments`);
  await teacher.getByRole("button", { name: "New assignment" }).click();
  const form = teacher.getByRole("dialog");
  await form.getByLabel("Class").selectOption({ label: "JSS 1 Gold" });
  await form.getByLabel("Subject").selectOption({ label: "Mathematics" });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Instructions").fill("Questions 1 to 5.");
  await form.getByLabel("Marked out of (optional)").fill("10");
  await form.locator("input[type=file]").setInputFiles(worksheet);
  await expect(form.getByText("worksheet.pdf")).toBeVisible();
  await expect(form.getByRole("button", { name: "Set assignment" })).toBeEnabled({ timeout: 30_000 });
  await form.getByRole("button", { name: "Set assignment" }).click();
  await expect(teacher).toHaveURL(/\/assignments\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(teacher.getByRole("link", { name: /worksheet\.pdf/ })).toBeVisible();
  const assignmentUrl = teacher.url();

  // The student hands in with a file.
  const student = await (await browser.newContext()).newPage();
  await student.goto(`/student?school=${SLUG}`);
  await student.getByLabel("Admission number").fill("ADC/2026/0009");
  await student.getByLabel("Password").fill("Student2026");
  await student.getByRole("button", { name: "Sign in" }).click();
  await expect(student).toHaveURL(/\/learn$/, { timeout: 60_000 });
  await student.goto("/learn/assignments");
  await student.getByRole("link", { name: new RegExp(title) }).click();
  await expect(student.getByRole("link", { name: /worksheet\.pdf/ })).toBeVisible();
  await student.getByLabel("Answer").fill("1. 12  2. 7  3. 25");
  await student.locator("input[type=file]").setInputFiles(answer);
  await expect(student.getByText("my-answer.pdf")).toBeVisible();
  await expect(student.getByRole("button", { name: "Hand in" })).toBeEnabled({ timeout: 30_000 });
  await student.getByRole("button", { name: "Hand in" }).click();
  await expect(student.getByText("Handed in. Your teacher can see it now.")).toBeVisible({ timeout: 30_000 });

  // The teacher sees the work and marks it; the student sees the mark.
  await teacher.goto(assignmentUrl);
  await teacher.getByRole("button", { name: /^To mark/ }).click();
  await expect(teacher.getByText("Oluwaseun Lawal", { exact: true })).toBeVisible();
  await teacher.getByRole("button", { name: "View work" }).click();
  await expect(teacher.getByRole("link", { name: /my-answer\.pdf/ })).toBeVisible();
  // Read the link now: once marked, the student leaves the "To mark" list.
  const fileHref = await teacher.getByRole("link", { name: /my-answer\.pdf/ }).getAttribute("href");
  await teacher.getByLabel("Mark for Oluwaseun Lawal").fill("8");
  await teacher.getByLabel("Feedback for Oluwaseun Lawal").fill("Good. Check question 3.");
  await teacher.getByRole("button", { name: "Save marks" }).click();
  await expect(teacher.getByText("Saved 1 mark.")).toBeVisible({ timeout: 30_000 });

  await student.reload();
  await expect(student.getByText("Your mark")).toBeVisible();
  await expect(student.getByText("Good. Check question 3.")).toBeVisible();

  // School leadership can open the work; a signed-out visitor is sent to log in.
  const outsider = await staffPage(browser, "director@demo.schoolos.ng");
  expect((await outsider.request.get(fileHref!)).status()).toBe(200); // principal-level staff can open it
  const other = await (await browser.newContext()).newPage();
  expect((await other.request.get(fileHref!, { maxRedirects: 0 })).status()).toBe(303); // signed out: back to login
});

test("the principal approves a lesson note from the queue", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const director = await staffPage(browser, "director@demo.schoolos.ng");
  await director.goto(`/s/${SLUG}/lesson-notes`);
  await expect(director.getByRole("heading", { name: "Waiting for you" })).toBeVisible();
  const first = director.locator("main tbody a").first();
  test.skip((await first.count()) === 0, "queue already emptied by an earlier run");
  await first.click();
  await director.getByRole("button", { name: "Approve" }).click();
  await expect(director).toHaveURL(new RegExp(`/s/${SLUG}/lesson-notes$`), { timeout: 30_000 });
});
