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
];

if (require.main === module) {
  void runStoryboard("series", SCENES);
}
