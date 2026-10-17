import { expect, test } from "@playwright/test";

test("the proprietor sees the term's bill, pays it, and chooses a cheaper plan for next term", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill("director@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });
  await page.goto("/s/adalin-college/settings?tab=plan");

  // Free can't take 56 students, so it isn't offered.
  await expect(page.getByText(/Allows 50 students; you have \d+ on roll/)).toBeVisible({ timeout: 30_000 });

  // The open bill, whichever row it's in (other tests may have raised and cancelled newer ones).
  const bill = page.getByRole("row").filter({ hasText: /ADL-\d{4}-\d{5}/ }).filter({ has: page.getByRole("button", { name: /^Pay / }) }).first();
  await expect(bill).toBeVisible();
  const number = (await bill.textContent())!.match(/ADL-\d{4}-\d{5}/)![0];
  await bill.getByRole("button", { name: /^Pay / }).click();
  await expect(page).toHaveURL(/paid=ADL-/, { timeout: 60_000 });
  await expect(page.getByText(`Thank you. Bill ${number} is paid.`)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: number }).getByText("Paid", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Move to Standard" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/keep Premium until this term ends/)).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog.getByText(/You'll move to Standard when next term's bill is made/)).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Moving to Standard next term.")).toBeVisible();
});
