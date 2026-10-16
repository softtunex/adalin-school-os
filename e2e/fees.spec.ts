import { expect, test, type Page } from "@playwright/test";

// Runs against the demo school (pnpm db:seed && pnpm db:seed-fees), which is on the Premium plan.
const DEMO = { email: "director@demo.schoolos.ng", password: "Demo2026!", slug: "greenfield-college" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 45_000 });
}

test("a new school on Free sees fees as an upgrade, not an error", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.goto("/signup");
  await page.getByLabel("School name").fill(`Little Steps ${run}`);
  await page.getByLabel("Your full name").fill("Mrs Kemi Ade");
  await page.getByLabel("Email").fill(`kemi${run}@e2e.test`);
  await page.getByLabel("Password").fill("LittleSteps1");
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page).toHaveURL(/welcome=1/, { timeout: 45_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`/s/${slug}/fees`);
  await expect(page.getByText(/is on the Basic plan/)).toBeVisible();
  await expect(page.getByRole("link", { name: "See plans" })).toBeVisible();
});

test("the bursar's day: dashboard, an invoice, a payment, a receipt, the parent pay link, an expense", async ({ page, isMobile, context }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(240_000);
  await login(page);
  const base = `/s/${DEMO.slug}`;

  await page.goto(`${base}/fees`);
  await expect(page.getByText("Expected this term")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Collections, last 30 days" })).toBeVisible();

  // Open an invoice that still owes and record a part payment.
  await page.goto(`${base}/fees/invoices?status=owing`);
  await page.locator("table a[href*='/fees/invoices/']").first().click();
  await expect(page).toHaveURL(/\/fees\/invoices\/[0-9a-f-]{36}/, { timeout: 45_000 });
  const before = (await page.locator("text=Still owing").locator("..").locator("p").nth(1).textContent())!;
  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (₦)").fill("1,000");
  await dialog.getByLabel("How they paid").selectOption("cash");
  await page.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/₦1,000 recorded\. Receipt RCT-/)).toBeVisible({ timeout: 30_000 });
  const receipt = await page.getByRole("link", { name: "Download receipt" }).getAttribute("href");
  const pdf = await page.request.get(receipt!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  const after = (await page.locator("text=Still owing").locator("..").locator("p").nth(1).textContent())!;
  const naira = (s: string) => Number(s.replace(/[^\d.]/g, ""));
  expect(naira(before) - naira(after)).toBe(1000);

  // The invoice PDF downloads.
  const invoicePdf = await page.request.get(`${page.url().split("?")[0]}/pdf`);
  expect(invoicePdf.headers()["content-type"]).toBe("application/pdf");

  // The parent's pay link works without logging in, and test checkout settles the payment.
  const payUrl = await page.getByLabel("Pay link").inputValue();
  const parent = await context.browser()!.newPage();
  await parent.goto(payUrl);
  await expect(parent.getByText("Test mode")).toBeVisible();
  await parent.getByLabel("Amount to pay (₦)").fill("500");
  await parent.getByLabel("Your email").fill("parent@e2e.test");
  await parent.getByRole("button", { name: "Pay now" }).click();
  await expect(parent.getByText("Test checkout")).toBeVisible({ timeout: 30_000 });
  await parent.getByRole("button", { name: /Pay ₦500/ }).click();
  await expect(parent.getByText("Payment received, thank you")).toBeVisible({ timeout: 30_000 });
  await parent.close();
  await page.reload();
  await expect(page.getByText("Online (Paystack)").first()).toBeVisible();

  // Debtors and an expense.
  await page.goto(`${base}/fees/debtors`);
  await expect(page.getByRole("heading", { name: "Who owes" })).toBeVisible();
  await page.goto(`${base}/expenses`);
  await page.getByRole("button", { name: "Record expense" }).click();
  const expense = page.getByRole("dialog");
  await expense.getByLabel("What was it for?").fill(`Chalk and markers ${Date.now()}`);
  await expense.getByLabel("Amount (₦)").fill("7,500");
  await expense.getByLabel("Category").selectOption("Teaching materials");
  await page.getByRole("dialog").getByRole("button", { name: "Record expense" }).click();
  await expect(page.getByText("₦7,500 recorded.")).toBeVisible({ timeout: 30_000 });
  await page.goto(`${base}/expenses?tab=statement`);
  await expect(page.getByText(/Surplus for the period|Deficit for the period/)).toBeVisible();
});

test("fees pages fit on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await login(page);
  for (const path of ["/fees", "/fees/invoices", "/fees/debtors", "/expenses"]) {
    await page.goto(`/s/${DEMO.slug}${path}`);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
