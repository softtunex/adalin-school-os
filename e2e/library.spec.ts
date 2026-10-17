import { expect, test } from "@playwright/test";

const SLUG = "greenfield-college";
const run = `${Date.now()}`.slice(-6);

test("the librarian adds a book, lends it, and the student sees it", async ({ browser, isMobile }) => {
  test.skip(isMobile, "desktop journey; the student side runs at phone size");
  test.setTimeout(process.env.CI ? 240_000 : 480_000);
  const title = `The Joys of Motherhood ${run}`;

  const lib = await (await browser.newContext()).newPage();
  await lib.goto("/login");
  await lib.getByLabel("Email").fill("librarian6@demo.schoolos.ng");
  await lib.getByLabel("Password").fill("Demo2026!");
  await lib.getByRole("button", { name: "Log in" }).click();
  await expect(lib).toHaveURL(/\/s\//, { timeout: 60_000 });
  await lib.goto(`/s/${SLUG}/library`);
  await lib.getByRole("button", { name: "Add book" }).click();
  const add = lib.getByRole("dialog");
  await add.getByLabel("Title", { exact: true }).fill(title);
  await add.getByLabel("Author").fill("Buchi Emecheta");
  await add.getByLabel("Copies").fill("2");
  await add.getByRole("button", { name: "Save book" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });
  await lib.getByPlaceholder("Title, author or ISBN…").fill(run);
  await expect(lib.getByText(title, { exact: true })).toBeVisible({ timeout: 30_000 });

  await lib.getByRole("button", { name: "Lend a book" }).click();
  const lend = lib.getByRole("dialog");
  await lend.getByLabel("Books").fill(run);
  await lend.getByRole("option", { name: new RegExp(run) }).click();
  await lend.getByLabel("Add another book").fill("Famished");
  await lend.getByRole("option", { name: /The Famished Road/ }).click();
  await expect(lend.getByRole("list", { name: "Books to lend" }).getByRole("listitem")).toHaveCount(2);
  await lend.getByLabel("Borrower").fill("Oluwaseun");
  await lend.getByRole("option", { name: /Oluwaseun Lawal/ }).click();
  await lend.getByRole("button", { name: "Lend 2 books" }).click();
  await expect(lend.getByText(/Lent 2 books to Oluwaseun Lawal/)).toBeVisible({ timeout: 30_000 });

  const kid = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await kid.goto(`/student?school=${SLUG}`);
  await kid.getByLabel("Admission number").fill("GFC/2026/0009");
  await kid.getByLabel("Password").fill("Student2026");
  await kid.getByRole("button", { name: "Sign in" }).click();
  await expect(kid).toHaveURL(/\/learn/, { timeout: 60_000 });
  await kid.getByRole("button", { name: "More", exact: true }).click();
  await kid.getByRole("navigation", { name: "App tabs" }).getByRole("link", { name: "Library" }).click();
  await expect(kid.getByText(title)).toBeVisible({ timeout: 30_000 });
  await expect(kid.getByText("The Famished Road")).toBeVisible();
});
