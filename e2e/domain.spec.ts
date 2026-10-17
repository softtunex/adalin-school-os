import { expect, request, test } from "@playwright/test";

test("a school sets its own web address, and its login page there carries its name", async ({ page, isMobile, baseURL }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const host = "portal.e2e-school.sch.ng";
  await page.goto("/login");
  await page.getByLabel("Email").fill("director@demo.schoolos.ng");
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });

  const openSchoolInAdmin = async () => {
    await page.goto("/admin/schools?q=adalin");
    await page.getByRole("row").filter({ hasText: "adalin-college" }).getByRole("link").first().click();
  };
  const setFeature = async (on: boolean) => {
    await openSchoolInAdmin();
    await page.getByRole("button", { name: "Change features" }).click();
    const box = page.getByRole("dialog").getByRole("checkbox", { name: /Custom domain/ });
    if ((await box.isChecked()) !== on) await box.click();
    await page.getByRole("dialog").getByRole("button", { name: "Save features" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
  };
  await setFeature(true);
  try {
    await page.goto("/s/adalin-college/settings?tab=domain");
    await page.getByLabel("Your school's address").fill(`https://${host}/`);
    await page.getByRole("button", { name: /^(Save|Change)$/ }).click();
    await expect(page.getByText("Waiting for DNS")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("cell", { name: "cname.vercel-dns.com" })).toBeVisible();

    // A visitor with no session, arriving on the school's address.
    const visitor = await request.newContext({ baseURL, extraHTTPHeaders: { Host: host } });
    // Not live yet: the address shows School OS as usual.
    const before = await visitor.get("/login");
    const beforeText = await before.text();
    expect(beforeText).toContain("Log in to your school.");
    expect(beforeText).toContain("Create a free account");

    // Vercel isn't set up on test servers, so Adalin marks it live by hand.
    await openSchoolInAdmin();
    await page.getByRole("button", { name: "Mark live" }).click();
    await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 30_000 });

    const after = await (await visitor.get("/login")).text();
    expect(after).toContain("Welcome back");
    expect(after).not.toContain("Log in to your school.");
    expect(after).not.toContain("Create a free account");
    const home = await visitor.get("/", { maxRedirects: 0 });
    expect(home.status()).toBe(307);
    expect(home.headers().location).toContain("/login");
    await visitor.dispose();
  } finally {
    await page.goto("/s/adalin-college/settings?tab=domain");
    if (await page.getByRole("button", { name: "Stop using it" }).isVisible()) {
      await page.getByRole("button", { name: "Stop using it" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Stop using it" }).click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
    }
    await setFeature(false);
  }
});
