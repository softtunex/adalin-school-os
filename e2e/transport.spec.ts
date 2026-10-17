import { expect, test } from "@playwright/test";
import { signInParent } from "./parent-session";

test("the transport officer takes the bus register and the parent sees their child got on", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey; the parent side runs at phone size");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);

  const officer = await (await browser.newContext()).newPage();
  await officer.goto("/login");
  await officer.getByLabel("Email").fill("transport9@demo.schoolos.ng");
  await officer.getByLabel("Password").fill("Demo2026!");
  await officer.getByRole("button", { name: "Log in" }).click();
  await expect(officer).toHaveURL(/\/s\//, { timeout: 60_000 });
  await officer.goto("/s/adalin-college/transport?tab=register");
  await officer.getByRole("link", { name: "Lekki – Ajah" }).click();
  await expect(officer).toHaveURL(/route=/);
  const seun = officer.getByRole("checkbox", { name: /Oluwaseun Lawal/ });
  await expect(seun).toBeVisible({ timeout: 30_000 });
  if ((await seun.getAttribute("aria-checked")) !== "true") await seun.click();
  await expect(seun).toHaveAttribute("aria-checked", "true");
  await officer.getByRole("button", { name: "Save register" }).click();
  await expect(officer.getByText(/Saved: \d+ of \d+ on the bus/)).toBeVisible({ timeout: 30_000 });

  const parent = await signInParent(browser);
  const child = parent.locator("main a[href^='/p/children/']").filter({ hasText: "Oluwaseun" }).first();
  const href = await child.getAttribute("href");
  await parent.goto(`${href}?tab=bus`);
  await expect(parent.getByText("Jakande")).toBeVisible({ timeout: 30_000 });
  await expect(parent.getByText(/On the bus, \d\d:\d\d/).first()).toBeVisible();
});
