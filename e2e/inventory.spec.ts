import { expect, test } from "@playwright/test";

const SLUG = "adalin-college";
const run = `${Date.now()}`.slice(-6);

test("the storekeeper adds an asset, signs it out to a teacher, and takes it back", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const name = `Smart board ${run}`;

  const keeper = await (await browser.newContext()).newPage();
  await keeper.goto("/login");
  await keeper.getByLabel("Email").fill("storekeeper7@demo.schoolos.ng");
  await keeper.getByLabel("Password").fill("Demo2026!");
  await keeper.getByRole("button", { name: "Log in" }).click();
  await expect(keeper).toHaveURL(/\/s\//, { timeout: 60_000 });
  await keeper.goto(`/s/${SLUG}/inventory`);
  await keeper.getByRole("button", { name: "Add item" }).click();
  const add = keeper.getByRole("dialog");
  await add.getByRole("radio", { name: /Kept/ }).click();
  await add.getByLabel("Name").fill(name);
  await add.getByLabel("How many now").fill("2");
  await add.getByLabel("Asset tag").fill(`ADC-ICT-${run}`);
  await add.getByRole("button", { name: "Add to store" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });

  await keeper.getByPlaceholder("Item, tag or place…").fill(run);
  const row = keeper.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Sign out" }).click();
  const out = keeper.getByRole("dialog");
  await out.getByLabel("Staff member").selectOption({ label: "Mr Emeka Obi" });
  await out.getByRole("button", { name: "Sign out" }).click();
  await expect(out).toBeHidden({ timeout: 30_000 });

  const teacher = await (await browser.newContext()).newPage();
  await teacher.goto("/login");
  await teacher.getByLabel("Email").fill("obi4@demo.schoolos.ng");
  await teacher.getByLabel("Password").fill("Demo2026!");
  await teacher.getByRole("button", { name: "Log in" }).click();
  await expect(teacher).toHaveURL(/\/s\//, { timeout: 60_000 });
  await teacher.goto(`/s/${SLUG}/hr`);
  await expect(teacher.getByText(name)).toBeVisible({ timeout: 30_000 });

  await keeper.goto(`/s/${SLUG}/inventory?tab=out&q=${run}`);
  const back = keeper.getByRole("row").filter({ hasText: name });
  await back.getByRole("button", { name: "Back in store" }).click();
  const dlg = keeper.getByRole("dialog");
  await dlg.getByRole("button", { name: "Back in the store" }).click();
  await expect(dlg).toBeHidden({ timeout: 30_000 });
  await expect(keeper.getByText("Everything is in the store")).toBeVisible({ timeout: 30_000 });
});
