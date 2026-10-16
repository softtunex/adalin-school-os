import { expect, test, type Browser } from "@playwright/test";

const SLUG = "greenfield-college";
const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function teacherPage(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill("obi4@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });
  return page;
}

test("a student sits a CBT exam and the teacher marks the theory", async ({ browser, isMobile }) => {
  test.skip(isMobile, "one run is enough; the exam room is phone-first either way");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);

  // The teacher pastes a question into the bank.
  const teacher = await teacherPage(browser);
  await teacher.goto(`/s/${SLUG}/cbt?tab=bank`);
  await teacher.getByRole("button", { name: "Paste questions" }).click();
  const paste = teacher.getByRole("dialog");
  await paste.getByLabel("Questions").fill(`1. E2E question ${run}: what is 6 x 7?\nA. 42 *\nB. 36\nC. 48`);
  await paste.getByRole("button", { name: "Add to the bank" }).click();
  await expect(paste.getByText("Added 1 question to the bank.")).toBeVisible({ timeout: 30_000 });

  // The student sits the open test, answering everything.
  const student = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await student.goto(`/student?school=${SLUG}`);
  await student.getByLabel("Admission number").fill("GFC/2026/0009");
  await student.getByLabel("Password").fill("Student2026");
  await student.getByRole("button", { name: "Sign in" }).click();
  await expect(student).toHaveURL(/\/learn$/, { timeout: 60_000 });
  await student.goto("/learn/exams");
  await student.getByRole("link", { name: /Second CA test/ }).click();
  await student.getByRole("button", { name: "Start the exam" }).click();
  await expect(student).toHaveURL(/\/exam\//, { timeout: 60_000 });
  await expect(student.getByRole("timer")).toHaveText(/\d:\d\d/, { timeout: 60_000 });
  const total = Number((await student.getByText(/Question 1 of \d+/).innerText()).match(/of (\d+)/)![1]);
  for (let i = 0; i < total; i++) {
    await expect(student.getByText(`Question ${i + 1} of ${total}`)).toBeVisible();
    if (await student.getByRole("radio").count()) await student.getByRole("radio").first().click();
    else await student.getByRole("textbox").fill("Find a common denominator first, then work it through step by step.");
    if (i < total - 1) await student.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(student.getByText(`${total}/${total} answered`)).toBeVisible();
  await student.getByRole("button", { name: "Submit", exact: true }).click();
  await student.getByRole("dialog").getByRole("button", { name: "Submit", exact: true }).click();
  await expect(student.getByText("Submitted. Well done!")).toBeVisible({ timeout: 60_000 });
  await expect(student.getByText("Objective score so far")).toBeVisible();

  // The teacher marks the theory answers; the student then sees the full score.
  await teacher.goto(`/s/${SLUG}/cbt`);
  await teacher.getByRole("link", { name: "Second CA test" }).click();
  await teacher.getByRole("row", { name: /Oluwaseun Lawal/ }).getByRole("link", { name: "Mark" }).click();
  await expect(teacher).toHaveURL(/\/cbt\/scripts\//, { timeout: 60_000 });
  const scriptUrl = teacher.url();
  for (const box of await teacher.getByLabel(/^Mark for question/).all()) await box.fill("3");
  await teacher.getByRole("button", { name: /^Save/ }).click();
  await expect(teacher).not.toHaveURL(scriptUrl, { timeout: 60_000 });

  await student.reload();
  await expect(student.getByText("Your score")).toBeVisible({ timeout: 30_000 });
});
