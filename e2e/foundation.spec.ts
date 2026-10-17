import { expect, test, type Page } from "@playwright/test";

const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function logout(page: Page) {
  await page.context().clearCookies();
}

test("owner sets up a school, invites a teacher, and the teacher only sees teacher screens", async ({ page, browser, isMobile }) => {
  const ownerEmail = `owner${run}${isMobile ? "m" : "d"}@e2e.test`;
  const teacherEmail = `teacher${run}${isMobile ? "m" : "d"}@e2e.test`;
  const schoolName = `Bright Future Academy ${run}${isMobile ? "M" : "D"}`;

  // Sign up creates the school and lands on Today with the setup checklist.
  await page.goto("/signup");
  await page.getByLabel("School name").fill(schoolName);
  await page.getByLabel("Your full name").fill("Mrs Funke Adebayo");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill("Brightfuture1");
  await page.getByRole("checkbox", { name: /accepts the terms/ }).check();
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page).toHaveURL(/\/s\/bright-future-academy-[\w-]+\?welcome=1/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Funke/ })).toBeVisible();
  await expect(page.getByText(/0 of 4 steps done/)).toBeVisible();
  const slug = new URL(page.url()).pathname.split("/")[2];

  // Validation errors are shown inline, not as a crash.
  await page.goto(`/s/${slug}/settings`);
  await page.getByLabel("School email").fill("not-an-email");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();

  // Completing the profile ticks the first checklist item.
  await page.getByLabel("School email").fill("info@brightfuture.test");
  await page.getByLabel("School type").selectOption("secondary");
  await page.getByLabel("Phone").fill("0803 123 4567");
  await page.getByLabel("Address").fill("12 Admiralty Way, Lekki");
  await page.getByLabel("State").selectOption("Lagos");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("School profile saved.")).toBeVisible();

  // Invite a subject teacher and capture the shareable link.
  await page.goto(`/s/${slug}/staff`);
  await expect(page.getByText("1 / 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Mr Chidi Okeke");
  await dialog.getByLabel("Email").fill(teacherEmail);
  await dialog.getByText("Subject teacher", { exact: true }).click();
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  const linkField = dialog.getByLabel("Invitation link");
  await expect(linkField).toBeVisible();
  const inviteLink = await linkField.inputValue();
  expect(inviteLink).toMatch(/\/invite\/[\w-]{20,}$/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Pending invitations" })).toBeVisible();

  await page.goto(`/s/${slug}`);
  await expect(page.getByText(/2 of 4 steps done/)).toBeVisible();

  // The teacher accepts in a separate browser and gets a teacher-only view.
  const teacherContext = await browser.newContext(isMobile ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } : {});
  const teacher = await teacherContext.newPage();
  await teacher.goto(new URL(inviteLink).pathname);
  await expect(teacher.getByRole("heading", { name: `Join ${schoolName}` })).toBeVisible();
  await teacher.getByLabel("Create a password").fill("Teacher2026");
  await teacher.getByRole("button", { name: "Accept and join" }).click();
  await expect(teacher).toHaveURL(new RegExp(`/s/${slug}$`));
  await expect(teacher.getByRole("heading", { name: /Chidi/ })).toBeVisible();

  if (isMobile) await teacher.getByRole("button", { name: "Open menu" }).click();
  await expect(teacher.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await expect(teacher.getByRole("link", { name: "Settings" })).toHaveCount(0);

  // Typing an admin URL directly gives a 404, not the page.
  const staffResponse = await teacher.goto(`/s/${slug}/staff`);
  expect(staffResponse?.status()).toBe(404);
  await expect(teacher.getByRole("heading", { name: "This page isn't here" })).toBeVisible();

  // The invitation link can't be reused.
  await teacher.goto(new URL(inviteLink).pathname);
  await expect(teacher.getByRole("heading", { name: "This invitation has expired" })).toBeVisible();
  await teacherContext.close();

  // Back as the owner: the teacher now shows on the staff list.
  await page.goto(`/s/${slug}/staff`);
  await expect(page.getByRole("cell", { name: /^Mr Chidi Okeke/ })).toBeVisible();
  await expect(page.getByText("2 / 5", { exact: true })).toBeVisible();

  // Logging out sends protected pages back to login, preserving the destination.
  await logout(page);
  await page.goto(`/s/${slug}/staff`);
  await expect(page).toHaveURL(/\/login\?next=%2Fs%2F/);
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill("wrong-password1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  await page.getByLabel("Password").fill("Brightfuture1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${slug}/staff$`));
});

test("a stranger can't open another school's pages", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("School name").fill(`Outsider School ${run}`);
  await page.getByLabel("Your full name").fill("Outsider Person");
  await page.getByLabel("Email").fill(`outsider${run}${Math.random().toString(36).slice(2, 6)}@e2e.test`);
  await page.getByLabel("Password").fill("Outsider123");
  await page.getByRole("checkbox", { name: /accepts the terms/ }).check();
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page).toHaveURL(/welcome=1/, { timeout: 45_000 });
  const response = await page.goto("/s/adalin-college-does-not-belong-to-you");
  expect(response?.status()).toBe(404);
});

test("login rejects off-site redirects", async ({ page }) => {
  await page.goto("/login?next=//evil.example.com");
  await expect(page.locator('input[name="next"]')).toHaveValue("/schools");
});

test("no school page scrolls sideways on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout check");
  await page.goto("/signup");
  await page.getByLabel("School name").fill(`Narrow Screen School ${run}`);
  await page.getByLabel("Your full name").fill("Narrow Screen");
  await page.getByLabel("Email").fill(`narrow${run}@e2e.test`);
  await page.getByLabel("Password").fill("Narrow1234");
  await page.getByRole("checkbox", { name: /accepts the terms/ }).check();
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page).toHaveURL(/welcome=1/, { timeout: 45_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];
  for (const path of ["", "/staff", "/roles", "/settings", "/audit"]) {
    await page.goto(`/s/${slug}${path}`);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `${path || "/"} overflows`).toBeLessThanOrEqual(clientWidth);
  }
});
