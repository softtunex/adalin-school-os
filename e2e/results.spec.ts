import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("attendance, score entry, publishing and PDF report cards", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop journey");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);

  await page.goto("/signup");
  await page.getByLabel("School name").fill(`Kings Court School ${run}`);
  await page.getByLabel("Your full name").fill("Mr Tunde Bakare");
  await page.getByLabel("Email").fill(`tunde${run}@e2e.test`);
  await page.getByLabel("Password").fill("KingsCourt1");
  await page.getByRole("checkbox", { name: /accepts the terms/ }).check();
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page).toHaveURL(/welcome=1/, { timeout: 45_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];

  await page.goto(`/s/${slug}/academics`);
  for (const section of ["Nursery", "Primary", "Senior secondary"]) await page.getByText(section, { exact: true }).click();
  await page.getByLabel("Class arms").fill("");
  await page.getByRole("button", { name: "Set up my school" }).click();
  await expect(page.getByRole("heading", { name: "JSS 1" })).toBeVisible({ timeout: 30_000 });

  const dir = mkdtempSync(path.join(tmpdir(), "results-"));
  const file = path.join(dir, "students.csv");
  writeFileSync(file, ["First name,Surname,Gender,Class", "Amaka,Obi,F,JSS 1", "Bolaji,Ade,M,JSS 1", "Chinedu,Eze,M,JSS 1"].join("\n"));
  await page.goto(`/s/${slug}/students/import`);
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole("button", { name: "Check file" }).click();
  await page.getByRole("button", { name: "Import 3 students" }).click();
  await expect(page.getByRole("heading", { name: "3 students imported" })).toBeVisible({ timeout: 30_000 });

  // Attendance: everyone present by default, mark one absent, save.
  await page.goto(`/s/${slug}/attendance`);
  await page.getByRole("link", { name: /Take (a )?register/ }).first().click();
  await page.getByRole("radiogroup", { name: "Attendance for Bolaji Ade" }).getByRole("radio", { name: "Absent" }).click();
  await expect(page.getByText("2 in")).toBeVisible();
  await page.getByRole("button", { name: "Save register" }).click();
  await expect(page.getByText("Register saved: 2 in school, 1 absent.")).toBeVisible({ timeout: 20_000 });
  await page.goto(`/s/${slug}/attendance`);
  await expect(page.getByText("2 present · 0 late · 1 absent")).toBeVisible();

  // Score entry with autosave.
  await page.goto(`/s/${slug}/results`);
  await page.getByRole("link", { name: "Open results" }).first().click();
  await page.getByRole("link", { name: /Subject sheets/ }).click();
  await page.getByRole("row", { name: /Mathematics/ }).getByRole("link", { name: "Open sheet" }).click();
  await expect(page.getByText("Scores save automatically as you type.")).toBeVisible({ timeout: 30_000 });
  const scores: Record<string, [string, string, string]> = { "Obi Amaka": ["18", "17", "52"], "Ade Bolaji": ["12", "10", "30"], "Eze Chinedu": ["15", "15", "45"] };
  for (const [student, values] of Object.entries(scores)) {
    for (const [i, comp] of ["1st CA", "2nd CA", "Exam"].entries()) {
      await page.getByLabel(`${comp} for ${student}`).fill(values[i]);
    }
  }
  await page.getByLabel("1st CA for Ade Bolaji").fill("25");
  await expect(page.getByText("Fix the red cells")).toBeVisible();
  await page.getByLabel("1st CA for Ade Bolaji").fill("12");
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByLabel("Exam for Obi Amaka")).toHaveValue("52");
  await expect(page.getByRole("row", { name: /Obi Amaka/ }).getByText("A1")).toBeVisible();

  // No connection: a score typed now is kept on the device, survives a reload, and saves once it can.
  const blockSaves = (route: import("@playwright/test").Route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue());
  await page.route("**/s/**", blockSaves);
  await page.getByLabel("Exam for Eze Chinedu").fill("47");
  await expect(page.getByText(/No connection\. Your scores are kept here/)).toBeVisible({ timeout: 20_000 });
  await page.unroute("**/s/**", blockSaves);
  await page.reload();
  await expect(page.getByLabel("Exam for Eze Chinedu")).toHaveValue("47");
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByLabel("Exam for Eze Chinedu")).toHaveValue("47");

  // Submit the sheet, then publish (Free plan publishes directly).
  await page.getByRole("button", { name: "Submit scores" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit scores" }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.goto(`/s/${slug}/results`);
  await page.getByRole("link", { name: "Open results" }).first().click();
  await expect(page.getByRole("cell", { name: "1st" })).toBeVisible();
  await page.getByRole("button", { name: "Publish results" }).click();
  await page.getByLabel("Next term begins (printed on report cards)").fill("2027-01-11");
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  // Report cards download as a real PDF.
  const classUrl = new URL(page.url()).pathname;
  const pdf = await page.request.get(`${classUrl}/report-cards`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // Published results are locked for editing.
  await page.goto(`/s/${slug}/results`);
  await expect(page.getByText("Locked").or(page.getByText("Published", { exact: true })).first()).toBeVisible();
});
