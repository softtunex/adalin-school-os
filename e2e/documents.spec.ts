import { expect, test } from "@playwright/test";

test("the office issues a certificate, its QR page says genuine, and revoking it shows it cancelled", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);

  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill("nwosu1@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });
  await page.goto("/s/greenfield-college/documents");
  await page.getByRole("button", { name: "Issue certificate" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Template").selectOption({ label: "Certificate of completion" });
  await form.getByLabel("Students").fill("Oluwaseun La");
  await form.getByRole("option", { name: /Oluwaseun Lawal/ }).click();
  await form.getByRole("button", { name: "Make the certificates" }).click();
  const pdfLink = form.getByRole("link", { name: "Open the PDF" });
  await expect(pdfLink).toBeVisible({ timeout: 60_000 });
  const pdf = await page.request.get((await pdfLink.getAttribute("href"))!);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.goto("/s/greenfield-college/documents?tab=issued&q=Oluwaseun&kind=certificate");
  const row = page.getByRole("row").filter({ hasText: "Certificate of Completion" }).first();
  const check = (await row.getByRole("link", { name: "Check" }).getAttribute("href"))!;
  const serial = (await row.locator("td").first().innerText()).trim();

  const visitor = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await visitor.goto(check);
  await expect(visitor.getByRole("heading", { name: "This document is genuine" })).toBeVisible({ timeout: 30_000 });
  await expect(visitor.getByText(serial)).toBeVisible();

  await row.getByRole("button", { name: `More for ${serial}` }).click();
  await page.getByRole("menuitem", { name: "Revoke" }).click();
  const confirm = page.getByRole("dialog");
  await confirm.getByLabel("Why").fill("Printed in error");
  await confirm.getByRole("button", { name: "Revoke" }).click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "This document has been cancelled" })).toBeVisible({ timeout: 30_000 });
  await expect(visitor.getByText(/Printed in error/)).toBeVisible();
});
