/*
 * The full walkthrough: every part of Adalin SchoolHub, chapter by chapter, from creating a school
 * to the Enterprise features. Each scene is labelled with the cheapest plan that has it.
 * Records against the demo server (scripts/demo-server.ts); edit with `pnpm demo:edit full`.
 *
 *   npx tsx scripts/demo-video/full.ts                  every scene
 *   npx tsx scripts/demo-video/full.ts "Fees and payments" c10-2   one chapter, one scene
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { payOnline } from "./overview";
import { runStoryboard, S, type Ctx, type Recorder, type Scene } from "./kit";

const NEW_SCHOOL = "Adalin Model School";
const newSlug = (ctx: Ctx) => ctx.newSlug ?? "adalin-model-school";
const N = (ctx: Ctx) => `/s/${newSlug(ctx)}`;
const HEIGHTS = "/s/adalin-heights-school-ikoyi";

/** Type into a search-as-you-type field and pick the matching option. */
async function choose(r: Recorder, field: import("@playwright/test").Locator, text: string, option: RegExp) {
  await r.type(field, text);
  await r.click(r.page.getByRole("option", { name: option }).first(), 400);
}

const C = {
  start: "Getting started",
  staff: "Staff, roles and permissions",
  students: "Students and parents",
  admissions: "Online admissions",
  attendance: "Attendance and timetable",
  results: "Results and report cards",
  teaching: "Teaching and learning",
  life: "Student life",
  comms: "Communication",
  fees: "Fees and payments",
  hr: "Staff, HR and payroll",
  records: "Records and operations",
  settings: "Settings and your brand",
  parent: "The parent app",
  student: "The student app",
  enterprise: "Enterprise",
};

const SCENES: Scene[] = [
  /* ---------------- Getting started ---------------- */
  {
    id: "c1-1",
    chapter: C.start,
    plan: "Free",
    kind: "desktop",
    title: "Welcome",
    async run(r) {
      await r.go("/");
      r.caption("Adalin SchoolHub: school management built for Nigerian schools");
      await r.wait(2200);
      await r.scroll(700);
      r.caption("Everything a school runs on, in one app for staff, parents and students");
      await r.wait(2000);
      await r.scroll(800);
      await r.wait(1600);
      await r.scroll(900);
      r.caption("Start free, and pay per student per term as you grow");
      await r.wait(2000);
    },
  },
  {
    id: "c1-2",
    chapter: C.start,
    plan: "Free",
    kind: "desktop",
    title: "Create a school",
    saveAs: "newowner",
    async run(r, ctx) {
      const p = r.page;
      await r.go("/signup");
      r.caption("Create your school in under a minute");
      await r.type(p.getByLabel("School name"), NEW_SCHOOL);
      await r.type(p.getByLabel("Your full name"), "Mrs Adaeze Okafor");
      await r.type(p.getByLabel("Email"), "adaeze@adalinmodelschool.ng");
      await r.type(p.getByLabel("Password"), "ModelSchool2026");
      await r.click(p.getByRole("checkbox", { name: /accepts the terms/ }), 400);
      r.caption("Free for up to 50 students. No card needed.");
      await r.click(p.getByRole("button", { name: "Create school" }), 500);
      await r.offCamera(() => p.waitForURL(/welcome=1/, { timeout: 60_000 }));
      ctx.newSlug = new URL(p.url()).pathname.split("/")[2];
      r.caption("Your school is ready, with a checklist to get going");
      await r.wait(2600);
    },
  },
  {
    id: "c1-3",
    chapter: C.start,
    plan: "Free",
    kind: "desktop",
    title: "Classes",
    as: "newowner",
    async run(r, ctx) {
      const p = r.page;
      await r.go(`${N(ctx)}/academics`);
      r.caption("Tick the sections you run and name your class arms");
      await r.wait(1400);
      await r.click(p.getByText("Nursery", { exact: true }), 500);
      await r.type(p.getByLabel("Class arms"), "Gold, Silver");
      await r.click(p.getByRole("button", { name: "Set up my school" }), 500);
      await r.offCamera(() => expect(p.getByRole("heading", { name: "JSS 1" })).toBeVisible({ timeout: 60_000 }));
      r.caption("Every class is created, with the Nigerian curriculum's subjects");
      await r.wait(2000);
      await r.scroll(500);
      await r.wait(1200);
      await r.click(p.getByRole("link", { name: /^Subjects/ }).first(), 1000);
      r.caption("Subjects, class teachers, terms and grading are all yours to change");
      await r.wait(2200);
    },
  },
  {
    id: "c1-4",
    chapter: C.start,
    plan: "Free",
    kind: "desktop",
    title: "School profile",
    as: "newowner",
    async run(r, ctx) {
      const p = r.page;
      await r.go(`${N(ctx)}/settings`);
      r.caption("Add your school's details once");
      await r.type(p.getByLabel("School email"), "info@adalinmodelschool.ng");
      await r.select(p.getByLabel("School type"), "secondary");
      await r.type(p.getByLabel("Phone"), "0803 123 4567");
      await r.type(p.getByLabel("Address"), "12 Admiralty Way, Lekki");
      await r.select(p.getByLabel("State"), "Lagos");
      await r.click(p.getByRole("button", { name: "Save profile" }), 1000);
      r.caption("They appear on report cards, receipts, letters and the parent app");
      await r.wait(2400);
    },
  },

  /* ---------------- Staff, roles and permissions ---------------- */
  {
    id: "c2-1",
    chapter: C.staff,
    plan: "Free",
    kind: "desktop",
    title: "Invite staff",
    as: "newowner",
    async run(r, ctx) {
      const p = r.page;
      await r.go(`${N(ctx)}/staff`);
      r.caption("Invite your staff, each with the right role");
      await r.click(p.getByRole("button", { name: "Invite staff" }), 600);
      const d = p.getByRole("dialog");
      await r.type(d.getByLabel("Full name"), "Mr Tobi Adeniran");
      await r.type(d.getByLabel("Email"), "tobi@adalinmodelschool.ng");
      await r.click(d.getByText("Subject teacher", { exact: true }), 500);
      await r.click(d.getByRole("button", { name: "Send invitation" }), 1000);
      ctx.invite = await d.getByLabel("Invitation link").inputValue({ timeout: 30_000 });
      r.caption("They get an email, or you share the link on WhatsApp");
      await r.wait(2400);
      await r.click(d.getByRole("button", { name: "Done" }), 800);
      await r.wait(1200);
    },
  },
  {
    id: "c2-2",
    chapter: C.staff,
    plan: "Free",
    kind: "desktop",
    title: "Join",
    saveAs: "newteacher",
    async run(r, ctx) {
      const p = r.page;
      await r.go(new URL(ctx.invite).pathname);
      r.caption("The teacher sets a password and joins");
      await r.type(p.getByLabel("Create a password"), "Teacher2026");
      await r.click(p.getByRole("button", { name: "Accept and join" }), 500);
      await r.offCamera(() => p.waitForURL(/\/s\//, { timeout: 60_000 }));
      r.caption("Each person only sees what their role allows");
      await r.wait(2600);
    },
  },
  {
    id: "c2-3",
    chapter: C.staff,
    plan: "Free",
    kind: "desktop",
    title: "Staff",
    as: "owner",
    async run(r) {
      await r.go(`${S}/staff`);
      r.caption("Every staff member, their role, classes and status");
      await r.wait(2400);
      await r.scroll(400);
      await r.wait(1500);
    },
  },
  {
    id: "c2-4",
    chapter: C.staff,
    plan: "Premium",
    kind: "desktop",
    title: "Roles",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/roles`);
      r.caption("Ready-made roles for every job in a school", "Free");
      await r.wait(2000);
      await r.scroll(500);
      await r.wait(1400);
      await r.click(p.getByRole("button", { name: "New role" }), 700);
      const d = p.getByRole("dialog");
      r.caption("Create your own roles, with exactly the permissions you choose");
      await r.type(d.getByLabel("Role name"), "Exams officer");
      await r.type(d.getByLabel("What this role is for (optional)"), "Runs exams, results and PINs");
      const boxes = d.getByRole("checkbox");
      for (const i of [0, 3, 6, 9, 12]) await r.click(boxes.nth(i), 250);
      await r.click(d.getByRole("button", { name: "Create role" }), 1200);
      await r.wait(2000);
    },
  },

  /* ---------------- Students and parents ---------------- */
  {
    id: "c3-1",
    chapter: C.students,
    plan: "Free",
    kind: "desktop",
    title: "Add a student",
    as: "newowner",
    async run(r, ctx) {
      const p = r.page;
      await r.go(`${N(ctx)}/students/new`);
      r.caption("Add a student, with their parents' contacts");
      await r.type(p.getByLabel("First name"), "Chiamaka");
      await r.type(p.getByLabel("Surname"), "Okonkwo");
      await r.click(p.getByText("Female", { exact: true }), 300);
      await r.select(p.getByLabel("Class"), { label: "JSS 1 Gold" });
      await r.type(p.getByLabel(/^Full name/).first(), "Mrs Ngozi Okonkwo");
      await r.type(p.getByLabel("Phone number").first(), "0803 555 0101");
      r.caption("Parents are linked automatically, so siblings appear together");
      await r.click(p.getByRole("button", { name: "Save student", exact: true }), 1200);
      await r.wait(2200);
    },
  },
  {
    id: "c3-2",
    chapter: C.students,
    plan: "Free",
    kind: "desktop",
    title: "Import",
    as: "newowner",
    async run(r, ctx) {
      const p = r.page;
      const dir = path.join(".data", "demo-video", "full");
      mkdirSync(dir, { recursive: true });
      const file = path.resolve(dir, "students.csv");
      const rows = [
        ["Tolu", "Bakare", "F", "JSS 1 Gold"], ["Emeka", "Nwosu", "M", "JSS 1 Gold"], ["Halima", "Sani", "F", "JSS 1 Silver"],
        ["David", "Ojo", "M", "JSS 1 Silver"], ["Amaka", "Eze", "F", "JSS 2 Gold"], ["Yusuf", "Bello", "M", "JSS 2 Silver"],
        ["Kemi", "Alade", "F", "SS 1 Gold"], ["Ifeanyi", "Obi", "M", "SS 1 Silver"],
      ];
      writeFileSync(file, ["First name,Surname,Gender,Class", ...rows.map((x) => x.join(","))].join("\n"));
      await r.go(`${N(ctx)}/students/import`);
      r.caption("Or bring the whole school in from Excel");
      await r.wait(1600);
      await p.locator('input[type="file"]').setInputFiles(file);
      await r.click(p.getByRole("button", { name: "Check file" }), 1000);
      r.caption("Every row is checked before anything is saved");
      await r.wait(2000);
      await r.click(p.getByRole("button", { name: /Import \d+ students/ }), 1500);
      await r.wait(2200);
    },
  },
  {
    id: "c3-3",
    chapter: C.students,
    plan: "Free",
    kind: "desktop",
    title: "Students",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/students`);
      r.caption("Search, filter and export your students");
      await r.wait(1800);
      await r.type(p.getByPlaceholder(/Search/).first(), "Oluwaseun");
      await r.click(p.getByRole("link", { name: /Oluwaseun Lawal/ }).first(), 1200);
      r.caption("Everything about a student on one page");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: /Parents & guardians/ }).first(), 1000);
      await r.wait(1600);
      await r.click(p.getByRole("link", { name: /Class history/ }).first(), 1000);
      await r.wait(1400);
      await r.go(`${S}/students/logins`);
      r.caption("Print login slips so students can use the student app");
      await r.wait(2200);
      await r.go(`${S}/students/promote`);
      r.caption("At the end of the session, promote the whole school in one go");
      await r.wait(2400);
    },
  },
  {
    id: "c3-4",
    chapter: C.students,
    plan: "Basic",
    kind: "phone",
    title: "Parents",
    async run(r) {
      const p = r.page;
      await r.go("/parent");
      r.caption("Parents sign in with their phone number");
      await r.type(p.getByLabel("Phone number or email"), "0803 006 3352");
      await r.click(p.getByRole("button", { name: "Send me a code" }), 1200);
      r.caption("A one-time code by SMS. No passwords to forget.");
      await r.type(p.getByLabel("6-digit code"), "123456");
      await r.click(p.getByRole("button", { name: "Continue" }), 500);
      await r.offCamera(() => p.waitForURL(/\/p$/, { timeout: 60_000 }));
      r.caption("Every child of theirs, in every school, in one place");
      await r.wait(2600);
    },
  },

  /* ---------------- Online admissions ---------------- */
  {
    id: "c4-1",
    chapter: C.admissions,
    plan: "Standard",
    kind: "phone",
    title: "Admissions",
    async run(r) {
      const p = r.page;
      await r.go(`/apply/adalin-college`);
      r.caption("Parents apply online from your school's own page");
      await r.wait(1200);
      await r.select(p.getByLabel("Class applying for"), { label: "JSS 1" });
      await r.type(p.getByLabel("First name"), "Kelechi");
      await r.type(p.getByLabel("Surname"), "Adebola");
      await r.select(p.getByLabel("Boy or girl"), "male");
      await r.type(p.getByLabel("Your full name"), "Mrs Ada Adebola");
      await r.type(p.getByLabel("Phone number"), "0803 222 3333");
      await r.type(p.getByLabel("Email (optional)"), "ada.adebola@example.com");
      await r.click(p.getByRole("checkbox", { name: /parent or guardian/ }), 400);
      await r.click(p.getByRole("button", { name: "Send application" }), 500);
      await r.offCamera(() => expect(p.getByRole("heading", { name: "Application sent!" })).toBeVisible({ timeout: 60_000 }));
      r.caption("And pay the form fee online");
      await r.wait(1400);
      await r.clickIntoCut(p.getByRole("button", { name: /^Pay/ }).first());
      await r.offCamera(async () => {
        await p.waitForURL(/test-checkout/, { timeout: 60_000 });
        await p.getByRole("button", { name: /^Pay/ }).first().click();
        await expect(p.getByText("Application fee received. Thank you.")).toBeVisible({ timeout: 60_000 });
      });
      r.caption("They can follow the application from this page");
      await r.wait(2400);
    },
  },
  {
    id: "c4-2",
    chapter: C.admissions,
    plan: "Standard",
    kind: "desktop",
    title: "Admissions",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/admissions`);
      r.caption("Every application in one place, paid and unpaid");
      await r.wait(2000);
      await r.go(`${S}/admissions?q=Adebola`);
      await r.click(p.getByRole("link", { name: /Kelechi Adebola/ }).first(), 1200);
      r.caption("Invite to the entrance exam and record the score");
      await r.click(p.getByRole("button", { name: "Invite to entrance exam" }), 1200);
      await r.type(p.getByLabel("Entrance exam score"), "79");
      await r.click(p.getByRole("button", { name: "Save assessment" }), 1200);
      r.caption("Offer a place; the parent accepts online and you enrol in one click");
      await r.click(p.getByRole("button", { name: "Offer admission" }), 1500);
      await r.wait(2400);
    },
  },

  /* ---------------- Attendance and timetable ---------------- */
  {
    id: "c5-1",
    chapter: C.attendance,
    plan: "Free",
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
      r.caption("Parents of absent children are told straight away", "Standard");
      await expect(p.getByText(/Register saved/)).toBeVisible({ timeout: 30_000 });
      await r.wait(2600);
    },
  },
  {
    id: "c5-2",
    chapter: C.attendance,
    plan: "Free",
    kind: "desktop",
    title: "Attendance",
    as: "owner",
    async run(r) {
      await r.go(`${S}/attendance`);
      r.caption("See which classes have taken the register, and who's absent");
      await r.wait(2400);
      await r.scroll(450);
      await r.wait(1600);
    },
  },
  {
    id: "c5-3",
    chapter: C.attendance,
    plan: "Basic",
    kind: "desktop",
    title: "Timetable",
    as: "owner",
    async run(r) {
      await r.go(`${S}/timetable`);
      r.caption("Build the timetable once, class by class");
      await r.wait(2200);
      await r.scroll(450);
      r.caption("SchoolHub warns you about clashes before they happen");
      await r.wait(2200);
      await r.scroll(-450);
      await r.wait(800);
    },
  },

  /* ---------------- Results and report cards ---------------- */
  {
    id: "c6-1",
    chapter: C.results,
    plan: "Free",
    kind: "desktop",
    title: "Score entry",
    as: "maths",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/results`);
      r.caption("Teachers see only the sheets they're responsible for");
      await r.wait(1800);
      const open = p.getByRole("row").filter({ hasNotText: "Published" }).getByRole("link", { name: "Open results" }).first();
      await r.click(open, 1200);
      await r.click(p.getByRole("link", { name: /Subject sheets/ }), 1000);
      await r.click(p.getByRole("row", { name: /Mathematics/ }).getByRole("link", { name: "Open sheet" }).first(), 1500);
      r.caption("Type the scores; they save as you go, even without internet");
      const cells = p.getByLabel(/^Exam for /);
      for (const [i, v] of ["52", "48", "44"].entries()) await r.type(cells.nth(i), v);
      await r.wait(1600);
      r.caption("Totals and grades fill in by themselves");
      await r.wait(2200);
    },
  },
  {
    id: "c6-2",
    chapter: C.results,
    plan: "Free",
    kind: "desktop",
    title: "Broadsheet",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/results`);
      r.caption("Track every class's sheets through approval", "Basic");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: "Open results" }).first(), 1200);
      r.caption("Averages, grades and class positions, worked out for you");
      await r.wait(2000);
      await r.scroll(400);
      await r.wait(1600);
      r.caption("Publish, and parents get report cards on their phones");
      await r.wait(2000);
    },
  },
  {
    id: "c6-3",
    chapter: C.results,
    plan: "Basic",
    kind: "desktop",
    title: "Result PINs",
    as: "owner",
    async run(r) {
      await r.go(`${S}/results/pins`);
      r.caption("Prefer scratch cards? Generate result-checker PINs");
      await r.wait(2400);
      await r.scroll(400);
      await r.wait(1500);
    },
  },
  {
    id: "c6-4",
    chapter: C.results,
    plan: "Basic",
    kind: "phone",
    title: "Result checker",
    async run(r) {
      await r.go(`/r/adalin-college`);
      r.caption("Parents check results on your school's own page");
      await r.wait(2800);
    },
  },
  {
    id: "c6-5",
    chapter: C.results,
    plan: "Premium",
    kind: "desktop",
    title: "Analytics",
    as: "owner",
    async run(r) {
      await r.go(`${S}/analytics`);
      r.caption("See how the school is really doing");
      await r.wait(2200);
      await r.go(`${S}/analytics?tab=academics`);
      r.caption("Subjects and classes that need attention");
      await r.wait(2200);
      await r.go(`${S}/analytics?tab=students`);
      r.caption("Students at risk, before the term ends");
      await r.wait(2200);
      await r.go(`${S}/analytics?tab=teachers`);
      r.caption("And how each teacher's classes are doing");
      await r.wait(2200);
    },
  },

  /* ---------------- Teaching and learning ---------------- */
  {
    id: "c7-1",
    chapter: C.teaching,
    plan: "Standard",
    kind: "desktop",
    title: "Homework",
    as: "maths",
    async run(r, ctx) {
      const p = r.page;
      ctx.homework = "Fractions practice";
      await r.go(`${S}/assignments`);
      r.caption("Teachers set homework for a class in seconds");
      await r.click(p.getByRole("button", { name: "New assignment" }), 700);
      const f = p.getByRole("dialog");
      await r.select(f.getByLabel("Class"), { label: "JSS 1 Gold" });
      await r.select(f.getByLabel("Subject"), { label: "Mathematics" });
      await r.type(f.getByLabel("Title"), ctx.homework);
      await r.type(f.getByLabel("Instructions"), "Answer questions 1 to 5 on page 42.");
      await r.type(f.getByLabel("Marked out of (optional)"), "10");
      await r.click(f.getByRole("button", { name: "Set assignment" }), 1500);
      r.caption("Students see it in their app; parents see it too");
      await r.wait(2200);
    },
  },
  {
    id: "c7-2",
    chapter: C.teaching,
    plan: "Standard",
    kind: "phone",
    title: "Students",
    as: "student",
    async run(r, ctx) {
      const p = r.page;
      await r.go("/learn/assignments");
      r.caption("The student opens the homework");
      await r.click(p.getByRole("link", { name: new RegExp(ctx.homework ?? "Fractions practice") }).first(), 1200);
      await r.type(p.getByLabel("Answer"), "1. 3/4  2. 5/6  3. 1/2  4. 7/8  5. 2/3");
      r.caption("Types an answer or attaches a photo, and hands it in");
      await r.click(p.getByRole("button", { name: "Hand in" }), 1500);
      await r.wait(2200);
    },
  },
  {
    id: "c7-3",
    chapter: C.teaching,
    plan: "Standard",
    kind: "desktop",
    title: "Marking",
    as: "maths",
    async run(r, ctx) {
      const p = r.page;
      await r.go(`${S}/assignments`);
      await r.click(p.getByRole("link", { name: new RegExp(ctx.homework ?? "Fractions practice") }).first(), 1200);
      r.caption("The teacher sees who has handed in, and marks online");
      await r.click(p.getByRole("button", { name: /^To mark/ }), 800);
      await r.click(p.getByRole("button", { name: "View work" }).first(), 1000);
      await r.type(p.getByLabel("Mark for Oluwaseun Lawal"), "9");
      await r.type(p.getByLabel("Feedback for Oluwaseun Lawal"), "Excellent work. Check question 4.");
      await r.click(p.getByRole("button", { name: "Save marks" }), 1200);
      r.caption("The student and parent see the mark and feedback");
      await r.wait(2200);
    },
  },
  {
    id: "c7-4",
    chapter: C.teaching,
    plan: "Standard",
    kind: "desktop",
    title: "Lesson notes",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/lesson-notes`);
      r.caption("Teachers submit lesson notes; the principal reviews them");
      await r.wait(2000);
      await r.click(p.locator("main tbody a").first(), 1200);
      await r.wait(1600);
      await r.click(p.getByRole("button", { name: "Approve" }).first(), 1200);
      r.caption("Approve, or send back with comments");
      await r.wait(2200);
    },
  },
  {
    id: "c7-5",
    chapter: C.teaching,
    plan: "Standard",
    kind: "desktop",
    title: "CBT",
    as: "maths",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/cbt`);
      r.caption("Computer-based tests, set by the teacher");
      await r.wait(2000);
      await r.go(`${S}/cbt?tab=bank`);
      r.caption("Build a question bank by pasting questions straight from Word");
      await r.click(p.getByRole("button", { name: "Paste questions" }), 700);
      const d = p.getByRole("dialog");
      await r.type(d.getByLabel("Questions"), "1. What is 3/4 + 1/8?\nA. 7/8 *\nB. 4/12\nC. 1");
      await r.click(d.getByRole("button", { name: "Add to the bank" }), 1500);
      await r.wait(1800);
    },
  },
  {
    id: "c7-6",
    chapter: C.teaching,
    plan: "Standard",
    kind: "phone",
    title: "Students",
    as: "student",
    async run(r) {
      const p = r.page;
      await r.go("/learn/exams");
      r.caption("Students sit the test on a phone or computer");
      await r.click(p.getByRole("link", { name: /Second CA test/ }).first(), 1200);
      await r.click(p.getByRole("button", { name: "Start the exam" }), 1200);
      r.caption("Timed, with questions shuffled for every student");
      const total = Number((await p.getByText(/Question 1 of \d+/).innerText()).match(/of (\d+)/)![1]);
      for (let i = 0; i < total; i++) {
        if (await p.getByRole("radio").count()) await r.click(p.getByRole("radio").first(), 250);
        else await r.type(p.getByRole("textbox").first(), "Find a common denominator, then add.");
        if (i < total - 1) await r.click(p.getByRole("button", { name: "Next", exact: true }), 250);
      }
      await r.click(p.getByRole("button", { name: "Submit", exact: true }), 600);
      await r.click(p.getByRole("dialog").getByRole("button", { name: "Submit", exact: true }), 1500);
      r.caption("Objective questions are marked instantly");
      await r.wait(2400);
    },
  },
  {
    id: "c7-7",
    chapter: C.teaching,
    plan: "Premium",
    kind: "desktop",
    title: "Materials",
    as: "maths",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/materials`);
      r.caption("Share notes, files and videos with a class");
      await r.click(p.getByRole("button", { name: "Share material" }), 700);
      const f = p.getByRole("dialog");
      await r.click(f.getByRole("radio", { name: /Note/ }), 300);
      await r.select(f.getByLabel("Class and subject"), { label: "JSS 1 · Mathematics" });
      await r.type(f.getByLabel("Title"), "Fractions made simple");
      await r.type(f.getByLabel("Note"), "A fraction is part of a whole. 1/2 + 1/4 = 3/4.");
      await r.click(f.getByRole("button", { name: "Share with students" }), 1500);
      r.caption("Students read them in their app, any time");
      await r.wait(2200);
    },
  },

  /* ---------------- Student life ---------------- */
  {
    id: "c8-1",
    chapter: C.life,
    plan: "Basic",
    kind: "desktop",
    title: "Behaviour",
    as: "teacher",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/discipline`);
      r.caption("Record merits and incidents as they happen");
      await r.click(p.getByRole("button", { name: "Record" }).first(), 700);
      const f = p.getByRole("dialog");
      await choose(r, f.getByLabel("Student"), "Oluwaseun", /Oluwaseun Lawal/);
      await r.select(f.getByLabel("Category"), "Helpfulness");
      await r.type(f.getByLabel(/What did they do/), "Helped a new classmate find her way around.");
      await r.click(f.getByRole("button", { name: "Save" }), 1200);
      r.caption("Parents see merits in their app");
      await r.wait(1800);
      await r.click(f.getByRole("button", { name: "Done" }), 800);
    },
  },
  {
    id: "c8-2",
    chapter: C.life,
    plan: "Premium",
    kind: "desktop",
    title: "Library",
    as: "librarian",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/library`);
      r.caption("The library catalogue, loans and fines");
      await r.wait(1600);
      await r.click(p.getByRole("button", { name: "Add book" }), 700);
      const add = p.getByRole("dialog");
      await r.type(add.getByLabel("Title", { exact: true }), "Things Fall Apart");
      await r.type(add.getByLabel("Author"), "Chinua Achebe");
      await r.type(add.getByLabel("Copies"), "3");
      await r.click(add.getByRole("button", { name: "Save book" }), 1200);
      r.caption("Lend books to students and staff, with due dates");
      await r.click(p.getByRole("button", { name: "Lend a book" }), 700);
      const lend = p.getByRole("dialog");
      await choose(r, lend.getByLabel("Books"), "Things Fall", /Things Fall Apart/);
      await choose(r, lend.getByLabel("Borrower"), "Oluwaseun", /Oluwaseun Lawal/);
      await r.click(lend.getByRole("button", { name: /^Lend( \d+ books?)?$/ }), 1500);
      await r.wait(2000);
    },
  },
  {
    id: "c8-3",
    chapter: C.life,
    plan: "Premium",
    kind: "desktop",
    title: "Sick bay",
    as: "nurse",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/sick-bay`);
      r.caption("The school nurse logs every sick-bay visit");
      await r.click(p.getByRole("button", { name: "New visit" }), 700);
      const f = p.getByRole("dialog");
      await choose(r, f.getByLabel("Student"), "Oluwaseun La", /Oluwaseun Lawal/);
      await r.type(f.getByLabel("What's wrong?"), "Headache after break");
      await r.type(f.getByLabel("Temperature (°C)"), "37.4");
      await r.type(f.getByLabel("Medicine"), "Groundnut oil rub");
      await r.type(f.getByLabel("Dose"), "a little");
      await r.click(f.getByRole("button", { name: "Add" }), 1200);
      r.caption("It warns about allergies before any medicine is given");
      await r.wait(2200);
      await r.click(f.getByRole("button", { name: "Remove Groundnut oil rub" }), 500);
      await r.type(f.getByLabel("Medicine"), "Paracetamol");
      await r.type(f.getByLabel("Dose"), "500mg");
      await r.click(f.getByRole("button", { name: "Add" }), 600);
      await r.select(f.getByLabel("How they left"), "rested");
      await r.click(f.getByRole("button", { name: "Save visit" }), 1200);
      r.caption("Parents are told what happened");
      await r.wait(2000);
    },
  },
  {
    id: "c8-4",
    chapter: C.life,
    plan: "Premium",
    kind: "phone",
    title: "Transport",
    as: "transport",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/transport?tab=register`);
      r.caption("Bus routes, stops and riders");
      await r.click(p.getByRole("link", { name: "Lekki – Ajah" }).first(), 1200);
      r.caption("The bus register, taken on the bus");
      const seun = p.getByRole("checkbox", { name: /Oluwaseun Lawal/ });
      if (!(await seun.isChecked())) await r.click(seun, 400);
      await r.click(p.getByRole("button", { name: "Save register" }), 1500);
      r.caption("Parents see their child got on");
      await r.wait(2200);
    },
  },
  {
    id: "c8-5",
    chapter: C.life,
    plan: "Premium",
    kind: "desktop",
    title: "Hostel",
    as: "warden",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/hostel`);
      r.caption("Hostels, rooms and beds for boarding schools");
      await r.wait(2000);
      await r.go(`${S}/hostel?tab=exeats&view=pending`);
      r.caption("Parents request exeats in their app; the warden approves");
      await r.click(p.getByRole("row").filter({ hasText: "Folake Lawal" }).getByRole("button", { name: "Approve" }).first(), 1500);
      await r.wait(2000);
    },
  },

  /* ---------------- Communication ---------------- */
  {
    id: "c9-1",
    chapter: C.comms,
    plan: "Free",
    kind: "desktop",
    title: "Announcements",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/announcements`);
      r.caption("Announcements to the whole school, a class or staff");
      await r.click(p.getByRole("button", { name: "New announcement" }), 700);
      const d = p.getByRole("dialog");
      await r.type(d.getByLabel("Title"), "Inter-house sports on Friday");
      await r.type(d.getByLabel("Message"), "Inter-house sports holds on Friday from 9am. Children should wear their house colours.");
      await r.select(d.getByLabel("Who it's for"), "parents");
      r.caption("In the app, and by SMS, WhatsApp or email", "Standard");
      await r.wait(1400);
      await r.click(d.getByRole("button", { name: "Post announcement" }), 1500);
      await r.wait(2200);
    },
  },
  {
    id: "c9-2",
    chapter: C.comms,
    plan: "Free",
    kind: "desktop",
    title: "Calendar",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/calendar`);
      r.caption("The school calendar, shared with parents");
      await r.wait(2200);
      await r.click(p.getByRole("button", { name: "Next month" }).or(p.getByRole("link", { name: "Next month" })).first(), 1000);
      await r.wait(1800);
    },
  },
  {
    id: "c9-3",
    chapter: C.comms,
    plan: "Standard",
    kind: "phone",
    title: "Parents",
    as: "parent",
    async run(r) {
      const p = r.page;
      await r.go("/p/messages/new");
      r.caption("Parents message the class teacher privately");
      await r.type(p.getByLabel("Subject"), "Early pick-up on Friday");
      await r.type(p.getByLabel("Message"), "Good morning. I'll pick Oluwaseun up at 12 on Friday for a hospital appointment.");
      await r.click(p.getByRole("button", { name: "Send message" }), 1500);
      r.caption("No more sharing personal phone numbers");
      await r.wait(2400);
    },
  },
  {
    id: "c9-4",
    chapter: C.comms,
    plan: "Standard",
    kind: "desktop",
    title: "Messaging",
    as: "owner",
    async run(r) {
      await r.go(`${S}/settings?tab=messaging`);
      r.caption("Choose which alerts parents get, and when");
      await r.wait(2200);
      await r.scroll(500);
      r.caption("Buy SMS credits as you need them");
      await r.wait(2200);
    },
  },

  /* ---------------- Fees and payments ---------------- */
  {
    id: "c10-1",
    chapter: C.fees,
    plan: "Basic",
    kind: "desktop",
    title: "Fees",
    as: "owner",
    async run(r) {
      await r.go(`${S}/fees`);
      r.caption("Expected, collected and outstanding, at a glance");
      await r.wait(2400);
      await r.go(`${S}/fees/structure`);
      r.caption("Set fees per class once; invoices are raised for every student");
      await r.wait(2400);
    },
  },
  {
    id: "c10-2",
    chapter: C.fees,
    plan: "Basic",
    kind: "desktop",
    title: "Payments",
    as: "bursar",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/fees/invoices?status=owing`);
      r.caption("The bursar records bank transfers, POS and cash");
      await r.click(p.locator("table a[href*='/fees/invoices/']").first(), 1200);
      await r.click(p.getByRole("button", { name: "Record payment" }), 700);
      const d = p.getByRole("dialog");
      await r.type(d.getByLabel("Amount (₦)"), "50,000");
      await r.select(d.getByLabel("How they paid"), "transfer");
      await r.click(d.getByRole("button", { name: "Record payment" }), 1500);
      r.caption("A numbered receipt is issued and sent to the parent");
      await r.wait(2400);
      await r.click(p.getByRole("button", { name: "Done" }), 800);
    },
  },
  {
    id: "c10-3",
    chapter: C.fees,
    plan: "Standard",
    kind: "phone",
    title: "Parents",
    as: "parent",
    async run(r) {
      await r.go("/p");
      r.caption("Parents pay online by card, transfer or USSD");
      await r.wait(1200);
      await payOnline(r);
      r.caption("The money goes straight to the school's account");
      await r.wait(2600);
    },
  },
  {
    id: "c10-4",
    chapter: C.fees,
    plan: "Standard",
    kind: "desktop",
    title: "Debtors",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/fees/debtors`);
      r.caption("Know exactly who owes and for how long");
      await r.wait(2200);
      await r.point(p.getByText("Remind everyone").first());
      r.caption("Remind every family that owes, in one click");
      await r.wait(2200);
      await r.go(`${S}/fees/discounts`);
      r.caption("Sibling, staff and scholarship discounts", "Basic");
      await r.wait(2200);
    },
  },
  {
    id: "c10-5",
    chapter: C.fees,
    plan: "Premium",
    kind: "desktop",
    title: "Expenses",
    as: "bursar",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/expenses`);
      r.caption("Record what the school spends");
      await r.click(p.getByRole("button", { name: "Record expense" }), 700);
      const d = p.getByRole("dialog");
      await r.type(d.getByLabel("What was it for?"), "Diesel for the generator");
      await r.type(d.getByLabel("Amount (₦)"), "85,000");
      await r.select(d.getByLabel("Category"), { label: "Utilities" }).catch(() => d.getByLabel("Category").selectOption({ index: 1 }));
      await r.click(d.getByRole("button", { name: "Record expense" }), 1500);
      await r.go(`${S}/expenses?tab=statement`);
      r.caption("And see the income statement for the term");
      await r.wait(2600);
    },
  },
  {
    id: "c10-6",
    chapter: C.fees,
    plan: "Premium",
    kind: "desktop",
    title: "Payroll",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/payroll`);
      r.caption("Payroll with PAYE, pension and NHF worked out");
      await r.wait(2200);
      await r.click(p.getByRole("row").filter({ hasText: "Draft" }).getByRole("link").first(), 1200);
      r.caption("Check each payslip, then approve");
      await r.wait(1800);
      await r.click(p.getByRole("button", { name: "Approve" }).first(), 700);
      await r.click(p.getByRole("dialog").getByRole("button", { name: "Approve" }), 1500);
      r.caption("Staff get their payslips in the app");
      await r.wait(2200);
    },
  },

  /* ---------------- Staff, HR ---------------- */
  {
    id: "c11-1",
    chapter: C.hr,
    plan: "Standard",
    kind: "phone",
    title: "Staff",
    as: "maths",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/hr`);
      r.caption("Staff clock in from their phone");
      await r.wait(1200);
      await r.click(p.getByRole("button", { name: "Clock in" }).first(), 1500);
      await r.wait(1600);
      r.caption("And ask for leave without paperwork");
      await r.click(p.getByRole("button", { name: "Request leave" }), 700);
      const f = p.getByRole("dialog");
      await r.select(f.getByLabel("Type of leave"), "study");
      await f.getByLabel("First day").fill("2026-10-26");
      await f.getByLabel("Last day").fill("2026-10-27");
      await r.type(f.getByLabel("Reason"), "Postgraduate diploma exams");
      await r.click(f.getByRole("button", { name: "Send request" }), 1500);
      await r.wait(1800);
    },
  },
  {
    id: "c11-2",
    chapter: C.hr,
    plan: "Standard",
    kind: "desktop",
    title: "HR",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/hr`);
      r.caption("Who's in today, who's late, and who's on leave");
      await r.wait(2400);
      await r.go(`${S}/hr?tab=leave`);
      r.caption("Approve leave in one click");
      await r.click(p.getByRole("row", { name: /Postgraduate diploma exams/ }).getByRole("button", { name: "Approve" }).first(), 1500);
      await r.wait(2000);
    },
  },

  /* ---------------- Records and operations ---------------- */
  {
    id: "c12-1",
    chapter: C.records,
    plan: "Premium",
    kind: "desktop",
    title: "Documents",
    as: "admin",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/documents`);
      r.caption("ID cards, testimonials, certificates, transcripts and letters");
      await r.wait(2200);
      await r.click(p.getByRole("button", { name: "Issue certificate" }), 700);
      const f = p.getByRole("dialog");
      await r.select(f.getByLabel("Template"), { label: "Certificate of completion" });
      await choose(r, f.getByLabel("Students"), "Oluwaseun La", /Oluwaseun Lawal/);
      await r.click(f.getByRole("button", { name: "Make the certificates" }), 2000);
      r.caption("Every document has a QR code anyone can scan to check it's genuine");
      await r.wait(2600);
    },
  },
  {
    id: "c12-2",
    chapter: C.records,
    plan: "Premium",
    kind: "desktop",
    title: "Inventory",
    as: "storekeeper",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/inventory`);
      r.caption("Stock and school property, with low-stock warnings");
      await r.wait(1800);
      await r.click(p.getByRole("button", { name: "Add item" }), 700);
      const add = p.getByRole("dialog");
      await r.click(add.getByRole("radio", { name: /Kept/ }), 300);
      await r.type(add.getByLabel("Name"), "Epson projector");
      await r.type(add.getByLabel("How many now"), "2");
      await r.type(add.getByLabel("Asset tag"), "ADC-ICT-0042");
      await r.click(add.getByRole("button", { name: "Add to store" }), 1200);
      r.caption("Sign items out to staff and get them back");
      await r.type(p.getByPlaceholder("Item, tag or place…"), "projector");
      await r.click(p.getByRole("row").filter({ hasText: "Epson projector" }).getByRole("button", { name: "Sign out" }).first(), 700);
      const out = p.getByRole("dialog");
      await r.select(out.getByLabel("Staff member"), { label: "Mr Emeka Obi" });
      await r.click(out.getByRole("button", { name: "Sign out" }), 1500);
      await r.wait(1800);
    },
  },
  {
    id: "c12-3",
    chapter: C.records,
    plan: "Standard",
    kind: "desktop",
    title: "Audit log",
    as: "owner",
    async run(r) {
      await r.go(`${S}/audit`);
      r.caption("Every change: who made it, and when");
      await r.wait(2600);
      await r.scroll(400);
      await r.wait(1400);
    },
  },

  /* ---------------- Settings and your brand ---------------- */
  {
    id: "c13-1",
    chapter: C.settings,
    plan: "Free",
    kind: "desktop",
    title: "Settings",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings`);
      r.caption("All your settings, grouped in one place");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: "Payments", exact: true }).first(), 1200);
      r.caption("Fees settle straight into the school's bank account", "Standard");
      await r.wait(2200);
      await r.click(p.getByRole("link", { name: "Plan & billing", exact: true }).first(), 1200);
      r.caption("Change plan any time; pay per student, per term");
      await r.wait(2400);
    },
  },
  {
    id: "c13-2",
    chapter: C.settings,
    plan: "Premium",
    kind: "desktop",
    title: "School colours",
    as: "owner",
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings`);
      await r.reveal(p.getByText("School colour").first());
      r.caption("Use your school's own colour across the whole app");
      await r.click(p.getByRole("radio", { name: "Royal blue" }).or(p.getByRole("button", { name: "Royal blue" })).first(), 500);
      await r.click(p.getByRole("button", { name: "Save colour" }), 2000);
      await r.wait(800);
      await r.go(`${S}`);
      r.caption("Staff, parents and students all see your school's colours");
      await r.wait(2600);
      // Back to Adalin orange for the rest of the recording.
      await r.offCamera(async () => {
        await p.goto(`${S}/settings`);
        await p.getByRole("radio", { name: "Adalin SchoolHub orange" }).or(p.getByRole("button", { name: "Adalin SchoolHub orange" })).first().click();
        await p.getByRole("button", { name: "Save colour" }).click();
        await p.waitForTimeout(1500);
      });
    },
  },
  {
    id: "c13-3",
    chapter: C.settings,
    plan: "Free",
    kind: "desktop",
    title: "Data & privacy",
    as: "owner",
    async run(r) {
      await r.go(`${S}/settings?tab=data`);
      r.caption("Your data is yours: download all of it any time");
      await r.wait(2400);
      r.caption("Built for Nigeria's data protection law (NDPA)");
      await r.wait(2200);
    },
  },

  /* ---------------- The parent app ---------------- */
  {
    id: "c14-1",
    chapter: C.parent,
    plan: "Basic",
    kind: "phone",
    title: "Parents",
    as: "parent",
    async run(r) {
      const p = r.page;
      await r.go("/p");
      r.caption("Every child, at a glance");
      await r.wait(2000);
      await r.scroll(600);
      r.caption("School news and the calendar on the home screen");
      await r.wait(2000);
      await r.go("/p");
      await r.click(p.getByRole("link", { name: /See Oluwaseun's records/ }), 1200);
      r.caption("Everything about each child, in one tap");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: /^Attendance/ }).first(), 1200);
      r.caption("Every day missed or late");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: /All about/ }).first(), 900);
      await r.click(p.getByRole("link", { name: /^Results/ }).first(), 1200);
      r.caption("Report cards to download");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: /All about/ }).first(), 900);
      await r.click(p.getByRole("link", { name: /^Homework/ }).first(), 1200);
      r.caption("Homework, marks and feedback", "Standard");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: "Updates" }).last(), 1200);
      r.caption("Every alert in one place");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: "Account" }).last(), 1200);
      r.caption("Parents choose SMS, WhatsApp or email");
      await r.wait(2200);
    },
  },

  /* ---------------- The student app ---------------- */
  {
    id: "c15-1",
    chapter: C.student,
    plan: "Standard",
    kind: "phone",
    title: "Students",
    as: "student",
    async run(r) {
      const p = r.page;
      await r.go("/learn");
      r.caption("Today's lessons, attendance and school news");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: "Timetable" }).last(), 1200);
      r.caption("The full week's timetable");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: "Homework" }).last(), 1200);
      r.caption("Homework to do, handed in, and marked");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: "Exams" }).last(), 1200);
      r.caption("CBT tests, coming up and done");
      await r.wait(2000);
      await r.click(p.getByRole("button", { name: "More", exact: true }), 700);
      await r.click(p.getByRole("navigation", { name: "App tabs" }).getByRole("link", { name: "Results" }), 1200);
      r.caption("Their own report cards");
      await r.wait(2000);
      await r.click(p.getByRole("button", { name: "More", exact: true }), 700);
      await r.click(p.getByRole("navigation", { name: "App tabs" }).getByRole("link", { name: "Library" }), 1200);
      r.caption("Library books and due dates", "Premium");
      await r.wait(2200);
    },
  },

  /* ---------------- Enterprise ---------------- */
  {
    id: "c16-1",
    chapter: C.enterprise,
    plan: "Enterprise",
    kind: "desktop",
    title: "Campuses",
    as: "enterprise",
    async run(r) {
      const p = r.page;
      await r.go("/schools?pick=1");
      r.caption("Run several campuses from one login");
      await r.wait(2000);
      await r.click(p.getByRole("link", { name: /Adalin Heights Schools/ }).first(), 1500);
      r.caption("Every campus side by side, with its own records and one group view");
      await r.wait(2600);
      await r.scroll(400);
      await r.wait(1600);
    },
  },
  {
    id: "c16-2",
    chapter: C.enterprise,
    plan: "Enterprise",
    kind: "desktop",
    title: "Staff sign-in",
    as: "enterprise",
    async run(r) {
      await r.go(`${HEIGHTS}/settings?tab=signin`);
      r.caption("Staff sign in with their Google or Microsoft work accounts");
      await r.wait(2600);
      await r.go(`${HEIGHTS}/settings?tab=domain`);
      r.caption("Put SchoolHub on your own web address, with your name and logo");
      await r.wait(2600);
    },
  },
  {
    id: "c16-3",
    chapter: C.enterprise,
    plan: "Enterprise",
    kind: "desktop",
    title: "API",
    as: "enterprise",
    async run(r) {
      const p = r.page;
      await r.go(`${HEIGHTS}/settings?tab=api`);
      r.caption("Connect your website and other systems with our API");
      await r.click(p.getByRole("button", { name: "New key" }), 700);
      const d = p.getByRole("dialog");
      await r.type(d.getByLabel("Name"), "School website");
      await r.click(d.getByRole("checkbox", { name: /Students and their parents/ }), 300);
      await r.click(d.getByRole("button", { name: "Create key" }), 1500);
      r.caption("Keys with exactly the access you choose");
      await r.wait(2000);
      await r.click(d.getByRole("button", { name: "Done" }), 800);
      r.caption("And webhooks that tell your systems the moment something happens");
      await r.wait(2200);
      await r.go("/developers");
      r.caption("Clear documentation for your developers");
      await r.wait(2000);
      await r.scroll(700);
      await r.wait(1800);
    },
  },
];

void runStoryboard("full", SCENES);
