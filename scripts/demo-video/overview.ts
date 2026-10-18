/*
 * The 3-minute overview: one school day in Adalin SchoolHub, told through the people who use it.
 * Records each scene against the demo server (scripts/demo-server.ts), then writes takes.json
 * for the editor (scripts/demo-video/edit.ts). Record on a weekday so today's registers are open.
 *
 *   npx tsx scripts/demo-video/overview.ts [scene ids...]
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { BASE, Recorder, S, SLUG, type Take } from "./kit";

const OUT = path.join(".data", "demo-video", "overview");
const STATE = path.join(OUT, "sessions");

/** Sign everyone in once, off camera. */
async function sessions(browser: Browser) {
  mkdirSync(STATE, { recursive: true });
  const save = async (name: string, signIn: (page: Page) => Promise<void>) => {
    const context = await browser.newContext({ baseURL: BASE });
    const page = await context.newPage();
    await signIn(page);
    await context.storageState({ path: path.join(STATE, `${name}.json`) });
    await context.close();
  };
  const staff = (email: string) => async (page: Page) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Demo2026!");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/(s|schools)\//, { timeout: 60_000 });
  };
  await save("owner", staff("director@demo.adalinschoolhub.ng"));
  await save("teacher", staff("adeyemi3@demo.adalinschoolhub.ng"));
  await save("parent", async (page) => {
    await page.goto("/parent");
    await page.getByLabel("Phone number or email").fill("parent8@example.com");
    await page.getByRole("button", { name: "Send me a code" }).click();
    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/p$/, { timeout: 60_000 });
  });
  await save("student", async (page) => {
    await page.goto("/student");
    await page.getByLabel(/School code/).fill(SLUG);
    await page.getByLabel(/Admission/).fill("ADC/2026/0009");
    await page.getByLabel("Password").fill("Student2026");
    await page.getByRole("button", { name: /Log in|Sign in/ }).click();
    await page.waitForURL(/\/learn/, { timeout: 60_000 });
  });
}

type Scene = { id: string; kind: "desktop" | "phone"; title: string; as: string; run: (r: Recorder) => Promise<void> };

const SCENES: Scene[] = [
  {
    id: "01-overview",
    kind: "desktop",
    title: "The proprietor",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(S);
      r.caption("Your whole school, in one place");
      await r.wait(1800);
      await r.point(p.getByText("Students", { exact: true }).nth(1));
      r.caption("Students, staff, classes and the term at a glance");
      await r.wait(1400);
      await r.point(p.getByText("Staff", { exact: true }).nth(0));
      await r.wait(900);
      await r.point(p.getByText("Recent activity"));
      r.caption("See what's happening across the school as it happens");
      await r.wait(2200);
    },
  },
  {
    id: "02-students",
    kind: "desktop",
    title: "Students",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/students`);
      r.caption("Every student, with search, filters and export");
      await r.wait(1500);
      await r.type(p.getByPlaceholder(/Search/).first(), "Lawal");
      await r.wait(900);
      r.caption("Open a student to see everything about them");
      await r.click(p.getByRole("link", { name: /Folake Lawal/ }).first(), 1200);
      await r.wait(1200);
      r.caption("Class, guardians, fees, results, attendance and health");
      await r.scroll(420);
      await r.wait(1400);
      await r.scroll(420);
      await r.wait(1400);
    },
  },
  {
    id: "03-register",
    kind: "phone",
    title: "Teachers",
    as: "teacher",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/attendance`);
      r.caption("Teachers take the register on their phone");
      await r.wait(1500);
      await r.click(p.getByRole("link", { name: /Take (a )?register/ }).first(), 1000);
      r.caption("Everyone starts present. Tap the ones who aren't.");
      await r.wait(800);
      const groups = p.getByRole("radiogroup");
      await r.click(groups.nth(2).getByRole("radio", { name: "Absent" }), 500);
      await r.click(groups.nth(5).getByRole("radio", { name: "Late" }), 700);
      await r.click(p.getByRole("button", { name: "Save register" }), 1500);
      r.caption("Parents of absent children get a text straight away");
      await expect(p.getByText(/Register saved/)).toBeVisible({ timeout: 30_000 });
      await r.wait(2600);
    },
  },
  {
    id: "04-results",
    kind: "desktop",
    title: "Results",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/results`);
      r.caption("Teachers enter scores; SchoolHub does the maths");
      await r.wait(1500);
      await r.click(p.getByRole("link", { name: "Open results" }).first(), 1200);
      r.caption("Totals, grades and class positions, worked out for you");
      await r.wait(1500);
      await r.scroll(380);
      await r.wait(1200);
      r.caption("Publish once, and every parent gets their child's report card");
      await r.wait(2400);
    },
  },
  {
    id: "05-fees",
    kind: "desktop",
    title: "Fees",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/fees`);
      r.caption("See what's expected, collected and still owed");
      await r.wait(2200);
      await r.click(p.getByRole("link", { name: /Debtors/ }).first(), 1200);
      r.caption("Know exactly who owes, and remind them in one click");
      await r.wait(2600);
    },
  },
  {
    id: "06-parent",
    kind: "phone",
    title: "Parents",
    as: "parent",
    async run(r) {
      const p = r.page;
      await r.go("/p");
      r.caption("Parents see every child in one app");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: /See Oluwaseun's records/ }), 1200);
      r.caption("Attendance, fees, results, homework and more");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: /^Results/ }).first(), 1200);
      r.caption("Report cards arrive the moment the school publishes");
      await r.wait(2200);
      await r.click(p.getByRole("link", { name: "Home", exact: true }).last(), 1200);
      r.caption("And they pay school fees online");
      await r.wait(800);
      await r.click(p.getByRole("link", { name: /Pay ₦/ }).or(p.getByRole("button", { name: /Pay ₦/ })).first(), 1200);
      await r.wait(800);
      // The checkout itself (test mode here; Paystack on the live site) is cut.
      const payNow = p.getByRole("button", { name: /Pay now/ });
      if (await payNow.isVisible().catch(() => false)) {
        const email = p.getByLabel("Your email");
        if (await email.isVisible().catch(() => false) && !(await email.inputValue())) await r.type(email, "blessing.lawal@example.com");
        await r.click(payNow, 300);
      }
      r.cutStart();
      await p.getByRole("button", { name: /Pay ₦/ }).click({ timeout: 30_000 });
      await expect(p.getByText("Payment received, thank you")).toBeVisible({ timeout: 30_000 });
      await r.wait(300);
      r.cutEnd();
      r.caption("Payment received, with a receipt straight away");
      await r.wait(2800);
    },
  },
  {
    id: "07-student",
    kind: "phone",
    title: "Students",
    as: "student",
    async run(r) {
      const p = r.page;
      await r.go("/learn");
      r.caption("Students get their own timetable");
      await r.wait(1500);
      await r.scroll(500);
      await r.wait(600);
      await r.click(p.getByRole("link", { name: "Homework" }).last(), 1200);
      r.caption("Homework, handed in and marked online");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: "Exams" }).last(), 1200);
      r.caption("And computer-based tests, marked the moment they finish");
      await r.wait(2400);
    },
  },
  {
    id: "08-messages",
    kind: "desktop",
    title: "Messages",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/announcements`);
      r.caption("Announcements reach parents in the app, by SMS, WhatsApp or email");
      await r.wait(2400);
      await r.click(p.getByRole("link", { name: "Messages" }).first(), 1200);
      await r.click(p.getByRole("link", { name: "Every conversation" }).or(p.getByRole("tab", { name: "Every conversation" })).first(), 1000);
      r.caption("Parents message teachers directly, and the school can see every conversation");
      await r.wait(2600);
    },
  },
  {
    id: "09-staff",
    kind: "desktop",
    title: "Staff",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/hr`);
      r.caption("Staff clock in, request leave and see their payslips");
      await r.wait(2400);
      await r.click(p.getByRole("button", { name: /Finance/ }).first(), 500);
      await r.click(p.getByRole("link", { name: "Payroll" }).first(), 1200);
      r.caption("Payroll with PAYE, pension and NHF worked out");
      await r.wait(2600);
    },
  },
];

async function main() {
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  if (!only.length || !existsSync(path.join(STATE, "owner.json"))) await sessions(browser);
  const takesFile = path.join(OUT, "takes.json");
  const takes: Take[] = existsSync(takesFile) ? JSON.parse(readFileSync(takesFile, "utf8")) : [];
  for (const scene of SCENES.filter((s) => !only.length || only.includes(s.id))) {
    process.stdout.write(`Recording ${scene.id}... `);
    const r = new Recorder(browser, scene.id, scene.kind, scene.title, path.join(OUT, "raw"), path.join(STATE, `${scene.as}.json`));
    await r.open();
    try {
      await scene.run(r);
    } catch (e) {
      await r.page.screenshot({ path: path.join(OUT, `${scene.id}-failed.png`) }).catch(() => {});
      await r.close();
      throw e;
    }
    const take = await r.close();
    const i = takes.findIndex((t) => t.id === take.id);
    if (i >= 0) takes[i] = take;
    else takes.push(take);
    takes.sort((a, b) => a.id.localeCompare(b.id));
    writeFileSync(takesFile, JSON.stringify(takes, null, 1));
    console.log(`${take.length.toFixed(1)}s`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
