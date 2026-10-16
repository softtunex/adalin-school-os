import { expect, test } from "@playwright/test";

const SLUG = "greenfield-college";
const run = `${Date.now()}`.slice(-6);

test("a parent applies and pays, and the school offers and enrols", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey; the parent side runs at phone size");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const surname = `Tester${run}`;

  // The parent applies on a phone and pays the form fee.
  const parent = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await parent.goto(`/apply/${SLUG}`);
  await parent.getByLabel("Class applying for").selectOption({ label: "JSS 1" });
  await parent.getByLabel("First name").fill("Kelechi");
  await parent.getByLabel("Surname").fill(surname);
  await parent.getByLabel("Boy or girl").selectOption("male");
  await parent.getByLabel("Your full name").fill(`Mrs Ada ${surname}`);
  await parent.getByLabel("Phone number").fill("0803 222 3333");
  await parent.getByLabel("Email (optional)").fill(`ada${run}@example.com`);
  await parent.getByRole("button", { name: "Send application" }).click();
  await expect(parent.getByRole("heading", { name: "Application sent!" })).toBeVisible({ timeout: 60_000 });
  const statusUrl = parent.url().replace(/\?.*$/, "");
  await parent.getByRole("button", { name: /^Pay/ }).click();
  await expect(parent).toHaveURL(/test-checkout/, { timeout: 60_000 });
  await parent.getByRole("button", { name: /^Pay/ }).click();
  await expect(parent.getByText("Application fee received. Thank you.")).toBeVisible({ timeout: 60_000 });

  // The school invites, scores and offers.
  const staff = await (await browser.newContext()).newPage();
  await staff.goto("/login");
  await staff.getByLabel("Email").fill("director@demo.schoolos.ng");
  await staff.getByLabel("Password").fill("Demo2026!");
  await staff.getByRole("button", { name: "Log in" }).click();
  await expect(staff).toHaveURL(/\/s\//, { timeout: 60_000 });
  await staff.goto(`/s/${SLUG}/admissions?q=${surname}`);
  await staff.getByRole("link", { name: `Kelechi ${surname}` }).click();
  await staff.getByRole("button", { name: "Invite to entrance exam" }).click();
  await expect(staff.getByText("Moved to Entrance exam")).toBeVisible({ timeout: 30_000 });
  await staff.getByLabel("Entrance exam score").fill("79");
  await staff.getByRole("button", { name: "Save assessment" }).click();
  await expect(staff.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await staff.getByRole("button", { name: "Offer admission" }).click();
  await expect(staff.getByText("Moved to Offered")).toBeVisible({ timeout: 30_000 });

  // The parent accepts; the school enrols.
  await parent.goto(statusUrl);
  await expect(parent.getByText(/has been offered a place/)).toBeVisible();
  expect((await parent.request.get(`${statusUrl}/offer`)).headers()["content-type"]).toContain("application/pdf");
  await parent.getByRole("button", { name: "Accept the offer" }).click();
  await expect(parent.getByText("Offer accepted.", { exact: false })).toBeVisible({ timeout: 30_000 });

  await staff.reload();
  await staff.getByRole("button", { name: "Enrol" }).click();
  await expect(staff).toHaveURL(new RegExp(`/s/${SLUG}/students/[0-9a-f-]{36}`), { timeout: 60_000 });
  await expect(staff.getByText(`Kelechi ${surname}`).first()).toBeVisible();
});
