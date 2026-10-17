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

/** Next month: the demo already has this month drafted and last month paid. */
function nextMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}

test("the bursar prepares payroll, the proprietor approves, staff get payslips", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const month = nextMonth();

  const bursar = await signIn(browser, "musa2@demo.schoolos.ng");
  await bursar.goto(`/s/${SLUG}/payroll`);
  await bursar.locator("input[name=month]").fill(month);
  await bursar.getByRole("button", { name: "Prepare payroll" }).click();
  await expect(bursar).toHaveURL(/\/payroll\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const runUrl = bursar.url();
  await expect(bursar.getByText("Waiting for the proprietor to approve")).toBeVisible();

  const owner = await signIn(browser, "director@demo.schoolos.ng");
  await owner.goto(runUrl);
  await owner.getByRole("button", { name: "Approve" }).click();
  await owner.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(owner.getByText("Approved.", { exact: true })).toBeVisible({ timeout: 30_000 });

  await bursar.reload();
  await bursar.getByRole("button", { name: "Mark as paid" }).click();
  await bursar.getByRole("dialog").getByRole("button", { name: "Mark as paid" }).click();
  await expect(bursar.getByText(/Marked as paid/)).toBeVisible({ timeout: 30_000 });
  const bank = await bursar.request.get(`${runUrl}/export?kind=bank`);
  expect(await bank.text()).toContain("Account number");

  const teacher = await signIn(browser, "obi4@demo.schoolos.ng");
  await teacher.goto(`/s/${SLUG}/hr?tab=pay`);
  const link = teacher.getByRole("link", { name: "Payslip", exact: true }).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  const pdf = await teacher.request.get((await link.getAttribute("href"))!);
  expect(pdf.status(), (await pdf.text()).slice(0, 300)).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});
