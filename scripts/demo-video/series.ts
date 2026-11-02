/*
 * The section-by-section series: one short video per part of Adalin SchoolHub, for YouTube and for
 * Kola to point people to. Unlike the full walkthrough, every page, tab, menu and button is shown, and
 * each scene lists what it covers so scripts/demo-video/coverage.mjs can report anything missed.
 * Records against the demo server (scripts/demo-server.ts); edit with `pnpm demo:edit series`, which
 * writes one MP4 per episode under .data/demo-video/series/chapters/.
 *
 *   npx tsx scripts/demo-video/series.ts                    every episode
 *   npx tsx scripts/demo-video/series.ts "Getting started"  one episode
 *   npx tsx scripts/demo-video/series.ts e1-3               one scene
 */
import { expect } from "@playwright/test";
import { runStoryboard, S, type Recorder, type Scene } from "./kit";

/** Every episode, in series order (the order sets each episode's number). Recorded a few at a time. */
export const EPISODES = {
  start: "Getting started",
  overview: "The overview and analytics",
  setSchool: "Settings: your school",
  setMoney: "Settings: money",
  setPeople: "Settings: people, messages and operations",
  setAdvanced: "Settings: sign-in, data and advanced",
  academics: "Classes and subjects",
  staff: "Staff, roles and permissions",
  students: "Students",
  admissions: "Online admissions",
  attendance: "Attendance",
  timetable: "Timetable",
  results: "Results and report cards",
  pins: "Result PINs and the result checker",
  homework: "Assignments and lesson notes",
  cbt: "CBT exams",
  materials: "Learning materials",
  behaviour: "Behaviour and the library",
  care: "Transport, boarding and the sick bay",
  comms: "Announcements, calendar and messages",
  fees: "Fees and online payments",
  money: "Expenses and payroll",
  hr: "Staff attendance and leave",
  documents: "ID cards, certificates and verification",
  records: "Inventory and the audit log",
  kola: "Kola and the AI helpers",
  parent: "The parent app",
  student: "The student app",
  enterprise: "Enterprise: groups, API, sign-in and your own address",
} as const;

/** Point at each control in turn, with a caption, without pressing it. */
async function tour(r: Recorder, stops: [import("@playwright/test").Locator, string][], hold = 1500) {
  for (const [target, caption] of stops) {
    r.caption(caption);
    await r.point(target);
    await r.wait(hold);
  }
}

export const SCENES: Scene[] = [
  /* ---------------- Episode 1: Getting started ---------------- */
  {
    id: "e1-1",
    chapter: EPISODES.start,
    plan: "Free",
    kind: "desktop",
    title: "The website",
    covers: [
      "/",
      "/: How it works",
      "/: Pricing",
      "/: Log in",
      "/: Start free",
      "/: Create your school",
      "/: Log in to your school",
      "/: Try free for 30 days",
      "/: Parents",
      "/: Students",
      "/: Privacy",
      "/: Terms",
    ],
    async run(r) {
      const p = r.page;
      await r.go("/");
      r.caption("schoolhub.adalintech.com: where every school starts");
      await r.wait(2200);
      await tour(r, [
        [p.getByRole("link", { name: "How it works" }).first(), "How it works: a term with SchoolHub, from resumption to vacation"],
        [p.getByRole("link", { name: "Pricing" }).first(), "Pricing: per student, per term"],
        [p.getByRole("link", { name: "Log in", exact: true }).first(), "Log in: for schools already on SchoolHub"],
        [p.getByRole("link", { name: "Start free" }).last(), "Start free: create a new school"],
      ]);
      await tour(r, [
        [p.getByRole("link", { name: "Create your school" }).first(), "Create your school: the same as Start free"],
        [p.getByRole("link", { name: "Log in to your school" }), "Log in to your school: for staff"],
      ]);
      r.caption("How it works jumps to a term with SchoolHub: fees, the register, CA tests, report cards");
      await r.click(p.getByRole("link", { name: "How it works" }).first(), 1200);
      await r.wait(2400);
      await r.scroll(700);
      r.caption("Attendance, results, fees, parents and setup, explained one by one");
      await r.wait(1800);
      await r.scroll(900);
      await r.wait(1400);
      await r.scroll(900);
      await r.wait(1400);
      await r.scroll(900);
      r.caption("Everyone sees their own part, and only that");
      await r.wait(2000);
      r.caption("Pricing: four plans, per student per term. Free covers up to 50 students.");
      await r.click(p.getByRole("link", { name: "Pricing" }).first(), 1200);
      await r.wait(2400);
      await r.point(p.getByRole("link", { name: "Try free for 30 days" }).first());
      r.caption("Standard and Premium come with a free 30-day trial");
      await r.wait(2000);
      await r.scroll(1200);
      r.caption("The footer: product, company and sign-in links for parents and students");
      await r.wait(1400);
      await tour(r, [
        [p.getByRole("contentinfo").getByRole("link", { name: "Parents" }), "Parents sign in here"],
        [p.getByRole("contentinfo").getByRole("link", { name: "Students" }), "Students sign in here"],
        [p.getByRole("contentinfo").getByRole("link", { name: "Privacy" }), "Our privacy notice and terms"],
      ], 1200);
    },
  },
  {
    id: "e1-2",
    chapter: EPISODES.start,
    plan: "Free",
    kind: "desktop",
    title: "Create a school",
    saveAs: "newowner",
    covers: ["email: Welcome to SchoolHub", "/signup", "/signup: Create school", "/signup: Create your school", "/signup: Log in", "shared:terms-consent: terms", "shared:terms-consent: privacy notice", "shared:terms-consent: data processing agreement"],
    async run(r, ctx) {
      const p = r.page;
      await r.go("/signup");
      r.caption("Create your school: five details and you're in");
      await r.wait(1500);
      await r.type(p.getByLabel("School name"), "Adalin Model School");
      await r.type(p.getByLabel("Your full name"), "Mrs Adaeze Okafor");
      await r.type(p.getByLabel("Email"), "adaeze@adalinmodelschool.ng");
      await r.type(p.getByLabel("Password", { exact: true }), "ModelSchool2026");
      await r.type(p.getByLabel("Confirm password"), "ModelSchool2026");
      r.caption("Read the terms, privacy notice and data processing agreement, then accept");
      await r.point(p.getByRole("link", { name: /terms/i }).first());
      await r.wait(1200);
      await r.click(p.getByRole("checkbox", { name: /accepts the terms/ }), 400);
      r.caption("Already have a school? Log in instead.");
      await r.point(p.getByRole("link", { name: "Log in" }).last());
      await r.wait(1200);
      r.caption("Free for up to 50 students. No card needed.");
      await r.click(p.getByRole("button", { name: "Create school" }), 500);
      await r.offCamera(() => p.waitForURL(/welcome=1/, { timeout: 60_000 }));
      ctx.newSlug = new URL(p.url()).pathname.split("/")[2];
      r.caption("Your school is ready, and a welcome email is on its way");
      await r.wait(2200);
    },
  },
  {
    id: "e1-3",
    chapter: EPISODES.start,
    plan: "Free",
    kind: "desktop",
    title: "Your first steps",
    as: "newowner",
    covers: [
      "/s/[slug]",
      "/s/[slug]: Complete your school profile",
      "/s/[slug]: Set up classes and subjects",
      "/s/[slug]: Invite your staff",
      "/s/[slug]: Add your students",
      "shared:term-gate: Set up classes and terms",
    ],
    async run(r, ctx) {
      const p = r.page;
      await r.go(`/s/${ctx.newSlug ?? "adalin-model-school"}?welcome=1`);
      r.caption("A new school opens on a short checklist, in the order that works best");
      await r.wait(2400);
      await tour(r, [
        [p.getByRole("link", { name: /Complete your school profile/ }).first(), "1. Your school's name, logo, address and contacts"],
        [p.getByRole("link", { name: /Set up classes and subjects/ }).first(), "2. Classes, subjects, the session and terms"],
        [p.getByRole("link", { name: /Invite your staff/ }).first(), "3. Invite teachers and other staff"],
        [p.getByRole("link", { name: /Add your students/ }).first(), "4. Add students, one by one or from Excel"],
      ], 2000);
      r.caption("Each step ticks itself off as you finish it");
      await r.wait(1800);
    },
  },
  {
    id: "e1-4",
    chapter: EPISODES.start,
    plan: "Free",
    kind: "desktop",
    title: "Finding your way",
    as: "owner",
    covers: [
      "shared:sidebar-nav",
      "shared:sidebar-nav: Find a page in the menu",
      "shared:app-shell: Plan & billing",
      "shared:theme-switch: Light",
      "shared:theme-switch: Dark",
      "shared:text-size-switch: Small",
      "shared:text-size-switch: Default",
      "shared:text-size-switch: Large",
      "shared:kola-chat",
    ],
    async run(r) {
      const p = r.page;
      await r.go(S);
      r.caption("Every page is in the menu on the left, grouped by what it's for");
      await r.wait(2200);
      const nav = p.getByRole("navigation", { name: "Main" });
      for (const group of ["Academics", "Teaching", "Student life", "Communication", "Finance", "Administration"]) {
        const g = nav.getByRole("button", { name: new RegExp(`^${group}`) });
        if (await g.count()) {
          r.caption(`${group}: open it to see its pages`);
          await r.click(g.first(), 900);
          await r.wait(900);
        }
      }
      r.caption("Find any page fast: type part of its name (Ctrl K)");
      const find = p.getByRole("searchbox", { name: "Find a page in the menu" }).or(p.getByLabel("Find a page in the menu"));
      await r.type(find.first(), "fees");
      await r.wait(1600);
      await r.offCamera(() => find.first().fill(""));
      r.caption("Pages your plan doesn't include show a lock, with what it would unlock");
      await r.wait(1600);
      r.caption("Ask Kola, bottom right, how to do anything. It answers for your role.");
      await r.point(p.getByRole("button", { name: "Ask Kola for help" }));
      await r.wait(2000);
    },
  },
  {
    id: "e1-5",
    chapter: EPISODES.start,
    plan: "Free",
    kind: "desktop",
    title: "Logging in",
    covers: ["email: Password reset", "/login", "/login: Log in", "/login: Forgot password?", "/login: Privacy", "/login: Terms", "/login: Create a free account", "/login: Parent? Sign in here, no password needed", "/forgot-password", "/forgot-password: Send reset link", "/forgot-password: Back to log in", "shared:sso-buttons"],
    async run(r) {
      const p = r.page;
      await r.go("/login");
      r.caption("Staff log in with their email and password");
      await r.wait(1600);
      await tour(r, [
        [p.getByLabel("Email"), "Your work email"],
        [p.getByRole("button", { name: "Log in" }), "Log in"],
        [p.getByRole("link", { name: "Create a free account" }), "New school? Create a free account"],
        [p.getByRole("link", { name: /Parent\? Sign in here/ }), "Parents use their own sign-in, with no password"],
        [p.getByRole("link", { name: "Privacy" }), "Our privacy notice and terms, always one tap away"],
      ], 1300);
      const sso = p.getByRole("link", { name: /Continue with/ }).or(p.getByRole("button", { name: /Continue with/ }));
      if (await sso.count()) {
        r.caption("Schools that use Google or Microsoft accounts can sign in with them");
        await r.point(sso.first());
        await r.wait(1600);
      }
      r.caption("Forgot your password? Get a reset link by email.");
      await r.click(p.getByRole("link", { name: "Forgot password?" }), 900);
      await r.type(p.getByLabel("Email"), "adaeze@adalinmodelschool.ng");
      await r.click(p.getByRole("button", { name: "Send reset link" }), 1200);
      r.caption("The link arrives by email and works for an hour");
      await r.wait(2000);
      await r.point(p.getByRole("link", { name: "Back to log in" }));
      await r.wait(1000);
    },
  },
  {
    id: "e1-6",
    chapter: EPISODES.start,
    plan: "Free",
    kind: "desktop",
    title: "Your account",
    as: "owner",
    covers: ["/account", "/account: Your account", "/account: Disconnect", "/account: Save name", "/account: Change password", "/account: Sign out everywhere", "/account: Back to school"],
    async run(r) {
      const p = r.page;
      await r.go(S);
      r.caption("Your name, bottom left, opens your account");
      await r.click(p.getByRole("link", { name: /Olatunji Buari/ }).last(), 900);
      r.caption("Your account: your name, password and sign-ins");
      await r.wait(1800);
      await tour(r, [
        [p.getByRole("button", { name: "Save name" }), "Change the name schools see"],
        [p.getByRole("button", { name: "Change password" }), "Change your password"],
        [p.getByRole("button", { name: "Sign out everywhere" }), "Lost a phone? Sign out of every device at once"],
      ], 1500);
      r.caption("Signed in with Google or Microsoft? Disconnect it here any time.");
      await r.wait(1800);
      await r.point(p.getByRole("link", { name: "Back to school" }));
      r.caption("Back to school takes you where you were");
      await r.wait(1200);
    },
  },
  {
    id: "e1-7",
    chapter: EPISODES.start,
    plan: "Free",
    kind: "desktop",
    title: "More than one school",
    as: "enterprise",
    covers: ["/schools", "/schools: Your schools", "/schools: Add another school", "/schools: Log out", "/schools/new", "/schools/new: Add a school", "/schools/new: Create school", "/schools/new: Cancel"],
    async run(r) {
      const p = r.page;
      await r.go("/schools");
      r.caption("Run more than one school? Pick one here.");
      await r.wait(2000);
      await tour(r, [
        [p.getByRole("link", { name: "Add another school" }), "Add another school to the same login, up to five"],
        [p.getByRole("button", { name: "Log out" }).or(p.getByRole("link", { name: "Log out" })).first(), "Log out"],
      ], 1500);
      await r.click(p.getByRole("link", { name: "Add another school" }), 900);
      r.caption("Each school keeps its own records and its own plan");
      await r.wait(2400);
      await tour(r, [
        [p.getByLabel("School name"), "Name the new school"],
        [p.getByRole("button", { name: "Create school" }), "Create it, and switch between schools from the top of the menu"],
        [p.getByRole("link", { name: "Cancel" }), "Or cancel"],
      ], 1500);
      await expect(p.getByLabel("School name")).toBeVisible();
    },
  },

  /* ---------------- Episode 2: The overview and analytics ---------------- */
  {
    id: "e2-1",
    chapter: EPISODES.overview,
    plan: "Free",
    kind: "desktop",
    title: "Today",
    as: "owner",
    covers: [
      "/s/[slug]",
      "/s/[slug]#today",
      "/s/[slug]: Today",
      "/s/[slug]: Overview",
      "/s/[slug]: Add a student",
      "/s/[slug]: Import students",
      "/s/[slug]: Invite staff",
      "/s/[slug]: Classes & subjects",
      "/s/[slug]: View all",
    ],
    async run(r) {
      const p = r.page;
      await r.go(S);
      r.caption("The overview: the first page you see each day");
      await r.wait(2000);
      await r.point(p.getByRole("link", { name: "Today" }));
      r.caption("Today shows what's happening now. Analytics shows how the school is doing.");
      await r.wait(2200);
      r.caption("A greeting, the date, and where you are in the term and session");
      await r.wait(2000);
      const clock = p.getByRole("button", { name: /Clock in|Clock out/ });
      if (await clock.count()) {
        r.caption("Staff clock in and out right here when they arrive", "Standard");
        await r.point(clock.first());
        await r.wait(2000);
      }
      r.caption("Students (with girls and boys), staff, classes and the current term at a glance");
      await r.point(p.getByText("Students", { exact: true }).first());
      await r.wait(2400);
      await tour(r, [
        [p.getByRole("link", { name: /Add a student/ }).first(), "Shortcuts to the jobs you do most: add a student"],
        [p.getByRole("link", { name: /Import students/ }).first(), "Import a whole class list from Excel"],
        [p.getByRole("link", { name: /Invite staff/ }).first(), "Invite staff with a login link"],
        [p.getByRole("link", { name: /Classes & subjects/ }).first(), "Classes, arms, teachers and terms"],
      ], 1500);
      r.caption("Recent activity: what your team did, with who and when");
      await r.point(p.getByRole("heading", { name: "Recent activity" }));
      await r.wait(2200);
      r.caption("View all opens the full audit log", "Standard");
      await r.point(p.getByRole("link", { name: "View all" }));
      await r.wait(1600);
      const badge = p.getByRole("navigation", { name: "Main" }).locator("span").filter({ hasText: /^\d+$/ }).first();
      if (await badge.count()) {
        r.caption("Orange numbers in the menu are things waiting for you, like a lesson note to approve");
        await r.point(badge);
        await r.wait(2200);
      }
    },
  },
  {
    id: "e2-2",
    chapter: EPISODES.overview,
    plan: "Free",
    kind: "desktop",
    title: "A teacher's overview",
    as: "teacher",
    covers: ["journey: Each role sees its own overview"],
    async run(r) {
      await r.go(S);
      r.caption("Each person's overview fits their job. This is a class teacher's.");
      await r.wait(2600);
      r.caption("A shorter menu: only the pages a teacher's role allows");
      await r.point(r.page.getByRole("navigation", { name: "Main" }));
      await r.wait(2400);
      r.caption("And only the shortcuts they can use. A bursar or librarian sees their own.");
      await r.wait(2400);
    },
  },
  {
    id: "e2-3",
    chapter: EPISODES.overview,
    plan: "Premium",
    kind: "desktop",
    title: "Term summary",
    as: "owner",
    covers: [
      "/s/[slug]/analytics",
      "/s/[slug]#analytics",
      "/s/[slug]: Analytics",
      "/s/[slug]/analytics#overview",
      "/s/[slug]/analytics: Term summary",
      "/s/[slug]/analytics: Analytics",
      "/s/[slug]/analytics: Attendance",
      "/s/[slug]/analytics: Fees",
    ],
    async run(r) {
      const p = r.page;
      await r.go(S);
      r.caption("Analytics: how the school is doing, this term against last");
      await r.click(p.getByRole("link", { name: "Analytics" }).first(), 1200);
      await r.wait(1600);
      const term = p.getByLabel(/Term/).first();
      if (await term.count()) {
        r.caption("Pick any term to look back on");
        await r.point(term);
        await r.wait(1600);
      }
      r.caption("Average score, pass rate, attendance and fees collected, each with the change on last term");
      await r.wait(2800);
      await r.reveal(p.getByRole("heading", { name: "Results over time" }));
      r.caption("Results over time: hover any point for the exact figures");
      await r.wait(2400);
      await r.point(p.getByText("Show as a table").first());
      r.caption("Or show it as a table");
      await r.wait(1600);
      await r.reveal(p.getByRole("heading", { name: "Students who need attention" }));
      r.caption("The students who need attention, with the reason for each");
      await r.wait(2200);
      await r.reveal(p.getByRole("heading", { name: "Attendance by week" }));
      r.caption("Attendance by week, score sheets submitted, and students and admissions");
      await r.wait(2600);
    },
  },
  {
    id: "e2-4",
    chapter: EPISODES.overview,
    plan: "Premium",
    kind: "desktop",
    title: "Academics",
    as: "owner",
    covers: ["/s/[slug]/analytics#academics", "/s/[slug]/analytics: Academics"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/analytics`);
      r.caption("Academics: which subjects are strong and which need help");
      await r.click(p.getByRole("link", { name: "Academics" }).first(), 1200);
      await r.wait(1400);
      const cls = p.getByLabel("Class").first();
      if (await cls.count()) {
        r.caption("Narrow it to one class");
        await r.point(cls);
        await r.wait(1400);
      }
      r.caption("Subjects, weakest first, with their average, pass rate and change on last term");
      await r.wait(2600);
      await r.reveal(p.getByRole("heading", { name: "The weakest subjects over time" }));
      r.caption("The weakest subjects over time");
      await r.wait(2200);
      await r.reveal(p.getByRole("heading", { name: "Spread of scores this term" }));
      r.caption("How scores are spread this term");
      await r.wait(2200);
      await r.reveal(p.getByText("Class by subject", { exact: true }).first());
      r.caption("Every class by every subject in one table. Darker means higher.");
      await r.wait(2600);
    },
  },
  {
    id: "e2-5",
    chapter: EPISODES.overview,
    plan: "Premium",
    kind: "desktop",
    title: "Students at risk",
    as: "owner",
    covers: ["/s/[slug]/analytics#students", "/s/[slug]/analytics: Students at risk", "/s/[slug]/analytics: Low scores", "/s/[slug]/analytics: Falling", "/s/[slug]/analytics: See everyone flagged"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/analytics`);
      r.caption("Students at risk: SchoolHub flags who needs help before report cards go out");
      await r.click(p.getByRole("link", { name: "Students at risk" }).first(), 1200);
      await r.wait(1600);
      r.caption("Low scores, falling grades and poor attendance, counted separately");
      await r.wait(2400);
      await tour(r, [
        [p.getByLabel("Class").first(), "Filter by class"],
        [p.getByLabel("Reason").first(), "Or by the reason they were flagged"],
      ], 1400);
      await r.reveal(p.getByText("Students who need attention", { exact: true }).last());
      r.caption("Each student, why they were flagged, and their numbers. Open one to see the full picture.");
      await r.wait(2600);
    },
  },
  {
    id: "e2-6",
    chapter: EPISODES.overview,
    plan: "Premium",
    kind: "desktop",
    title: "Teachers",
    as: "owner",
    covers: ["/s/[slug]/analytics#teachers", "/s/[slug]/analytics: Teachers"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/analytics`);
      r.caption("Teachers: how every teacher is keeping up this term");
      await r.click(p.getByRole("link", { name: "Teachers" }).first(), 1200);
      await r.wait(1600);
      r.caption("Score sheets submitted, lesson notes sent and homework set, across the school");
      await r.wait(2400);
      await r.reveal(p.getByText("By teacher, least done first", { exact: true }).first());
      r.caption("Each teacher, least done first, so you know who to check on");
      await r.wait(2600);
    },
  },

  /* ---------------- Episode 3: Settings: your school ---------------- */
  {
    id: "e3-1",
    chapter: EPISODES.setSchool,
    plan: "Free",
    kind: "desktop",
    title: "The settings menu",
    as: "owner",
    covers: ["/s/[slug]/settings", "shared:settings-nav: Settings", "shared:settings-nav: School", "shared:settings-nav: Money", "shared:settings-nav: People & messages", "shared:settings-nav: Operations", "shared:settings-nav: Advanced", "shared:settings-nav: More"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings`);
      r.caption("Settings: everything about how your school runs, in one place");
      await r.wait(2200);
      r.caption("Grouped by area: your school, money, people and messages, operations, and advanced");
      await r.point(p.locator("text=Money >> visible=true").first());
      await r.wait(2400);
      r.caption("This episode covers the School group. The others have their own episodes.");
      await r.point(p.locator("text=School profile >> visible=true").first());
      await r.wait(2200);
    },
  },
  {
    id: "e3-2",
    chapter: EPISODES.setSchool,
    plan: "Free",
    kind: "desktop",
    title: "School profile",
    as: "owner",
    covers: [
      "/s/[slug]/settings#profile",
      "/s/[slug]/settings: School profile",
      "/s/[slug]/settings: Save profile",
      "/s/[slug]/settings: School name",
      "/s/[slug]/settings: Motto",
      "/s/[slug]/settings: Address",
      "/s/[slug]/settings: Choose logo image",
      "/s/[slug]/settings: School colour",
      "/s/[slug]/settings: Save colour",
      "/s/[slug]/settings: Upload logo",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=profile`);
      r.caption("School profile: these details appear on report cards, receipts and letters");
      await r.wait(2200);
      await tour(r, [
        [p.getByLabel("School name"), "The school's name, type and curriculum"],
        [p.getByLabel("Address"), "Address, city, state and country"],
        [p.getByLabel("Phone"), "Phone and email parents can reach"],
        [p.getByLabel("Admission number prefix"), "The start of every admission number, like ADC"],
      ], 1500);
      await r.type(p.getByLabel("Motto"), "Knowledge, character and service");
      r.caption("Change anything, then save");
      await r.click(p.getByRole("button", { name: "Save profile" }), 1200);
      await r.wait(1400);
      await r.reveal(p.getByRole("button", { name: "Upload logo" }));
      r.caption("Upload logo: shown on every page, report card, receipt and ID card");
      await r.wait(2200);
      await r.reveal(p.getByRole("heading", { name: "School colour" }));
      r.caption("School colour: the app, report cards and the parent app in your colours", "Premium");
      await r.wait(2600);
      r.caption("Pick one of these, or any colour by its code, see the preview, then Save colour", "Premium");
      await r.point(p.getByRole("button", { name: "Save colour" }));
      await r.wait(2400);
    },
  },
  {
    id: "e3-4",
    chapter: EPISODES.setSchool,
    plan: "Standard",
    kind: "desktop",
    title: "AI & Kola",
    as: "owner",
    covers: [
      "/s/[slug]/settings#ai",
      "/s/[slug]/settings: AI & Kola",
      "/s/[slug]/settings: AI helpers and Kola",
      "/s/[slug]/settings: Use AI helpers",
      "/s/[slug]/settings: Let parents ask Kola",
      "/s/[slug]/settings: AI requests used today",
      "/s/[slug]/settings: Most AI use today",
      "/s/[slug]/settings: Save",
      "/s/[slug]/settings#grading",
      "/s/[slug]/settings: Grading & assessment",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=profile`);
      r.caption("Grading & assessment opens in Classes and subjects, covered in its own episode", "Free");
      await r.point(p.getByRole("link", { name: "Grading & assessment" }).first());
      await r.wait(2200);
      r.caption("AI & Kola: switch the AI helpers on or off for the whole school");
      await r.click(p.getByRole("link", { name: "AI & Kola" }).first(), 1200);
      await r.wait(1600);
      await tour(r, [
        [p.getByLabel("Use AI helpers"), "Drafting test questions, report card comments and reading Excel headings"],
        [p.getByLabel("Let parents ask Kola"), "Let parents ask Kola about the parent app"],
      ], 2200);
      r.caption("Used today: the school's AI requests so far, out of its daily allowance");
      await r.point(p.getByText("Used today").first());
      await r.wait(2400);
      r.caption("Each staff member gets 30 a day and each parent 10, so no one uses it all. It resets at midnight.");
      await r.wait(2800);
      r.caption("Once AI has been used, the people using it most are listed here too");
      await r.wait(2000);
      await r.point(p.getByRole("button", { name: "Save" }));
      r.caption("Save when you change anything");
      await r.wait(1400);
    },
  },
  {
    id: "e3-5",
    chapter: EPISODES.setSchool,
    plan: "Enterprise",
    kind: "desktop",
    title: "Web address",
    as: "enterprise",
    covers: ["/s/[slug]/settings#domain", "/s/[slug]/settings: Web address", "/s/[slug]/settings: Your own web address", "/s/[slug]/settings: Your school's address", "/s/[slug]/settings: Add this record", "/s/[slug]/settings: Check now", "/s/[slug]/settings: Change", "/s/[slug]/settings: Stop using it"],
    async run(r) {
      const p = r.page;
      await r.go("/s/adalin-heights-school-ikoyi/settings?tab=domain");
      r.caption("Web address: put SchoolHub on your own school address", "Enterprise");
      await r.wait(2400);
      r.caption("Type the address you want, for example portal.adalinheights.edu.ng, and save");
      await r.type(p.getByLabel("Your school's address").first(), "portal.adalinheights.edu.ng");
      await r.click(p.getByRole("button", { name: "Save" }), 1500);
      await r.wait(1200);
      const record = p.getByRole("heading", { name: "Add this record" });
      if (await record.count()) {
        await r.reveal(record);
        r.caption("Add the one record shown here where your domain is managed, and it goes live");
        await r.wait(2600);
      }
      await tour(r, [
        [p.getByRole("button", { name: "Check now" }), "Check now tests whether the record has taken effect"],
        [p.getByRole("button", { name: "Change" }), "Change the address"],
        [p.getByRole("button", { name: "Stop using it" }), "Or stop using it. Your usual SchoolHub address keeps working either way."],
      ], 1800);
    },
  },
];

if (require.main === module) {
  void runStoryboard("series", SCENES);
}
