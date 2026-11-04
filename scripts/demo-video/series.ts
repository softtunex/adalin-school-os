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
      // Start from no address, so the scene can be re-recorded: clear any saved one off camera.
      const stop = p.getByRole("button", { name: "Stop using it" });
      if (await stop.count()) {
        await r.offCamera(async () => {
          await stop.click();
          const confirm = p.getByRole("dialog").getByRole("button", { name: /Stop using it|Remove|Yes/ });
          if (await confirm.count()) await confirm.first().click();
          await p.waitForLoadState("networkidle");
          await p.reload();
        });
      }
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
        [p.getByRole("button", { name: "Check now", exact: true }), "Check now tests whether the record has taken effect"],
        [p.getByRole("button", { name: "Change", exact: true }), "Change: use a different address"],
        [p.getByRole("button", { name: "Stop using it", exact: true }), "Or stop using it. Your usual SchoolHub address keeps working either way."],
      ], 1800);
    },
  },

  /* ---------------- Episode 4: Settings: money ---------------- */
  {
    id: "e4-1",
    chapter: EPISODES.setMoney,
    plan: "Basic",
    kind: "desktop",
    title: "Payments",
    as: "owner",
    covers: [
      "/s/[slug]/settings#payments",
      "/s/[slug]/settings: Payments",
      "/s/[slug]/settings: Where fees are paid into",
      "/s/[slug]/settings: Bank",
      "/s/[slug]/settings: Account number",
      "/s/[slug]/settings: Update account",
      "/s/[slug]/settings: Collection rules",
      "/s/[slug]/settings: Hold results until fees are paid",
      "/s/[slug]/settings: Send reminders automatically",
      "/s/[slug]/settings: Remind each family at most every",
      "/s/[slug]/settings: Note at the bottom of invoices (optional)",
      "/s/[slug]/settings: Save rules",
      "journey: Connect the school's bank account for online fees",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=payments`);
      r.caption("Payments: where school fees go, and how SchoolHub collects them");
      await r.wait(2200);
      r.caption("Where fees are paid into: the school's own bank account", "Standard");
      await r.point(p.getByLabel("Bank"));
      await r.wait(2000);
      await tour(r, [
        [p.getByLabel("Account number"), "The account number. SchoolHub checks the account name with the bank for you."],
        [p.getByRole("button", { name: "Update account" }), "Save it once. Parents' online payments then go straight to the school, never through Adalin."],
      ], 2400);
      r.caption("Paystack takes its small fee per payment. SchoolHub takes nothing.", "Standard");
      await r.wait(2400);
      await r.reveal(p.getByText("Collection rules", { exact: true }).first());
      r.caption("Collection rules: how SchoolHub follows up on what's owed");
      await r.wait(1800);
      await tour(r, [
        [p.getByLabel(/Hold results until fees are paid/), "Hold results: parents who still owe can't see that term's report card"],
        [p.getByLabel(/Send reminders automatically/), "Send reminders by email on weekday mornings. Switch it on to choose how often."],
      ], 2400);
      await r.type(p.getByLabel("Note at the bottom of invoices (optional)"), "Pay by transfer to the school account, or online with a card.");
      r.caption("A note printed at the bottom of every invoice");
      await r.click(p.getByRole("button", { name: "Save rules" }), 1200);
      await r.wait(1400);
    },
  },
  {
    id: "e4-2",
    chapter: EPISODES.setMoney,
    plan: "Free",
    kind: "desktop",
    title: "Plan & billing",
    as: "owner",
    covers: [
      "/s/[slug]/settings#plan",
      "/s/[slug]/settings: Plan & billing",
      "/s/[slug]/settings: Plans",
      "/s/[slug]/settings: Move to Basic",
      "/s/[slug]/settings: Move to Standard",
      "/s/[slug]/settings: Stay on Premium",
      "/s/[slug]/settings: Confirm",
      "/s/[slug]/settings: Cancel",
      "/s/[slug]/settings: Done",
      "/s/[slug]/settings: Bills",
      "/s/[slug]/settings: Pay ₦100,800",
      "/s/[slug]/settings: +234 905 208 6394",
      "journey: Upgrade the plan, and move to a cheaper one next term",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=plan`);
      r.caption("Plan & billing: your plan, what each plan includes, and your SchoolHub bills");
      await r.wait(2400);
      r.caption("Every plan is priced per student, per term. Here's what each one adds.");
      await r.reveal(p.getByRole("heading", { name: "Plans" }));
      await r.wait(2600);
      r.caption("Upgrades start straight away. A cheaper plan starts next term, so nothing is lost mid-term.");
      await r.click(p.getByRole("button", { name: "Move to Standard" }), 900);
      await r.wait(2200);
      await r.point(p.getByRole("dialog").getByRole("button", { name: "Cancel" }).first());
      r.caption("The cost is shown before you confirm. Cancel, or Confirm.");
      await r.wait(1400);
      await r.click(p.getByRole("dialog").getByRole("button", { name: "Confirm" }).first(), 1200);
      await r.wait(1600);
      await r.click(p.getByRole("dialog").getByRole("button", { name: "Done" }).first(), 900);
      r.caption("Changed your mind before next term? Stay on your plan with one click.");
      await r.click(p.getByRole("button", { name: "Stay on Premium" }), 900);
      await r.wait(1200);
      await r.click(p.getByRole("dialog").getByRole("button", { name: "Confirm" }).first(), 1200);
      await r.wait(1400);
      // The page refreshes and the pop-up closes itself once the plan is kept.
      const done = p.getByRole("dialog").getByRole("button", { name: "Done" });
      if (await done.isVisible().catch(() => false)) await r.click(done.first(), 900);
      r.caption("Back on Premium, as if nothing changed");
      await r.wait(1600);
      const bill = p.getByRole("button", { name: /^Pay ₦/ }).first();
      if (await bill.count()) {
        await r.reveal(bill);
        r.caption("Bills: one per term, for the students on roll. Pay online with Paystack.");
        await r.wait(2600);
      }
      const wa = p.getByRole("link", { name: "+234 905 208 6394" });
      if (await wa.count()) {
        await r.reveal(wa);
        r.caption("Questions about plans? WhatsApp Adalin straight from here.");
        await r.wait(2200);
      }
    },
  },
  {
    id: "e4-3",
    chapter: EPISODES.setMoney,
    plan: "Free",
    kind: "desktop",
    title: "Support access",
    as: "owner",
    covers: ["/s/[slug]/settings: Let Adalin support in", "/s/[slug]/settings: What do you need help with?", "/s/[slug]/settings: For how long", "/s/[slug]/settings: 24 hours", "/s/[slug]/settings: 3 days", "/s/[slug]/settings: Let support in"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=plan`);
      await r.offCamera(() => p.getByRole("heading", { name: "Let Adalin support in" }).scrollIntoViewIfNeeded());
      r.caption("Need help? Let Adalin support into your school, only when you choose");
      await r.wait(2400);
      await tour(r, [
        [p.getByLabel("What do you need help with?"), "Say what you need help with"],
        [p.getByText("24 hours", { exact: true }), "Choose how long: 24 hours"],
        [p.getByText("3 days", { exact: true }), "or 3 days. Access ends by itself."],
        [p.getByRole("button", { name: "Let support in", exact: true }), "Every step support takes shows in your audit log"],
      ], 1900);
    },
  },
  {
    id: "e4-4",
    chapter: EPISODES.setMoney,
    plan: "Basic",
    kind: "desktop",
    title: "Add-ons",
    as: "owner",
    covers: ["/s/[slug]/settings#addons", "/s/[slug]/settings: Add-ons", "/s/[slug]/settings: Order", "/s/[slug]/settings: Your add-ons", "/s/[slug]/settings: SMS and WhatsApp credits", "/s/[slug]/settings: Buy credits under Messaging"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=addons`);
      r.caption("Add-ons: extras you can order without changing plan");
      await r.wait(2400);
      r.caption("School colours below Premium, guided setup, on-site training, and printed result PIN cards");
      await r.point(p.getByRole("button", { name: "Order" }).first());
      await r.wait(2800);
      await r.reveal(p.getByText("Your add-ons", { exact: true }).first());
      r.caption("What you've ordered shows under Your add-ons");
      await r.wait(2000);
      const credits = p.getByRole("link", { name: "Buy credits under Messaging" });
      if (await credits.count()) {
        await r.reveal(credits);
        r.caption("Message credits are bought under Messaging, covered in the next episode");
        await r.wait(2200);
      }
    },
  },

  /* ---------------- Episode 5: Settings: people, messages and operations ---------------- */
  {
    id: "e5-1",
    chapter: EPISODES.setPeople,
    plan: "Standard",
    kind: "desktop",
    title: "Messaging",
    as: "owner",
    covers: [
      "/s/[slug]/settings#messaging",
      "/s/[slug]/settings: Messaging",
      "/s/[slug]/settings: SMS credits",
      "/s/[slug]/settings: Buy for ₦2,500",
      "/s/[slug]/settings: Alerts and messaging",
      "/s/[slug]/settings: Absence alerts",
      "/s/[slug]/settings: Results published",
      "/s/[slug]/settings: Payment receipts",
      "/s/[slug]/settings: Also send these alerts by SMS",
      "/s/[slug]/settings: Parents can message teachers",
      "/s/[slug]/settings: Students can see their own results",
      "/s/[slug]/settings: Only during set hours",
      "/s/[slug]/settings: From",
      "/s/[slug]/settings: To",
      "/s/[slug]/settings: SMS sender name (optional)",
      "/s/[slug]/settings: Save settings",
      "/s/[slug]/settings: Recently sent",
      "journey: Buy message credits",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=messaging`);
      r.caption("Messaging: text message credits, automatic alerts to parents, and who can message whom");
      await r.wait(2600);
      r.caption("Your credit balance, and what was sent in the last 30 days");
      await r.wait(2000);
      r.caption("Buy credits in packs. Bigger packs cost less per message. Pay online with Paystack.", "Standard");
      await r.point(p.getByRole("button", { name: /^Buy for ₦/ }).first());
      await r.wait(2600);
      await r.reveal(p.getByRole("heading", { name: "Alerts and messaging" }));
      r.caption("Alerts and messaging: what parents are told automatically");
      await r.wait(1800);
      await tour(r, [
        [p.getByLabel(/^Absence alerts/).first(), "Absence alerts: parents hear within minutes when a child is marked absent"],
        [p.getByLabel(/^Results published/).first(), "Results published: parents are told when the report card is ready"],
        [p.getByLabel(/^Payment receipts/).first(), "Payment receipts: every payment, cash or online, gets a receipt"],
        [p.getByLabel(/^Also send these alerts by SMS/).first(), "Also by SMS, for parents who aren't on the app. Uses credits."],
        [p.getByLabel(/^Parents can message teachers/).first(), "Parents can message their child's class teacher from the parent app"],
        [p.getByLabel(/^Students can see their own results/).first(), "Students can see their own report cards in the student portal"],
      ], 2200);
      const hours = p.getByLabel(/^Only during set hours/).first();
      r.caption("Only during set hours: parents can read messages any time, but only send within these hours");
      const was = await hours.isChecked();
      if (!was) await r.click(hours, 900);
      await r.wait(1200);
      await tour(r, [
        [p.getByLabel("From", { exact: true }), "From"],
        [p.getByLabel("To", { exact: true }), "To"],
      ], 1300);
      if (!was) await r.offCamera(() => hours.uncheck());
      await tour(r, [
        [p.getByLabel("SMS sender name (optional)"), "Your own sender name, like ADALIN, once it's registered. Until then texts come from SchoolHub."],
        [p.getByRole("button", { name: "Save settings" }), "Save settings"],
      ], 2400);
      const recent = p.getByRole("heading", { name: "Recently sent" });
      if (await recent.count()) {
        await r.reveal(recent);
        r.caption("Recently sent: every email and text, and whether it arrived. Failed texts are refunded.");
        await r.wait(2600);
      }
    },
  },
  {
    id: "e5-2",
    chapter: EPISODES.setPeople,
    plan: "Standard",
    kind: "desktop",
    title: "Admissions",
    as: "owner",
    covers: [
      "/s/[slug]/settings#admissions",
      "/s/[slug]/settings: Admissions",
      "/s/[slug]/settings: Admission form",
      "/s/[slug]/settings: Taking applications",
      "/s/[slug]/settings: Every class",
      "/s/[slug]/settings: Entrance exam",
      "/s/[slug]/settings: Interview",
      "/s/[slug]/settings: Exam and interview",
      "/s/[slug]/settings: No assessment",
      "/s/[slug]/settings: Application form fee (₦)",
      "/s/[slug]/settings: Welcome message (optional)",
      "/s/[slug]/settings: Entrance exam details (optional)",
      "/s/[slug]/settings: Save",
      "/s/[slug]/settings: Your admission link",
      "/s/[slug]/settings: Copy",
      "/s/[slug]/settings: Open the form",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=admissions`);
      r.caption("Admissions: set up the online application form");
      await r.wait(2200);
      await tour(r, [
        [p.getByLabel(/^Taking applications/).first(), "Taking applications: switch it off and the form says admissions are closed"],
        [p.getByLabel("Every class", { exact: true }), "Which classes you're admitting into: every class, or only some"],
        [p.getByText("Entrance exam", { exact: true }).first(), "How you assess applicants: an entrance exam"],
        [p.getByText("Interview", { exact: true }).first(), "an interview"],
        [p.getByText("Exam and interview", { exact: true }).first(), "either or both"],
        [p.getByText("No assessment", { exact: true }).first(), "or straight from application to offer"],
        [p.getByLabel("Application form fee (₦)"), "A form fee, paid online when the parent applies. Leave it at 0 for free."],
        [p.getByLabel("Welcome message (optional)"), "A welcome message at the top of the form"],
        [p.getByLabel("Entrance exam details (optional)"), "Exam details: date, venue, what to bring"],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 1900);
      await r.reveal(p.getByRole("heading", { name: "Your admission link" }));
      r.caption("Your admission link: share it on WhatsApp, your website or social media");
      await r.click(p.getByRole("button", { name: "Copy", exact: true }), 900);
      await r.wait(1600);
      r.caption("Open the form to see what parents see. The full journey is in the Online admissions episode.");
      await r.point(p.getByRole("link", { name: "Open the form" }));
      await r.wait(2400);
    },
  },
  {
    id: "e5-3",
    chapter: EPISODES.setPeople,
    plan: "Standard",
    kind: "desktop",
    title: "Staff & HR",
    as: "owner",
    covers: [
      "/s/[slug]/settings#hr",
      "/s/[slug]/settings: Staff & HR",
      "/s/[slug]/settings: Staff hours and leave",
      "/s/[slug]/settings: School resumes",
      "/s/[slug]/settings: Late after",
      "/s/[slug]/settings: Closing time",
      "/s/[slug]/settings: Mon",
      "/s/[slug]/settings: Sat",
      "/s/[slug]/settings: Annual leave",
      "/s/[slug]/settings: Sick leave",
      "/s/[slug]/settings: Casual leave",
      "/s/[slug]/settings: Maternity leave",
      "/s/[slug]/settings: Paternity leave",
      "/s/[slug]/settings: Compassionate leave",
      "/s/[slug]/settings: Study leave",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=hr`);
      r.caption("Staff & HR: working hours for clocking in, and how much leave each staff member gets");
      await r.wait(2400);
      await tour(r, [
        [p.getByLabel("School resumes"), "When the school day starts"],
        [p.getByLabel("Late after"), "Staff who clock in after this are marked late"],
        [p.getByLabel("Closing time"), "Closing time"],
        [p.getByLabel("Mon", { exact: true }), "The working days. Tick Saturday if staff come in on Saturdays."],
        [p.getByLabel("Annual leave"), "Leave allowances, in days per year: annual"],
        [p.getByLabel("Sick leave"), "sick"],
        [p.getByLabel("Casual leave"), "casual"],
        [p.getByLabel("Maternity leave"), "maternity and paternity"],
        [p.getByLabel("Compassionate leave"), "compassionate"],
        [p.getByLabel("Study leave"), "and study leave. SchoolHub counts what's left when staff ask for leave."],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 1700);
    },
  },
  {
    id: "e5-4",
    chapter: EPISODES.setPeople,
    plan: "Premium",
    kind: "desktop",
    title: "Payroll",
    as: "owner",
    covers: [
      "/s/[slug]/settings#payroll",
      "/s/[slug]/settings: Payroll",
      "/s/[slug]/settings: Pay day",
      "/s/[slug]/settings: Deduct PAYE",
      "/s/[slug]/settings: Pension",
      "/s/[slug]/settings: National Housing Fund",
      "/s/[slug]/settings: Record paid payroll in Expenses",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=payroll`);
      r.caption("Payroll: when staff are paid, and what's deducted");
      await r.wait(2200);
      await tour(r, [
        [p.getByLabel("Pay day"), "Pay day: the day of the month salaries go out"],
        [p.getByLabel(/^Deduct PAYE/).first(), "PAYE tax, worked out on the Nigeria Tax Act 2025 bands"],
        [p.getByLabel(/^Pension/).first(), "Pension: 8% from staff, 10% from the school"],
        [p.getByLabel(/^National Housing Fund/).first(), "National Housing Fund: 2.5% of basic pay"],
        [p.getByLabel(/^Record paid payroll in Expenses/).first(), "Paid payroll goes into Expenses as salaries, so the school's accounts stay complete"],
      ], 2300);
      r.caption("Save. Payslips then show every deduction.");
      await r.click(p.getByRole("button", { name: "Save", exact: true }), 1200);
      await r.wait(1800);
    },
  },
  {
    id: "e5-5",
    chapter: EPISODES.setPeople,
    plan: "Basic",
    kind: "desktop",
    title: "Behaviour",
    as: "owner",
    covers: [
      "/s/[slug]/settings#behaviour",
      "/s/[slug]/settings: Behaviour",
      "/s/[slug]/settings: Merit categories",
      "/s/[slug]/settings: Incident categories",
      "/s/[slug]/settings: Tell parents about incidents",
      "/s/[slug]/settings: Tell parents about merits too (good news travels)",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=behaviour`);
      r.caption("Behaviour: the merits and incidents your teachers can record");
      await r.wait(2200);
      await tour(r, [
        [p.getByLabel("Merit categories"), "Merit categories, one per line. Change them to suit your school."],
        [p.getByLabel("Incident categories"), "Incident categories, one per line"],
        [p.getByLabel("Tell parents about incidents"), "Tell parents about every incident, only serious ones, or never automatically"],
        [p.getByLabel(/Tell parents about merits too/).first(), "And good news too, if you like"],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 2000);
    },
  },
  {
    id: "e5-5b",
    chapter: EPISODES.setPeople,
    plan: "Premium",
    kind: "desktop",
    title: "Library and inventory",
    as: "owner",
    covers: [
      "/s/[slug]/settings#library",
      "/s/[slug]/settings: Library",
      "/s/[slug]/settings: Loan length (days)",
      "/s/[slug]/settings: Books per borrower",
      "/s/[slug]/settings: Fine per day late (₦)",
      "/s/[slug]/settings#inventory",
      "/s/[slug]/settings: Inventory",
      "/s/[slug]/settings: Categories",
      "/s/[slug]/settings: Rooms and places",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=library`);
      r.caption("Library: the lending rules");
      await r.wait(1800);
      await tour(r, [
        [p.getByLabel("Loan length (days)"), "How many days a book can be borrowed for"],
        [p.getByLabel("Books per borrower"), "How many books one person can have at a time"],
        [p.getByLabel("Fine per day late (₦)"), "A fine for each day late. Leave it at 0 for none."],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 2000);
      await r.go(`${S}/settings?tab=inventory`);
      r.caption("Inventory: how the school's property is grouped");
      await r.wait(1800);
      await tour(r, [
        [p.getByLabel("Categories"), "Categories, like furniture, ICT and lab equipment"],
        [p.getByLabel("Rooms and places"), "Rooms and places, so you know where everything is"],
        [p.getByLabel(/offer to add it to Expenses/).first(), "When new stock has a cost, offer to record it in Expenses"],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 2000);
    },
  },
  {
    id: "e5-6",
    chapter: EPISODES.setPeople,
    plan: "Premium",
    kind: "desktop",
    title: "Sick bay, transport and boarding",
    as: "owner",
    covers: [
      "/s/[slug]/settings#health",
      "/s/[slug]/settings: Sick bay",
      "/s/[slug]/settings: Medicines kept",
      "/s/[slug]/settings: Tell parents",
      "/s/[slug]/settings#transport",
      "/s/[slug]/settings: Transport",
      "/s/[slug]/settings: Tell parents in the app when their child is marked on the bus",
      "/s/[slug]/settings#hostel",
      "/s/[slug]/settings: Boarding",
      "/s/[slug]/settings: Parents can ask for an exeat in the app",
      "/s/[slug]/settings: Text parents when their child signs out of school and back in",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=health`);
      r.caption("Sick bay: the medicines the school keeps, and when parents hear about a visit");
      await r.wait(2200);
      await tour(r, [
        [p.getByLabel("Medicines kept"), "Medicines kept, one per line. The nurse picks from this list."],
        [p.getByLabel("Tell parents"), "Tell parents after every visit, only when a child is sent home or referred, or never"],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 2200);
      await r.go(`${S}/settings?tab=transport`);
      r.caption("Transport");
      await r.wait(1400);
      await tour(r, [
        [p.getByLabel(/marked on the bus/).first(), "Tell parents in the app when their child gets on the school bus"],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 2200);
      await r.go(`${S}/settings?tab=hostel`);
      r.caption("Boarding");
      await r.wait(1400);
      await tour(r, [
        [p.getByLabel(/ask for an exeat/).first(), "Parents can ask for an exeat in the app. The warden approves it."],
        [p.getByLabel(/signs out of school and back in/).first(), "Text parents when a boarder signs out and comes back"],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 2400);
    },
  },
  {
    id: "e5-7",
    chapter: EPISODES.setPeople,
    plan: "Premium",
    kind: "desktop",
    title: "Documents",
    as: "owner",
    covers: [
      "/s/[slug]/settings#documents",
      "/s/[slug]/settings: Documents",
      "/s/[slug]/settings: Name",
      "/s/[slug]/settings: Title",
      "/s/[slug]/settings: Upload",
      "/s/[slug]/settings: Remove",
      "/s/[slug]/settings: Add a signatory",
      "/s/[slug]/settings: ID card note",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=documents`);
      r.caption("Documents: who signs your certificates, testimonials and letters");
      await r.wait(2400);
      await tour(r, [
        [p.getByLabel("Name", { exact: true }).first(), "Each signatory's name"],
        [p.getByLabel("Title", { exact: true }).first(), "their title, like Principal"],
        [p.getByText("Upload", { exact: true }).first(), "and a photo of their signature"],
        [p.getByRole("button", { name: "Remove" }).first(), "Remove a signatory"],
        [p.getByRole("button", { name: "Add a signatory" }), "or add another"],
        [p.getByLabel("ID card note"), "A note printed on the back of every ID card"],
        [p.getByRole("button", { name: "Save", exact: true }), "Save"],
      ], 2000);
    },
  },

  /* ---------------- Episode 6: Settings: sign-in, data and advanced ---------------- */
  {
    id: "e6-1",
    chapter: EPISODES.setAdvanced,
    plan: "Enterprise",
    kind: "desktop",
    title: "Campuses",
    as: "enterprise",
    covers: [
      "/s/[slug]/settings#campuses",
      "/s/[slug]/settings: Campuses",
      "/s/[slug]/settings: Open the group dashboard",
      "/s/[slug]/settings: Remove",
      "/s/[slug]/settings: Add a campus",
      "/s/[slug]/settings: New campus",
      "/s/[slug]/settings: Add campus",
      "/s/[slug]/settings: Or bring in a school you already run",
    ],
    async run(r) {
      const p = r.page;
      await r.go("/s/adalin-heights-school-ikoyi/settings?tab=campuses");
      r.caption("Campuses: run several schools as one group");
      await r.wait(2400);
      r.caption("Every campus in the group, each with its own students, staff and fees");
      await r.wait(2200);
      await tour(r, [
        [p.getByRole("link", { name: "Open the group dashboard" }), "The group dashboard shows every campus side by side"],
        [p.getByRole("button", { name: "Remove" }).first(), "Remove a campus from the group. Its records stay safe in that school."],
        [p.getByLabel("New campus"), "Add a new campus by name"],
        [p.getByRole("button", { name: "Add campus" }), "and it's set up with the group's plan"],
      ], 2300);
      const bring = p.getByLabel("Or bring in a school you already run");
      if (await bring.count()) {
        r.caption("Or bring in a school you already run on SchoolHub");
        await r.point(bring);
        await r.wait(2200);
      }
      r.caption("The group dashboard itself is in the Enterprise episode");
      await r.wait(1800);
    },
  },
  {
    id: "e6-2",
    chapter: EPISODES.setAdvanced,
    plan: "Enterprise",
    kind: "desktop",
    title: "Staff sign-in",
    as: "enterprise",
    covers: [
      "/s/[slug]/settings#signin",
      "/s/[slug]/settings: Staff sign-in",
      "/s/[slug]/settings: Staff must log in with their work account",
      "/s/[slug]/settings: Which accounts",
      "/s/[slug]/settings: Google",
      "/s/[slug]/settings: Microsoft",
      "/s/[slug]/settings: Save sign-in rule",
    ],
    async run(r) {
      const p = r.page;
      await r.go("/s/adalin-heights-school-ikoyi/settings?tab=signin");
      r.caption("Staff sign-in: make staff use their school Google or Microsoft account");
      await r.wait(2400);
      const must = p.getByLabel(/^Staff must log in with their work account/).first();
      const was = await must.isChecked();
      r.caption("Switch it on, and staff can no longer sign in with a password");
      if (!was) await r.click(must, 900);
      await r.wait(1800);
      await tour(r, [
        [p.getByLabel("Google", { exact: true }), "Choose which accounts count: Google"],
        [p.getByLabel("Microsoft", { exact: true }), "Microsoft, or both"],
      ], 1800);
      r.caption("Proprietors can always use their password, so the school can't be locked out");
      await r.wait(2400);
      r.caption("Save sign-in rule");
      await r.point(p.getByRole("button", { name: "Save sign-in rule" }));
      await r.wait(1600);
      if (!was) await r.offCamera(() => must.uncheck());
    },
  },
  {
    id: "e6-3",
    chapter: EPISODES.setAdvanced,
    plan: "Enterprise",
    kind: "desktop",
    title: "API & webhooks",
    as: "enterprise",
    covers: [
      "/s/[slug]/settings#api",
      "/s/[slug]/settings: API & webhooks",
      "/s/[slug]/settings: API documentation",
      "/s/[slug]/settings: API keys",
      "/s/[slug]/settings: New key",
      "/s/[slug]/settings: Create key",
      "/s/[slug]/settings: Revoke",
      "/s/[slug]/settings: Revoke key",
      "/s/[slug]/settings: Webhooks",
      "/s/[slug]/settings: Add webhook",
      "/s/[slug]/settings: Address",
      "/s/[slug]/settings: Send a test",
      "/s/[slug]/settings: Switch off",
      "/s/[slug]/settings: Remove",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go("/s/adalin-heights-school-ikoyi/settings?tab=api");
      r.caption("API & webhooks: connect your website, accounting software or other systems");
      await r.wait(2400);
      r.caption("Developers: the API documentation explains every endpoint");
      await r.point(p.getByRole("link", { name: "API documentation" }));
      await r.wait(2000);

      r.caption("API keys let another system read from SchoolHub. They can only read, and only your school.");
      await r.click(p.getByRole("button", { name: "New key" }), 900);
      await r.wait(800);
      await r.type(dialog.getByLabel("Name"), "School website");
      r.caption("Name it after the system that uses it, then choose what it can read");
      await r.click(dialog.getByLabel(/^Students and their parents/).first(), 700);
      await r.click(dialog.getByLabel(/^Classes and terms/).first(), 700);
      await r.click(dialog.getByRole("button", { name: "Create key" }), 1200);
      r.caption("The full key is shown once. Copy it into the other system now.");
      await r.wait(2800);
      await r.click(dialog.getByRole("button", { name: "Done" }), 900);
      r.caption("Each key shows what it can read and when it was last used");
      await r.wait(2000);
      r.caption("Revoke a key and anything using it stops straight away");
      await r.click(p.getByRole("button", { name: "Revoke", exact: true }).first(), 900);
      await r.wait(1200);
      await r.click(dialog.getByRole("button", { name: "Revoke key" }), 1200);
      await r.wait(1400);

      await r.reveal(p.getByRole("heading", { name: "Webhooks", exact: true }));
      r.caption("Webhooks: SchoolHub tells your other systems the moment something happens");
      await r.wait(2200);
      await r.click(p.getByRole("button", { name: "Add webhook" }), 900);
      await r.wait(800);
      await r.type(dialog.getByLabel("Address"), "https://accounts.adalinheights.edu.ng/schoolhub");
      r.caption("Where to send it, and when: a new student, a payment, published results");
      await r.click(dialog.getByLabel(/^A fee payment is recorded/).first(), 700);
      await r.click(dialog.getByLabel(/^A student is added/).first(), 700);
      await r.click(dialog.getByRole("button", { name: "Add webhook" }), 1200);
      r.caption("A signing secret, shown once, so your system can check each message really came from SchoolHub");
      await r.wait(3000);
      await r.click(dialog.getByRole("button", { name: "Done" }), 900);
      await tour(r, [
        [p.getByRole("button", { name: "Send a test" }), "Send a test to check your system receives it"],
        [p.getByRole("button", { name: "Switch off" }), "Switch it off for a while"],
      ], 2000);
      r.caption("Or remove it. Every delivery shows here, and failed ones retry for about 9 hours.");
      await r.click(p.getByRole("button", { name: "Remove", exact: true }).first(), 900);
      await r.wait(1200);
      await r.click(dialog.getByRole("button", { name: "Remove", exact: true }), 1200);
      await r.wait(1600);
    },
  },
  {
    id: "e6-4",
    chapter: EPISODES.setAdvanced,
    plan: "Free",
    kind: "desktop",
    title: "Data & privacy",
    as: "owner",
    covers: [
      "/s/[slug]/settings#data",
      "/s/[slug]/settings: Data & privacy",
      "/s/[slug]/settings: Download all your data",
      "/s/[slug]/settings: Download everything",
      "/s/[slug]/settings: When someone asks for their data",
      "/s/[slug]/settings: How Adalin looks after your data",
      "/s/[slug]/settings: Downloads",
      "journey: Download all the school's data",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/settings?tab=data`);
      r.caption("Data & privacy: your school's data belongs to your school");
      await r.wait(2400);
      r.caption("Download everything: students, staff, results, attendance, fees, all as spreadsheets in one ZIP");
      await r.point(p.getByRole("link", { name: "Download everything" }));
      await r.wait(2600);
      const download = p.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
      await r.click(p.getByRole("link", { name: "Download everything" }), 900);
      r.caption("Keep it, move to another system, or hand it to an auditor. Passwords and PINs are left out.");
      await download;
      await r.wait(2400);
      await r.reveal(p.getByRole("heading", { name: "When someone asks for their data" }));
      r.caption("When a parent or staff member asks for their own data, download it from their profile");
      await r.wait(3000);
      await r.reveal(p.getByRole("heading", { name: "How Adalin looks after your data" }));
      r.caption("How Adalin looks after your data: encrypted, never sold, never used for advertising");
      await r.wait(3000);
      await r.offCamera(() => p.reload());
      await r.reveal(p.getByRole("heading", { name: "Downloads" }));
      r.caption("Every download is listed here, and in the activity log");
      await r.wait(2600);
    },
  },
];

if (require.main === module) {
  void runStoryboard("series", SCENES);
}
