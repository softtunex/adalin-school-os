import { expect, test, type Page } from "@playwright/test";

// Runs against the demo school (pnpm db:seed, db:seed-results, db:seed-fees, db:seed-comms).
const STAFF = { email: "director@demo.schoolos.ng", password: "Demo2026!" };
// Mrs Blessing Lawal, linked by db:seed-comms. Email keeps this clear of the per-number code limit used by manual checks.
const PARENT_LOGIN = "parent8@example.com";
const SCHOOL = "/s/greenfield-college";

async function staffLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(STAFF.email);
  await page.getByLabel("Password").fill(STAFF.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 45_000 });
}

async function parentLogin(page: Page) {
  await page.goto("/parent");
  await page.getByLabel("Phone number or email").fill(PARENT_LOGIN);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByText("Test mode")).toBeVisible({ timeout: 30_000 });
  const code = (await page.locator("span.font-mono").first().textContent())!.trim();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/p$/, { timeout: 45_000 });
}

test("a wrong code is refused and unknown numbers learn nothing", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  await page.goto("/parent");
  await page.getByLabel("Phone number or email").fill("0809 999 0000");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByText(/If your child's school has this number/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Test mode")).toHaveCount(0);
  await page.getByLabel("6-digit code").fill("654321");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/expired|isn't right/)).toBeVisible();
});

test("staff post an announcement, the parent signs in with a code, reads it, and messages the teacher", async ({ page, browser, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(240_000);
  const stamp = Date.now();

  await staffLogin(page);
  await page.goto(`${SCHOOL}/announcements`);
  await page.getByRole("button", { name: "New announcement" }).click();
  const compose = page.getByRole("dialog");
  await compose.getByLabel("Title").fill(`Cultural day ${stamp}`);
  await compose.getByLabel("Message").fill("Children can come in traditional attire on Friday.");
  await compose.getByLabel("Who it's for").selectOption("parents");
  await compose.getByRole("button", { name: "Post announcement" }).click();
  await expect(compose.getByText(/Posted to \d+ families/)).toBeVisible({ timeout: 30_000 });

  const phone = await browser.newPage({ viewport: { width: 412, height: 900 }, isMobile: true, hasTouch: true });
  await parentLogin(phone);
  await expect(phone.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(phone.getByText(`Cultural day ${stamp}`)).toBeVisible();

  // The child page and the published report card.
  await phone.locator("a[href^='/p/children/']").first().click();
  await expect(phone).toHaveURL(/\/p\/children\//, { timeout: 45_000 });
  await phone.getByRole("link", { name: /Results/ }).click();
  const card = phone.getByRole("link", { name: "Report card" }).first();
  if (await card.count()) {
    const pdf = await phone.request.get((await card.getAttribute("href"))!);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
  }

  // Message the class teacher.
  await phone.goto("/p/messages/new");
  await phone.getByLabel("Subject").fill(`Pick-up time ${stamp}`);
  await phone.getByLabel("Message").fill("I'll pick up early on Friday for a hospital appointment.");
  await phone.getByRole("button", { name: "Send message" }).click();
  await expect(phone).toHaveURL(/\/p\/messages\/[0-9a-f-]{36}/, { timeout: 45_000 });
  await expect(phone.getByText("I'll pick up early on Friday for a hospital appointment.")).toBeVisible();
  const threadUrl = phone.url();

  // The proprietor can see every conversation and reply.
  await page.goto(`${SCHOOL}/messages?view=all`);
  await page.getByRole("link", { name: new RegExp(`Pick-up time ${stamp}`) }).click();
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByText(/reading this as school leadership/)).toBeVisible({ timeout: 45_000 });
  await page.getByLabel("Your reply").fill("Noted, thank you. Please sign out at the gate.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Noted, thank you. Please sign out at the gate.")).toBeVisible({ timeout: 30_000 });

  await phone.goto(threadUrl);
  await expect(phone.getByText("Noted, thank you. Please sign out at the gate.")).toBeVisible();
  await phone.close();
});
