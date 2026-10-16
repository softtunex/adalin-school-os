import { expect, test, type Browser } from "@playwright/test";

const SLUG = "greenfield-college";

async function signIn(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });
  return page;
}

/** A Monday a few weeks out, so the dates are always in the future and on workdays. */
function futureWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21 + ((8 - d.getUTCDay()) % 7));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() + 1);
  return { start: iso(d), end: iso(end) };
}

test("a teacher asks for leave and the proprietor approves it", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 180_000 : 420_000);
  const { start, end } = futureWeek();

  const teacher = await signIn(browser, "bello5@demo.schoolos.ng");
  await teacher.goto(`/s/${SLUG}/hr`);
  await teacher.getByRole("button", { name: "Request leave" }).click();
  const form = teacher.getByRole("dialog");
  await form.getByLabel("Type of leave").selectOption("study");
  await form.getByLabel("First day").fill(start);
  await form.getByLabel("Last day").fill(end);
  await form.getByLabel("Reason").fill("Postgraduate diploma exams");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByText(/Sent: 2 working days/)).toBeVisible({ timeout: 30_000 });

  const director = await signIn(browser, "director@demo.schoolos.ng");
  await director.goto(`/s/${SLUG}/hr?tab=leave`);
  const row = director.getByRole("row", { name: /Postgraduate diploma exams/ });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  await teacher.reload();
  await expect(teacher.getByRole("row", { name: /Study leave/ }).getByText("Approved")).toBeVisible({ timeout: 30_000 });
});
