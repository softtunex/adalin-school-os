import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("an owner sets up classes, adds and imports students, and manages a profile", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey; phone layout is covered separately");
  test.setTimeout(180_000);

  await page.goto("/signup");
  await page.getByLabel("School name").fill(`Unity Model School ${run}`);
  await page.getByLabel("Your full name").fill("Mrs Bisi Akande");
  await page.getByLabel("Email").fill(`bisi${run}@e2e.test`);
  await page.getByLabel("Password").fill("UnitySchool1");
  await page.getByRole("checkbox", { name: /accepts the terms/ }).check();
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page).toHaveURL(/welcome=1/, { timeout: 45_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];

  // One-click setup.
  await page.goto(`/s/${slug}/academics`);
  await expect(page.getByRole("heading", { name: "Set up your classes and subjects" })).toBeVisible();
  await page.getByText("Nursery", { exact: true }).click(); // untick nursery
  await page.getByLabel("Class arms").fill("Gold, Silver");
  await page.getByRole("button", { name: "Set up my school" }).click();
  await expect(page.getByRole("heading", { name: "Primary 1" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("cell", { name: "JSS 1 Gold", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Primary 1 Gold", exact: true })).toBeVisible();

  // Subjects tab lists template subjects.
  await page.getByRole("link", { name: /^Subjects/ }).click();
  await expect(page.getByRole("cell", { name: "Basic Science and Technology", exact: true })).toBeVisible();

  // Add a student by hand.
  await page.goto(`/s/${slug}/students/new`);
  await page.getByLabel("First name").fill("Chiamaka");
  await page.getByLabel("Surname").fill("Okonkwo");
  await page.getByText("Female", { exact: true }).click();
  await page.getByLabel("Class").selectOption({ label: "JSS 1 Gold" });
  await page.locator("#g1_name").fill("Mrs Adaora Okonkwo");
  await page.locator("#g1_phone").fill("0802 555 6789");
  await page.getByRole("button", { name: "Save student", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Chiamaka Okonkwo" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/has been added/)).toBeVisible();

  // Validation catches a bad phone number without losing what was typed.
  await page.goto(`/s/${slug}/students/new`);
  await page.getByLabel("First name").fill("Bad");
  await page.getByLabel("Surname").fill("Phone");
  await page.getByText("Male", { exact: true }).click();
  await page.locator("#g1_name").fill("Mr Phone");
  await page.locator("#g1_phone").fill("12345");
  await page.getByRole("button", { name: "Save student", exact: true }).click();
  await expect(page.getByText("Enter a valid phone number, e.g. 0803 123 4567.")).toBeVisible();
  await expect(page.getByLabel("First name")).toHaveValue("Bad");

  // Import a CSV with a sibling of Chiamaka (same parent phone in another format).
  await page.goto(`/s/${slug}/students/import`);
  const dir = mkdtempSync(path.join(tmpdir(), "import-"));
  const file = path.join(dir, "register.csv");
  writeFileSync(
    file,
    [
      "First name,Surname,Gender,Date of birth,Class,Parent name,Parent phone",
      "Emeka,Okonkwo,M,02/09/2017,Primary 3 Silver,Mrs Adaora Okonkwo,+234 802 555 6789",
      "Zainab,Yusuf,F,11/01/2016,Primary 4 Gold,Alhaji Yusuf,08061234567",
    ].join("\n"),
  );
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("ready to import", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Import 2 students" }).click();
  await expect(page.getByRole("heading", { name: "2 students imported" })).toBeVisible({ timeout: 30_000 });

  // List, search and filter.
  await page.goto(`/s/${slug}/students`);
  await expect(page.getByText("Showing 1–3 of 3 students")).toBeVisible();
  await page.getByPlaceholder("Search name or admission no…").fill("okonkwo");
  await expect(page.getByText("Showing 1–2 of 2 students")).toBeVisible();
  await page.getByRole("link", { name: /Chiamaka Okonkwo/ }).click();

  // Profile: sibling found through the shared phone number.
  await expect(page.getByRole("heading", { level: 2, name: "Chiamaka Okonkwo" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Emeka Okonkwo/ })).toBeVisible();
  await page.getByRole("link", { name: /Parents & guardians/ }).click();
  await expect(page.getByText("Mrs Adaora Okonkwo").first()).toBeVisible();
  await expect(page.getByText("0802 555 6789")).toBeVisible();

  // Edit: move class, then check class history.
  await page.getByRole("link", { name: "Edit details" }).click();
  await page.getByLabel("Class").selectOption({ label: "JSS 1 Silver" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: /Class history/ }).click();
  await expect(page.getByText("JSS 1 Silver", { exact: true })).toBeVisible();
  await expect(page.getByText("Transferred")).toBeVisible();

  // Withdraw from the row menu.
  await page.goto(`/s/${slug}/students?q=Zainab`);
  await page.getByRole("button", { name: "Actions for Zainab Yusuf" }).click();
  await page.getByRole("menuitem", { name: "Withdraw" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Withdraw" }).click();
  await expect(page.getByText("No students match these filters")).toBeVisible({ timeout: 15_000 });

  // Assign a subject teacher: assign the owner, it saves inline.
  await page.goto(`/s/${slug}/academics?tab=teachers`);
  const select = page.getByRole("combobox", { name: "Teacher" }).first();
  await select.selectOption({ label: "Mrs Bisi Akande" });
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 15_000 });

  // End-of-session promotion: create the next session, review, apply.
  await page.goto(`/s/${slug}/students/promote`);
  await page.getByRole("button", { name: /Create \d{4}\/\d{4} session/ }).click();
  await expect(page.getByText(/Moving students from/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Class for Chiamaka Okonkwo")).toHaveValue(/.+/);
  await page.getByLabel("Next session for Emeka Okonkwo").selectOption("repeat");
  await page.getByRole("button", { name: /Apply to 2 students/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apply promotion" }).click();
  await expect(page.getByRole("heading", { name: /Welcome to/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("1 promoted · 1 repeating · 0 graduated · 0 withdrawn")).toBeVisible();
  await page.goto(`/s/${slug}/students?q=chiamaka`);
  await expect(page.getByRole("cell", { name: "JSS 2 Silver", exact: true })).toBeVisible();
});
