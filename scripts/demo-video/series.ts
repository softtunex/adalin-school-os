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
import path from "node:path";
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

/**
 * Show a PDF the app makes (report card, receipt, payslip…). The recording browser can't display PDFs,
 * so the file is fetched with the signed-in session and drawn with PDF.js, then scrolled through.
 * `source` is the PDF's link, or a function that fetches it (e.g. a form post).
 */
async function showPdf(r: Recorder, source: string | (() => Promise<import("@playwright/test").APIResponse>), caption: string, hold = 3000) {
  const p = r.page;
  const back = p.url();
  await r.offCamera(async () => {
    const res = typeof source === "string" ? await p.request.get(source) : await source();
    if (!res.ok() || !(res.headers()["content-type"] ?? "").includes("pdf")) throw new Error(`PDF request returned ${res.status()} ${res.headers()["content-type"]}`);
    const b64 = (await res.body()).toString("base64");
    await p.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;background:#e9e7e4}#pages{display:flex;flex-direction:column;align-items:center;gap:24px;padding:32px 0 64px}
      canvas{box-shadow:0 8px 28px rgba(0,0,0,.18);background:#fff}</style>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script></head>
      <body><div id="pages"></div><script>
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      (async () => {
        const data = Uint8Array.from(atob("${b64}"), (c) => c.charCodeAt(0));
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          // A computer screen shows the whole page; a phone fits its width and scrolls.
          const fitW = Math.min(1100, innerWidth - 24) / base.width;
          const scale = (innerWidth < 700 ? fitW : Math.min(fitW, (innerHeight - 64) / base.height)) * devicePixelRatio;
          const vp = page.getViewport({ scale });
          const c = document.createElement("canvas");
          c.width = vp.width; c.height = vp.height;
          c.style.width = vp.width / devicePixelRatio + "px"; c.style.height = vp.height / devicePixelRatio + "px";
          document.getElementById("pages").appendChild(c);
          await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        }
        document.body.dataset.ready = "1";
      })();</script></body></html>`);
    await p.waitForSelector("body[data-ready]", { timeout: 30_000 });
  });
  r.caption(caption);
  await r.wait(hold);
  const tall = await p.evaluate(() => document.body.scrollHeight > innerHeight + 40);
  if (tall) {
    await p.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
    await r.wait(2200);
  }
  await r.offCamera(() => p.goto(back));
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

  /* ---------------- Episode 7: Classes and subjects ---------------- */
  {
    id: "e7-1",
    chapter: EPISODES.academics,
    plan: "Free",
    kind: "desktop",
    title: "Classes",
    as: "owner",
    covers: [
      "/s/[slug]/academics",
      "/s/[slug]/academics: Classes",
      "/s/[slug]/academics: Add class level",
      "/s/[slug]/academics: Class level name",
      "/s/[slug]/academics: Section",
      "/s/[slug]/academics: Arms",
      "/s/[slug]/academics: Add arm",
      "/s/[slug]/academics: Arm name",
      "/s/[slug]/academics: Add class",
      "/s/[slug]/academics: Done",
      "/s/[slug]/academics: Edit class",
      "/s/[slug]/academics: Class teacher",
      "/s/[slug]/academics: Capacity (optional)",
      "/s/[slug]/academics: Save class",
      "/s/[slug]/academics: Remove class",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/academics`);
      // Start clean, so the scene can be re-recorded: remove an Emerald arm left by an earlier take.
      const left = p.getByRole("button", { name: "Actions for JSS 1 Emerald" });
      if (await left.count()) {
        await r.offCamera(async () => {
          await left.click();
          await p.getByRole("menuitem", { name: "Remove class" }).click();
          await dialog.getByRole("button", { name: "Remove class" }).click();
          await left.waitFor({ state: "detached" });
        });
      }
      r.caption("Academics: your classes, subjects, teachers and terms, all in one place");
      await r.wait(2600);
      r.caption("At a glance: how many classes, subjects and students, and the current term");
      await r.wait(2400);
      r.caption("Classes are grouped by level. Each level can have several arms, like Gold and Diamond.");
      await r.wait(2600);

      r.caption("Add a class level, like Primary 4 or Year 7");
      await r.click(p.getByRole("button", { name: "Add class level" }), 900);
      await tour(r, [
        [dialog.getByLabel("Class level name"), "Its name"],
        [dialog.getByLabel("Section"), "Which section it belongs to"],
        [dialog.getByLabel("Arms"), "and its arms, separated by commas"],
      ], 1700);
      await r.click(dialog.getByRole("button", { name: "Close" }), 700);

      r.caption("Add an arm to a level that already exists");
      await r.click(p.getByRole("button", { name: "Add arm" }).first(), 900);
      await r.type(dialog.getByLabel("Arm name"), "Emerald");
      await r.click(dialog.getByRole("button", { name: "Add class" }), 1200);
      await r.wait(1000);
      await r.click(dialog.getByRole("button", { name: "Done" }), 900);
      r.caption("JSS 1 Emerald is ready for students");
      await r.wait(1800);

      r.caption("Each class has an actions menu");
      await r.click(p.getByRole("button", { name: "Actions for JSS 1 Emerald" }), 700);
      await r.click(p.getByRole("menuitem", { name: "Edit class" }), 900);
      await tour(r, [
        [dialog.getByRole("combobox").first(), "The class teacher takes the register and writes report card comments"],
        [dialog.getByRole("spinbutton").first(), "and how many students the class can take"],
        [dialog.getByRole("button", { name: "Save class" }), "Save class"],
      ], 2000);
      await r.click(dialog.getByRole("button", { name: "Close" }), 700);

      r.caption("Remove a class you don't need. A class with students must be emptied first.");
      await r.click(p.getByRole("button", { name: "Actions for JSS 1 Emerald" }), 700);
      await r.click(p.getByRole("menuitem", { name: "Remove class" }), 900);
      await r.wait(1400);
      await r.click(dialog.getByRole("button", { name: "Remove class" }), 1200);
      await r.wait(1600);
    },
  },
  {
    id: "e7-2",
    chapter: EPISODES.academics,
    plan: "Free",
    kind: "desktop",
    title: "Subjects",
    as: "owner",
    covers: [
      "/s/[slug]/academics#subjects",
      "/s/[slug]/academics: Subjects",
      "/s/[slug]/academics: All subjects",
      "/s/[slug]/academics: Add subject",
      "/s/[slug]/academics: Subject name",
      "/s/[slug]/academics: Code",
      "/s/[slug]/academics: Offered in",
      "/s/[slug]/academics: Elective",
      "/s/[slug]/academics: Edit subject",
      "/s/[slug]/academics: Save subject",
      "/s/[slug]/academics: Remove subject",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/academics?tab=subjects`);
      r.caption("Subjects: every subject the school teaches, and the classes that take it");
      await r.wait(2600);
      r.caption("Add a subject");
      await r.click(p.getByRole("button", { name: "Add subject" }), 900);
      await r.type(dialog.getByLabel("Subject name"), "Robotics");
      await r.type(dialog.getByLabel("Code"), "ROB");
      r.caption("Tick the levels that offer it");
      await r.click(dialog.getByLabel("JSS 1", { exact: true }), 600);
      await r.click(dialog.getByLabel("JSS 2", { exact: true }), 600);
      r.caption("Elective: only the students who choose it take it, and only they get a score for it");
      await r.click(dialog.getByLabel("Elective").first(), 900);
      await r.wait(1200);
      await r.click(dialog.getByRole("button", { name: "Add subject" }), 1200);
      await r.wait(800);
      await r.click(dialog.getByRole("button", { name: "Done" }), 900);
      const row = p.getByRole("button", { name: "Actions for Robotics" });
      await r.reveal(row);
      r.caption("Robotics is now on the list");
      await r.wait(1600);
      r.caption("Edit a subject to change its name, code or classes");
      await r.click(row, 700);
      await r.click(p.getByRole("menuitem", { name: "Edit subject" }), 900);
      await r.point(dialog.getByRole("button", { name: "Save subject" }));
      await r.wait(1800);
      await r.click(dialog.getByRole("button", { name: "Close" }), 700);
      r.caption("Or remove it. It's taken off every class, with its teachers.");
      await r.click(row, 700);
      await r.click(p.getByRole("menuitem", { name: "Remove subject" }), 900);
      await r.wait(1600);
      await r.click(dialog.getByRole("button", { name: "Remove subject" }), 1200);
      await r.wait(1600);
    },
  },
  {
    id: "e7-3",
    chapter: EPISODES.academics,
    plan: "Free",
    kind: "desktop",
    title: "Subject teachers",
    as: "owner",
    covers: ["/s/[slug]/academics#teachers", "/s/[slug]/academics: Subject teachers", "/s/[slug]/academics: Class", "/s/[slug]/academics: Teacher", "/s/[slug]/academics: Not assigned"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/academics?tab=teachers`);
      r.caption("Subject teachers: who teaches each subject in each class");
      await r.wait(2400);
      r.caption("Pick a class");
      await r.select(p.getByRole("combobox", { name: /^Class/ }), { label: "JSS 2 Gold" });
      await r.wait(1600);
      r.caption("Each subject the class takes, and how many have a teacher");
      await r.wait(2000);
      const selects = p.getByRole("combobox", { name: "Teacher" });
      const free = await r.offCamera(() => selects.evaluateAll((els) => els.findIndex((e) => (e as HTMLSelectElement).value === "")));
      if (free >= 0) {
        const target = selects.nth(free);
        const name = await r.offCamera(() => target.evaluate((e) => (e as HTMLSelectElement).options[1].text));
        r.caption("Choose a teacher. It saves straight away.");
        await r.select(target, { label: name });
        await r.wait(2000);
        r.caption("That teacher now enters this subject's scores, and sees the class on their timetable");
        await r.wait(2400);
        await r.offCamera(() => target.selectOption(""));
      }
    },
  },
  {
    id: "e7-4",
    chapter: EPISODES.academics,
    plan: "Free",
    kind: "desktop",
    title: "Electives",
    as: "owner",
    covers: ["/s/[slug]/academics#electives", "/s/[slug]/academics: Electives", "/s/[slug]/academics: All", "/s/[slug]/academics: None", "/s/[slug]/academics: Save electives"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/academics?tab=electives`);
      r.caption("Electives: which students take which optional subjects");
      await r.wait(2400);
      r.caption("Every student in the class, with a tick for each elective they take");
      await r.wait(2400);
      r.caption("Tick one student at a time");
      await r.click(p.getByRole("checkbox").first(), 900);
      await r.wait(800);
      await r.click(p.getByRole("checkbox").first(), 900);
      await tour(r, [
        [p.getByRole("button", { name: "All", exact: true }).first(), "or tick the whole class with All"],
        [p.getByRole("button", { name: "None", exact: true }).first(), "and clear it with None"],
        [p.getByRole("button", { name: "Save electives" }), "Save electives. Report cards only show the subjects each student takes."],
      ], 2200);
    },
  },
  {
    id: "e7-5",
    chapter: EPISODES.academics,
    plan: "Free",
    kind: "desktop",
    title: "Sessions & terms",
    as: "owner",
    covers: [
      "/s/[slug]/academics#terms",
      "/s/[slug]/academics: Sessions & terms",
      "/s/[slug]/academics: New session",
      "/s/[slug]/academics: Session",
      "/s/[slug]/academics: Create session",
      "/s/[slug]/academics: Set dates",
      "/s/[slug]/academics: Resumes",
      "/s/[slug]/academics: Vacates",
      "/s/[slug]/academics: Save dates",
      "/s/[slug]/academics: Make current term",
      "/s/[slug]/academics: Make current",
      "/s/[slug]/academics: Promote students",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/academics?tab=terms`);
      r.caption("Sessions & terms: the school year, and which term you're in");
      await r.wait(2400);
      r.caption("Set each term's dates");
      await r.click(p.getByRole("button", { name: "Actions for First Term" }).first(), 700);
      await r.click(p.getByRole("menuitem", { name: "Set dates" }), 900);
      await tour(r, [
        [dialog.getByLabel("Resumes"), "When it resumes"],
        [dialog.getByLabel("Vacates"), "and when it vacates. Report cards and the calendar use them."],
      ], 1900);
      await r.click(dialog.getByRole("button", { name: "Save dates" }), 1200);
      await r.wait(800);
      await r.click(dialog.getByRole("button", { name: "Done" }), 900);
      r.caption("When a term ends, make the next one current");
      await r.click(p.getByRole("button", { name: "Actions for Second Term" }).first(), 700);
      await r.click(p.getByRole("menuitem", { name: "Make current term" }), 900);
      r.caption("From then on, attendance, scores and fees go against the new term");
      await r.wait(2400);
      await r.click(dialog.getByRole("button", { name: "Cancel" }), 700);
      r.caption("At the end of the year, start a new session. Its three terms are made for you.");
      await r.click(p.getByRole("button", { name: "New session" }), 900);
      await r.point(dialog.getByLabel("Session"));
      await r.wait(1800);
      await r.point(dialog.getByRole("button", { name: "Create session" }));
      await r.wait(1400);
      await r.click(dialog.getByRole("button", { name: "Close" }), 700);
      r.caption("Then promote students to their next class. That's covered in the Students episode.");
      await r.point(p.getByRole("link", { name: "Promote students" }));
      await r.wait(2400);
    },
  },
  {
    id: "e7-6",
    chapter: EPISODES.academics,
    plan: "Free",
    kind: "desktop",
    title: "Assessment & grading",
    as: "owner",
    covers: [
      "/s/[slug]/academics#assessment",
      "/s/[slug]/academics: Assessment & grading",
      "/s/[slug]/academics: Continuous assessment and exam",
      "/s/[slug]/academics: 20 / 20 / 60",
      "/s/[slug]/academics: 40 / 60",
      "/s/[slug]/academics: 30 / 70",
      "/s/[slug]/academics: 10 / 10 / 20 / 60",
      "/s/[slug]/academics: Add column",
      "/s/[slug]/academics: Save assessment",
      "/s/[slug]/academics: Grading scale",
      "/s/[slug]/academics: WAEC (A1 to F9)",
      "/s/[slug]/academics: A to F (A from 70)",
      "/s/[slug]/academics: British (A* to U)",
      "/s/[slug]/academics: Grade",
      "/s/[slug]/academics: Minimum score",
      "/s/[slug]/academics: Remark",
      "/s/[slug]/academics: Counts as pass",
      "/s/[slug]/academics: Add grade",
      "/s/[slug]/academics: Save grading scale",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/academics?tab=assessment`);
      r.caption("Assessment & grading: how each subject's score is made up, and the grades");
      await r.wait(2400);
      r.caption("The columns teachers fill in: here two CAs of 20 and an exam of 60");
      await r.point(p.getByLabel("Component 1 name"));
      await r.wait(2200);
      r.caption("Or start from a common split");
      await tour(r, [
        [p.getByRole("button", { name: "40 / 60" }), "40 / 60"],
        [p.getByRole("button", { name: "30 / 70" }), "30 / 70"],
        [p.getByRole("button", { name: "10 / 10 / 20 / 60" }), "or four columns"],
      ], 1300);
      r.caption("Add a column, like a project or a test");
      await r.click(p.getByRole("button", { name: "Add column" }), 900);
      await r.wait(1400);
      await r.offCamera(() => p.reload());
      r.caption("Save assessment. If scores already exist, SchoolHub warns you before anything is lost.");
      await r.point(p.getByRole("button", { name: "Save assessment" }));
      await r.wait(2600);
      await r.reveal(p.getByRole("heading", { name: "Grading scale" }));
      r.caption("Grading scale: the grade for each score");
      await r.wait(1800);
      await tour(r, [
        [p.getByRole("button", { name: "WAEC (A1 to F9)" }), "Use WAEC grades"],
        [p.getByRole("button", { name: "A to F (A from 70)" }), "A to F"],
        [p.getByRole("button", { name: "British (A* to U)" }), "or British grades"],
        [p.getByLabel("Grade").first(), "Or set your own: the grade"],
        [p.getByLabel("Minimum score").first(), "the lowest score that earns it"],
        [p.getByLabel("Remark").first(), "the remark printed on the report card"],
        [p.getByLabel("Counts as pass").first(), "and whether it counts as a pass"],
        [p.getByRole("button", { name: "Add grade" }), "Add a grade"],
        [p.getByRole("button", { name: "Save grading scale" }), "Save grading scale"],
      ], 1600);
    },
  },

  /* ---------------- Episode 8: Staff, roles and permissions ---------------- */
  {
    id: "e8-1",
    chapter: EPISODES.staff,
    plan: "Free",
    kind: "desktop",
    title: "Staff",
    as: "owner",
    covers: [
      "/s/[slug]/staff",
      "/s/[slug]/staff: All staff",
      "/s/[slug]/staff: Search name, email or title…",
      "/s/[slug]/staff: Role",
      "/s/[slug]/staff: Status",
      "/s/[slug]/staff: Export CSV",
      "/s/[slug]/staff: Edit roles",
      "/s/[slug]/staff: Save roles",
      "/s/[slug]/staff: Deactivate",
      "/s/[slug]/staff: Reactivate",
      "/s/[slug]/staff: Download their data",
      "journey: Give a staff member a role, and take it away",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/staff`);
      r.caption("Staff: everyone who works at the school, and what each person can do");
      await r.wait(2600);
      r.caption("How many staff, who's active, invitations waiting, and the places your plan allows");
      await r.wait(2600);
      r.caption("Search by name, email or job title");
      await r.type(p.getByPlaceholder("Search name, email or title…"), "Adeyemi");
      await r.wait(1600);
      await r.offCamera(() => p.goto(`${S}/staff`));
      await tour(r, [
        [p.getByRole("combobox", { name: /^Role/ }), "Filter by role"],
        [p.getByRole("combobox", { name: /^Status/ }), "or by status: active or deactivated"],
        [p.getByRole("link", { name: "Export CSV" }), "Export the list as a spreadsheet"],
      ], 1900);

      const row = p.getByRole("button", { name: "Actions for Mrs Funmilayo Adeyemi" });
      r.caption("Each person has an actions menu. Give Mrs Adeyemi a second role: Librarian.");
      await r.click(row, 700);
      await r.click(p.getByRole("menuitem", { name: "Edit roles" }), 900);
      r.caption("Roles decide which screens and buttons someone sees. A person can have more than one.");
      await r.wait(2000);
      await r.click(dialog.getByLabel(/^Librarian/), 800);
      await r.click(dialog.getByRole("button", { name: "Save roles" }), 1200);
      await r.wait(1200);
      await r.click(dialog.getByRole("button", { name: "Close" }), 800);
      r.caption("She now has the Library in her menu, alongside her classes");
      await r.wait(2400);
      r.caption("Take a role away the same way");
      await r.click(row, 700);
      await r.click(p.getByRole("menuitem", { name: "Edit roles" }), 900);
      await r.click(dialog.getByLabel(/^Librarian/), 800);
      await r.click(dialog.getByRole("button", { name: "Save roles" }), 1200);
      await r.wait(1000);
      await r.click(dialog.getByRole("button", { name: "Close" }), 800);

      r.caption("When someone leaves, deactivate them. They can't sign in, but their records stay.");
      await r.click(row, 700);
      await r.point(p.getByRole("menuitem", { name: "Deactivate" }));
      await r.wait(2200);
      r.caption("Download their data if they ask for it. Reactivate brings a deactivated person back.");
      await r.point(p.getByRole("menuitem", { name: "Download their data" }));
      await r.wait(2400);
      await p.keyboard.press("Escape");
      await r.wait(600);
    },
  },
  {
    id: "e8-2",
    chapter: EPISODES.staff,
    plan: "Free",
    kind: "desktop",
    title: "Invite staff",
    as: "owner",
    covers: [
      "/s/[slug]/staff: Invite staff",
      "/s/[slug]/staff: Full name",
      "/s/[slug]/staff: Email",
      "/s/[slug]/staff: Job title (optional)",
      "/s/[slug]/staff: Send invitation",
      "/s/[slug]/staff: Invitation link",
      "/s/[slug]/staff: Done",
      "/s/[slug]/staff: Pending invitations",
      "/s/[slug]/staff: Cancel invitation",
      "email: Staff invitation",
    ],
    async run(r, ctx) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/staff`);
      // Start clean: cancel an invitation left by an earlier take.
      if (await p.getByText("ngozi.adeleke@demo.adalinschoolhub.ng").count()) {
        await r.offCamera(async () => {
          await p.getByRole("button", { name: "More actions" }).last().click();
          await p.getByRole("menuitem", { name: "Cancel invitation" }).click();
          await dialog.getByRole("button", { name: "Cancel invitation" }).click();
          await p.getByText("ngozi.adeleke@demo.adalinschoolhub.ng").waitFor({ state: "detached" });
        });
      }
      r.caption("Invite a new teacher");
      await r.click(p.getByRole("button", { name: "Invite staff" }), 900);
      await r.type(dialog.getByLabel("Full name"), "Mrs Ngozi Adeleke");
      await r.type(dialog.getByLabel("Email"), "ngozi.adeleke@demo.adalinschoolhub.ng");
      await r.type(dialog.getByLabel("Job title (optional)"), "English teacher");
      r.caption("Choose her role: Subject teacher");
      await r.click(dialog.getByLabel(/^Subject teacher/), 900);
      await r.wait(800);
      await r.click(dialog.getByRole("button", { name: "Send invitation" }), 1500);
      r.caption("She gets an email invitation. You can also send her this link on WhatsApp.");
      const link = dialog.getByRole("textbox").first();
      await r.point(link);
      ctx.invite = await link.inputValue();
      await r.wait(3000);
      await r.click(dialog.getByRole("button", { name: "Done" }), 900);
      const pending = p.getByRole("heading", { name: "Pending invitations" });
      await r.reveal(pending);
      r.caption("Pending invitations: the link works once and expires in 7 days");
      await r.wait(2400);
      r.caption("Changed your mind? Cancel the invitation from its menu.");
      await r.click(p.getByRole("button", { name: "More actions" }).last(), 700);
      await r.point(p.getByRole("menuitem", { name: "Cancel invitation" }));
      await r.wait(2200);
      await p.keyboard.press("Escape");
    },
  },
  {
    id: "e8-3",
    chapter: EPISODES.staff,
    plan: "Free",
    kind: "desktop",
    title: "Joining the school",
    covers: [
      "/invite/[token]",
      "/invite/[token]: Your full name",
      "/invite/[token]: Create a password",
      "/invite/[token]: Confirm password",
      "/invite/[token]: Accept and join",
      "journey: Invite a teacher, who joins and sees only their screens",
    ],
    async run(r, ctx) {
      const p = r.page;
      if (!ctx.invite) throw new Error("Record e8-2 first: it makes the invitation link.");
      await r.go(new URL(ctx.invite).pathname);
      r.caption("Mrs Adeleke opens the link from her email");
      await r.wait(2400);
      r.caption("Her name is filled in. She creates a password.");
      await r.point(p.getByLabel("Your full name"));
      await r.wait(1400);
      await r.type(p.getByLabel("Create a password"), "Adeleke2026");
      await r.type(p.getByLabel("Confirm password"), "Adeleke2026");
      await r.click(p.getByRole("button", { name: "Accept and join" }), 1500);
      await r.offCamera(() => p.waitForURL(/\/s\//, { timeout: 60_000 }));
      r.caption("She's in. As a subject teacher she sees only what she needs: her classes, scores and lessons.");
      await r.wait(3200);
      r.caption("No fees, payroll or settings. Those belong to other roles.");
      await r.point(p.locator("nav, aside").first());
      await r.wait(2800);
    },
  },
  {
    id: "e8-4",
    chapter: EPISODES.staff,
    plan: "Premium",
    kind: "desktop",
    title: "Roles & permissions",
    as: "owner",
    covers: [
      "/s/[slug]/roles",
      "/s/[slug]/roles: Staff roles",
      "/s/[slug]/roles: Parent and student access",
      "/s/[slug]/roles: New role",
      "/s/[slug]/roles: Role name",
      "/s/[slug]/roles: What this role is for (optional)",
      "/s/[slug]/roles: Permissions",
      "/s/[slug]/roles: Create role",
      "/s/[slug]/roles: Edit",
      "/s/[slug]/roles: Save role",
      "/s/[slug]/roles: Delete",
      "/s/[slug]/roles: Delete role",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/roles`);
      // Start clean: delete an Exams officer role left by an earlier take.
      const left = p.getByRole("heading", { name: "Exams officer" });
      if (await left.count()) {
        await r.offCamera(async () => {
          await p.locator("section, div").filter({ has: left }).getByRole("button", { name: "Delete" }).last().click();
          await dialog.getByRole("button", { name: "Delete role" }).click();
          await left.waitFor({ state: "detached" });
        });
      }
      r.caption("Roles & permissions: what each role can see and do");
      await r.wait(2600);
      r.caption("SchoolHub comes with the usual school roles, from Proprietor to Storekeeper");
      await r.reveal(p.getByRole("heading", { name: "Storekeeper" }));
      await r.wait(2200);
      r.caption("Parents and students have their own apps, with only their child's or their own records");
      await r.reveal(p.getByRole("heading", { name: "Parent and student access" }));
      await r.wait(2400);
      r.caption("Need a role that isn't there? Make your own.", "Premium");
      await r.click(p.getByRole("button", { name: "New role" }), 900);
      await r.type(dialog.getByLabel("Role name"), "Exams officer");
      await r.type(dialog.getByLabel("What this role is for (optional)"), "Runs exams and publishes results");
      r.caption("Tick exactly what it can do");
      for (const name of ["View results", "Review results", "Publish results", "Manage result checker PINs"]) {
        await r.click(dialog.getByLabel(name, { exact: true }), 500);
      }
      await r.wait(800);
      r.caption("You can only give permissions you have yourself");
      await r.wait(2000);
      await r.click(dialog.getByRole("button", { name: "Create role" }), 1500);
      await r.offCamera(async () => {
        const close = dialog.getByRole("button", { name: /Done|Close/ }).first();
        if (await close.isVisible().catch(() => false)) await close.click();
      });
      const role = p.getByRole("heading", { name: "Exams officer" });
      await r.reveal(role);
      r.caption("Exams officer is ready to give to any staff member");
      await r.wait(2200);
      const card = p.locator("section, div").filter({ has: role });
      r.caption("Edit it any time. Everyone with the role gets the change straight away.");
      await r.point(card.getByRole("button", { name: "Edit" }).last());
      await r.wait(2200);
      r.caption("Or delete it");
      await r.click(card.getByRole("button", { name: "Delete" }).last(), 900);
      await r.wait(1200);
      await r.click(dialog.getByRole("button", { name: "Delete role" }), 1200);
      await r.wait(1600);
    },
  },

  /* ---------------- Episode 9: Students ---------------- */
  {
    id: "e9-1",
    chapter: EPISODES.students,
    plan: "Free",
    kind: "desktop",
    title: "The student list",
    as: "owner",
    covers: [
      "/s/[slug]/students",
      "/s/[slug]/students: All students",
      "/s/[slug]/students: Search name or admission no…",
      "/s/[slug]/students: Class",
      "/s/[slug]/students: Status",
      "/s/[slug]/students: Export CSV",
      "/s/[slug]/students: Promote",
      "/s/[slug]/students: Logins",
      "/s/[slug]/students: Import",
      "/s/[slug]/students: Add student",
      "/s/[slug]/students: View profile",
      "/s/[slug]/students: Edit details",
      "/s/[slug]/students: Mark as graduated",
      "/s/[slug]/students: Suspend",
      "/s/[slug]/students: Withdraw",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/students`);
      r.caption("Students: every student in the school, with their class and parents");
      await r.wait(2600);
      r.caption("Search by name or admission number");
      await r.type(p.getByPlaceholder("Search name or admission no…"), "Lawal");
      await r.wait(1800);
      await r.offCamera(() => p.goto(`${S}/students`));
      r.caption("Show one class");
      await r.select(p.getByRole("combobox", { name: /^Class/ }), { label: "JSS 1 Gold" });
      await r.wait(1800);
      await r.offCamera(() => p.goto(`${S}/students`));
      await tour(r, [
        [p.getByRole("combobox", { name: /^Status/ }), "Or students who have graduated, left or been suspended"],
        [p.getByRole("link", { name: "Export CSV" }), "Export the list as a spreadsheet"],
      ], 2000);
      r.caption("Each student has a menu");
      await r.click(p.getByRole("button", { name: /^(Actions for|More actions)/ }).first(), 700);
      await tour(r, [
        [p.getByRole("menuitem", { name: "View profile" }), "View their profile"],
        [p.getByRole("menuitem", { name: "Edit details" }), "Edit their details"],
        [p.getByRole("menuitem", { name: "Mark as graduated" }), "Mark them as graduated"],
        [p.getByRole("menuitem", { name: "Suspend" }), "Suspend them"],
        [p.getByRole("menuitem", { name: "Withdraw" }), "or withdraw them when they leave. Their records stay."],
      ], 1700);
      await p.keyboard.press("Escape");
      await tour(r, [
        [p.getByRole("link", { name: "Add student" }), "Up top: add a student"],
        [p.getByRole("link", { name: "Import" }), "import a whole list from Excel"],
        [p.getByRole("link", { name: "Logins" }), "give students their own logins"],
        [p.getByRole("link", { name: "Promote" }), "and promote everyone at the end of the year. All of these are in this episode."],
      ], 2000);
    },
  },
  {
    id: "e9-2",
    chapter: EPISODES.students,
    plan: "Free",
    kind: "desktop",
    title: "Add a student",
    as: "owner",
    covers: [
      "/s/[slug]/students/new",
      "/s/[slug]/students/new: First name",
      "/s/[slug]/students/new: Surname",
      "/s/[slug]/students/new: Middle name (optional)",
      "/s/[slug]/students/new: Date of birth",
      "/s/[slug]/students/new: Female",
      "/s/[slug]/students/new: Class",
      "/s/[slug]/students/new: Admission number",
      "/s/[slug]/students/new: Date admitted",
      "/s/[slug]/students/new: State of origin",
      "/s/[slug]/students/new: LGA",
      "/s/[slug]/students/new: Religion",
      "/s/[slug]/students/new: Home address",
      "/s/[slug]/students/new: Blood group",
      "/s/[slug]/students/new: Genotype",
      "/s/[slug]/students/new: Allergies and medical notes",
      "/s/[slug]/students/new: Full name",
      "/s/[slug]/students/new: Relationship",
      "/s/[slug]/students/new: Phone number",
      "/s/[slug]/students/new: Email (optional)",
      "/s/[slug]/students/new: Add a second parent or guardian",
      "/s/[slug]/students/new: Save and add another",
      "/s/[slug]/students/new: Save student",
    ],
    async run(r) {
      const p = r.page;
      const date = async (label: string, value: string) => {
        await r.point(p.getByLabel(label));
        await p.getByLabel(label).fill(value);
        await r.wait(600);
      };
      await r.go(`${S}/students/new`);
      r.caption("Add a student: Kemi Adisa is joining JSS 1 Gold");
      await r.wait(2000);
      await r.type(p.getByLabel("First name"), "Kemi");
      await r.type(p.getByLabel("Surname"), "Adisa");
      await date("Date of birth", "2014-05-02");
      await r.click(p.getByLabel("Female"), 600);
      await r.reveal(p.getByRole("heading", { name: "Class and admission" }));
      r.caption("Her class. The admission number is made for you, with your school's prefix.");
      await r.select(p.getByLabel("Class", { exact: true }), { label: "JSS 1 Gold" });
      await r.point(p.getByLabel("Admission number"));
      await r.wait(1600);
      await r.reveal(p.getByRole("heading", { name: "Background" }));
      r.caption("Background, for records and reports");
      await r.select(p.getByLabel("State of origin"), "Ogun");
      await r.select(p.getByLabel("Religion"), "Christianity");
      await r.reveal(p.getByRole("heading", { name: "Health", exact: true }));
      r.caption("Health details the nurse will need");
      await r.select(p.getByLabel("Blood group"), "O+");
      await r.select(p.getByLabel("Genotype"), "AA");
      await r.reveal(p.getByRole("heading", { name: "Parent or guardian" }));
      r.caption("Her parent. The email lets her mother sign in to the parent app.");
      await r.type(p.getByLabel("Full name"), "Mrs Funke Adisa");
      await r.select(p.getByLabel("Relationship"), "Mother");
      await r.type(p.getByLabel("Phone number"), "0802 555 0188");
      await r.type(p.getByLabel("Email (optional)"), "funke.adisa@example.com");
      await tour(r, [
        [p.getByRole("button", { name: "Add a second parent or guardian" }), "Add a second parent if you like"],
        [p.getByRole("button", { name: "Save and add another" }), "Adding several? Save and add another."],
      ], 1800);
      r.caption("Save student");
      await r.click(p.getByRole("button", { name: "Save student" }), 1500);
      await r.offCamera(() => p.waitForURL(/students\/[0-9a-f-]{36}/, { timeout: 30_000 }));
      r.caption("Kemi's profile is ready, with her mother linked");
      await r.wait(2800);
    },
  },
  {
    id: "e9-3",
    chapter: EPISODES.students,
    plan: "Free",
    kind: "phone",
    title: "Parents",
    covers: ["/parent", "/parent: Send me a code", "/parent: Continue", "journey: Add a student with a parent, then the parent signs in", "email: Parent sign-in code"],
    async run(r) {
      const p = r.page;
      await r.go("/parent");
      r.caption("Mrs Adisa opens the parent app");
      await r.wait(1800);
      await r.type(p.getByLabel(/Phone number or email|Email address/), "funke.adisa@example.com");
      r.caption("She enters the email the school has for her. No password needed.");
      await r.click(p.getByRole("button", { name: "Send me a code" }), 1200);
      r.caption("A code arrives by email");
      await r.type(p.getByLabel("6-digit code"), "123456");
      await r.click(p.getByRole("button", { name: "Continue" }), 1200);
      await r.offCamera(() => p.waitForURL(/\/p$/, { timeout: 60_000 }));
      r.caption("She's in, and sees Kemi. The parent app has its own episode.");
      await r.wait(3200);
    },
  },
  {
    id: "e9-4",
    chapter: EPISODES.students,
    plan: "Free",
    kind: "desktop",
    title: "A student's profile",
    as: "owner",
    covers: [
      "/s/[slug]/students/[id]",
      "/s/[slug]/students/[id]: Details",
      "/s/[slug]/students/[id]: Change status",
      "/s/[slug]/students/[id]: Message parents",
      "/s/[slug]/students/[id]: Download their data",
      "/s/[slug]/students/[id]: Edit details",
      "/s/[slug]/students/[id]#parents",
      "/s/[slug]/students/[id]: Parents & guardians",
      "/s/[slug]/students/[id]: Make primary contact",
      "/s/[slug]/students/[id]: Remove from student",
      "/s/[slug]/students/[id]: Add parent or guardian",
      "/s/[slug]/students/[id]: Link parent",
      "/s/[slug]/students/[id]#history",
      "/s/[slug]/students/[id]: Class history",
      "/s/[slug]/students/[id]#fees",
      "/s/[slug]/students/[id]: Fees",
      "/s/[slug]/students/[id]: One-off invoice",
      "/s/[slug]/students/[id]: Save discounts",
      "/s/[slug]/students/[id]#conduct",
      "/s/[slug]/students/[id]: Conduct",
      "/s/[slug]/students/[id]#health",
      "/s/[slug]/students/[id]: Health",
      "/s/[slug]/students/[id]: Save health record",
      "/s/[slug]/students/[id]/edit",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/students?q=Oluwaseun+Lawal`);
      await r.offCamera(async () => {
        await p.getByRole("link", { name: /Oluwaseun Lawal/ }).first().click();
        await p.waitForURL(/students\/[0-9a-f-]{36}/);
      });
      const base = p.url().split("?")[0];
      r.caption("A student's profile: everything about Oluwaseun in one place");
      await r.wait(2600);
      r.caption("At a glance: fees, and brothers and sisters in the same school");
      await r.wait(2400);
      r.caption("Change status: suspend, withdraw or graduate");
      await r.click(p.getByRole("button", { name: "Change status" }), 700);
      await r.wait(1600);
      await p.keyboard.press("Escape");
      await tour(r, [
        [p.getByRole("link", { name: "Message parents" }), "Message the parents"],
        [p.getByRole("link", { name: "Download their data" }), "Download the student's data if the family asks for it"],
        [p.getByRole("link", { name: "Edit details" }), "Edit details, on the same form you add a student with"],
      ], 1900);

      await r.go(`${base}?tab=parents`);
      r.caption("Parents & guardians: who to contact, and who can use the parent app");
      await r.wait(2200);
      await r.click(p.getByRole("button", { name: /^Actions for Mrs/ }).first(), 700);
      // "Make primary contact" only shows for a parent who isn't the primary contact already.
      const primary = p.getByRole("menuitem", { name: "Make primary contact" });
      if (await primary.count()) await tour(r, [[primary, "Make a parent the first person the school contacts"]], 1800);
      else {
        r.caption("Mrs Lawal is the primary contact: the first person the school gets in touch with");
        await r.wait(2000);
      }
      await tour(r, [[p.getByRole("menuitem", { name: "Remove from student" }), "Remove a parent from a student"]], 1800);
      await p.keyboard.press("Escape");
      r.caption("Add a parent or guardian. If they already have a child here, they're linked, not duplicated.");
      await r.click(p.getByRole("button", { name: "Add parent or guardian" }), 900);
      await r.point(dialog.getByRole("button", { name: "Link parent" }));
      await r.wait(2200);
      await r.click(dialog.getByRole("button", { name: "Close" }), 700);

      await r.go(`${base}?tab=history`);
      r.caption("Class history: every class, year by year");
      await r.wait(2400);
      await r.go(`${base}?tab=fees`);
      r.caption("Fees: invoices and what's been paid");
      await r.wait(2200);
      await tour(r, [
        [p.getByRole("button", { name: "One-off invoice" }), "Raise a one-off invoice, like for a uniform"],
        [p.getByRole("button", { name: "Save discounts" }), "and set discounts or scholarships for this student"],
      ], 2000);
      await r.go(`${base}?tab=conduct`);
      r.caption("Conduct: merits and incidents");
      await r.wait(2200);
      await r.go(`${base}?tab=health`);
      r.caption("Health: the medical record and every sick bay visit");
      await r.point(p.getByRole("button", { name: "Save health record" }));
      await r.wait(2400);
    },
  },
  {
    id: "e9-5",
    chapter: EPISODES.students,
    plan: "Free",
    kind: "desktop",
    title: "Import from Excel",
    as: "owner",
    covers: [
      "/s/[slug]/students/import",
      "/s/[slug]/students/import: Download template",
      "/s/[slug]/students/import: Add students one at a time",
      "/s/[slug]/students/import: Import students",
      "/s/[slug]/students/import: View students",
      "journey: Import students from the school's own Excel list",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/students/import`);
      r.caption("Import: bring in a whole class, or the whole school, from Excel");
      await r.wait(2400);
      r.caption("Use our template, or your own list. SchoolHub works out your column headings.");
      await r.point(p.getByRole("link", { name: "Download template" }));
      await r.wait(2400);
      r.caption("Here's the school's own list for the new JSS 1 Gold intake");
      await r.point(p.locator("input[type=file]").locator(".."));
      await p.locator("input[type=file]").setInputFiles(path.resolve(".data/demo-video/assets/JSS1 Gold new intake.xlsx"));
      await r.wait(1600);
      const check = p.getByRole("button", { name: /Check|Preview|Continue/ }).first();
      if (await check.isVisible().catch(() => false)) await r.click(check, 1500);
      await r.offCamera(() => p.getByRole("button", { name: /^Import \d+ students?/ }).waitFor({ timeout: 60_000 }));
      r.caption("A check before anything is saved: who's coming in, which class, and any problems");
      await r.wait(3000);
      r.caption("Columns it doesn't need, like S/N, are simply left out");
      await r.wait(2400);
      await r.click(p.getByRole("button", { name: /^Import \d+ students?/ }), 1500);
      await r.offCamera(() => p.getByText(/students imported/).waitFor({ timeout: 60_000 }));
      r.caption("Done: four new students, each with a parent and an admission number");
      await r.wait(2600);
      await r.point(p.getByRole("link", { name: "View students" }));
      await r.wait(1400);
    },
  },
  {
    id: "e9-6",
    chapter: EPISODES.students,
    plan: "Free",
    kind: "desktop",
    title: "Student logins",
    as: "owner",
    covers: [
      "/s/[slug]/students/logins",
      "/s/[slug]/students/logins: Class",
      "/s/[slug]/students/logins: Select all",
      "/s/[slug]/students/logins: Issue for selected",
      "/s/[slug]/students/logins: Reset password",
      "/s/[slug]/students/logins: Print slips",
      "/s/[slug]/students/logins: Done",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/students/logins`);
      r.caption("Student logins: let students sign in to do homework, CBT tests and see their results");
      await r.wait(2600);
      r.caption("Pick a class");
      await r.select(p.getByRole("combobox", { name: /^Class/ }), { label: "JSS 1 Gold" });
      await r.wait(1600);
      r.caption("Tick the students who need a login, or all of them with one tick");
      await r.point(p.getByLabel("Select all"));
      await r.wait(1400);
      const boxes = p.getByRole("checkbox", { name: /^Select (?!all)/ });
      await r.click(boxes.nth(0), 500);
      await r.click(boxes.nth(1), 500);
      r.caption("Students who already have one can have their password reset");
      await r.point(p.getByRole("button", { name: /^Reset \d+ password/ }));
      await r.wait(2000);
      r.caption("Issue for selected");
      await r.click(p.getByRole("button", { name: "Issue for selected" }), 1500);
      r.caption("A slip for each student: the web address, school code, admission number and a first password");
      await r.wait(3400);
      r.caption("Print the slips and hand them out. Students choose their own password when they first sign in.");
      await r.point(p.getByRole("button", { name: "Print slips" }));
      await r.wait(2600);
      await r.click(p.getByRole("button", { name: "Done" }), 900);
    },
  },
  {
    id: "e9-7",
    chapter: EPISODES.students,
    plan: "Free",
    kind: "desktop",
    title: "End-of-session promotion",
    as: "owner",
    covers: [
      "/s/[slug]/students/promote",
      "/s/[slug]/students/promote: Create 2027/2028 session",
      "/s/[slug]/students/promote: Set all to",
      "/s/[slug]/students/promote: Promote",
      "/s/[slug]/students/promote: Repeat class",
      "/s/[slug]/students/promote: Graduate",
      "/s/[slug]/students/promote: Withdraw",
      "/s/[slug]/students/promote: Apply to",
      "/s/[slug]/students/promote: Make 2027/2028 the current session",
      "/s/[slug]/students/promote: Cancel",
      "/s/[slug]/students/promote: Apply promotion",
      "/s/[slug]/students/promote: View students",
      "journey: Promote classes at the end of the session",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/students/promote`);
      r.caption("End of the school year: move everyone up a class in one go");
      await r.wait(2400);
      const create = p.getByRole("button", { name: /^Create .* session$/ });
      if (await create.count()) {
        r.caption("First, the next session. Its three terms are made for you.");
        await r.click(create, 1500);
        await r.offCamera(() => p.getByRole("button", { name: /^Apply to \d+ students/ }).waitFor({ timeout: 60_000 }));
      }
      r.caption("Every class, with each student set to move up. SS 3 is set to graduate.");
      await r.wait(3000);
      r.caption("Change a whole class at once");
      await r.point(p.getByRole("combobox", { name: /^Set all in/ }).first());
      await r.wait(1800);
      r.caption("or one student: Aisha is repeating JSS 1");
      await r.select(p.getByRole("combobox", { name: "Next session for Aisha Adeyemi" }), { label: "Repeat class" });
      await r.wait(1800);
      r.caption("The bar at the bottom counts who's promoted, repeating, graduating or leaving");
      await r.point(p.getByRole("button", { name: /^Apply to \d+ students/ }));
      await r.wait(2400);
      await r.click(p.getByRole("button", { name: /^Apply to \d+ students/ }), 900);
      r.caption("Check the totals, and choose whether the new session starts now");
      await r.wait(2600);
      await r.point(dialog.getByRole("button", { name: "Cancel" }));
      await r.wait(1000);
      await r.click(dialog.getByRole("button", { name: "Apply promotion" }), 1500);
      await r.offCamera(() => p.getByRole("link", { name: "View students" }).waitFor({ timeout: 60_000 }));
      r.caption("Done. Every student is in their new class, and last year's records are kept in their class history.");
      await r.wait(3200);
    },
  },

  /* ---------------- Episode 10: Online admissions ---------------- */
  {
    id: "e10-1",
    chapter: EPISODES.admissions,
    plan: "Standard",
    kind: "phone",
    title: "Parents",
    covers: [
      "/apply/[slug]",
      "/apply/[slug]: Class applying for",
      "/apply/[slug]: First name",
      "/apply/[slug]: Surname",
      "/apply/[slug]: Boy or girl",
      "/apply/[slug]: Date of birth",
      "/apply/[slug]: Current or last school (optional)",
      "/apply/[slug]: Your full name",
      "/apply/[slug]: Relationship",
      "/apply/[slug]: Phone number",
      "/apply/[slug]: Email (optional)",
      "/apply/[slug]: privacy notice",
      "/apply/[slug]: Send application",
      "/apply/[slug]/status/[token]",
      "/apply/[slug]/status/[token]: Application received",
      "/apply/[slug]/status/[token]: Email for the receipt",
      "/apply/[slug]/status/[token]: Pay",
      "/apply/[slug]/status/[token]/test-checkout",
      "email: Application received",
    ],
    async run(r, ctx) {
      const p = r.page;
      await r.go(`/apply/adalin-college`);
      r.caption("Mr Adigun opens the school's admission link on his phone");
      await r.wait(2200);
      r.caption("The form shows the school's name, the fee and the exam details");
      await r.wait(2200);
      await r.select(p.getByLabel("Class applying for"), { label: "JSS 1" });
      await r.type(p.getByLabel("First name"), "Ifeoluwa");
      await r.type(p.getByLabel("Surname"), "Adigun");
      await r.select(p.getByLabel("Boy or girl"), { label: "Girl" });
      await r.point(p.getByLabel("Date of birth"));
      await p.getByLabel("Date of birth").fill("2014-03-21");
      await r.type(p.getByLabel("Current or last school (optional)"), "Bright Stars Primary School");
      r.caption("Then his own details");
      await r.type(p.getByLabel("Your full name"), "Mr Segun Adigun");
      await r.select(p.getByLabel("Relationship"), "Father");
      await r.type(p.getByLabel("Phone number"), "0803 555 0119");
      await r.type(p.getByLabel("Email (optional)"), "segun.adigun@example.com");
      r.caption("He agrees to the school keeping these details, and sends it");
      await r.click(p.locator("input[name=consent]"), 600);
      await r.click(p.getByRole("button", { name: "Send application" }), 1500);
      await r.offCamera(() => p.waitForURL(/\/status\//, { timeout: 30_000 }));
      ctx.applyStatus = new URL(p.url()).pathname;
      r.caption("Application received. This page keeps him updated, and he gets the link by email.");
      await r.wait(3000);
      const pay = p.getByRole("button", { name: /^Pay ₦/ });
      if (await pay.count()) {
        await r.reveal(pay);
        r.caption("He pays the form fee online. It goes straight to the school.");
        await r.wait(1600);
        await r.click(pay, 1200);
        await r.offCamera(() => p.waitForURL(/test-checkout/, { timeout: 30_000 }));
        r.caption("Card, transfer or USSD, through Paystack");
        await r.wait(1600);
        await r.click(p.getByRole("button", { name: /^Pay ₦/ }), 1200);
        await r.offCamera(() => p.waitForURL(/paid=1/, { timeout: 30_000 }));
        r.caption("Paid. The school sees it straight away.");
        await r.wait(2600);
      }
    },
  },
  {
    id: "e10-2",
    chapter: EPISODES.admissions,
    plan: "Standard",
    kind: "desktop",
    title: "Applicants",
    as: "owner",
    covers: [
      "/s/[slug]/admissions",
      "/s/[slug]/admissions: Applicants",
      "/s/[slug]/admissions: Name, reference or phone…",
      "/s/[slug]/admissions: Class",
      "/s/[slug]/admissions: Form fee",
      "/s/[slug]/admissions: Paid",
      "/s/[slug]/admissions: Not paid",
      "/s/[slug]/admissions: Export",
      "/s/[slug]/admissions: Form and settings",
      "/s/[slug]/admissions/[id]",
      "/s/[slug]/admissions/[id]: Invite to entrance exam",
      "/s/[slug]/admissions/[id]: Invite to interview",
      "/s/[slug]/admissions/[id]: Tell the parent",
      "/s/[slug]/admissions/[id]: Entrance exam score",
      "/s/[slug]/admissions/[id]: Interview notes",
      "/s/[slug]/admissions/[id]: Save assessment",
      "/s/[slug]/admissions/[id]: Offer admission",
      "/s/[slug]/admissions/[id]: Not successful",
      "/s/[slug]/admissions/[id]: Withdrawn",
      "/s/[slug]/admissions/[id]: Offer letter",
      "/s/[slug]/admissions/[id]: Parent's page",
      "email: Application update",
      "pdf: Admission offer letter",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/admissions`);
      r.caption("Admissions: every application, as it comes in");
      await r.wait(2600);
      await tour(r, [
        [p.getByPlaceholder("Name, reference or phone…"), "Search by name, reference or phone"],
        [p.getByRole("combobox", { name: /^Class/ }), "Filter by class"],
        [p.getByRole("combobox", { name: /^Form fee/ }), "or by who has paid the form fee"],
        [p.getByRole("link", { name: "Export" }), "Export the list"],
        [p.getByRole("link", { name: "Form and settings" }), "The form itself is set up here, as shown in the Settings episode"],
      ], 1800);
      r.caption("Ifeoluwa's application is in, with the fee paid");
      await r.click(p.getByRole("link", { name: "Ifeoluwa Adigun" }), 1200);
      await r.wait(2400);
      r.caption("Next step: invite her to the entrance exam. The parent is told by email.");
      await r.point(p.getByLabel(/^Tell the parent/).first());
      await r.wait(1600);
      await r.click(p.getByRole("button", { name: "Invite to entrance exam" }), 1500);
      await r.wait(1600);
      r.caption("After the exam, record the score and any interview notes");
      await r.type(p.getByLabel("Entrance exam score"), "78");
      await r.type(p.getByLabel("Interview notes"), "Confident and well prepared. Strong in maths.");
      await r.click(p.getByRole("button", { name: "Save assessment" }), 1500);
      await r.wait(1200);
      await tour(r, [
        [p.getByRole("button", { name: "Not successful" }), "If it's a no, mark the application not successful"],
        [p.getByRole("button", { name: "Withdrawn" }), "or withdrawn if the family pulls out"],
      ], 1900);
      r.caption("It's a yes: offer admission");
      await r.click(p.getByRole("button", { name: "Offer admission" }), 1500);
      await r.wait(1600);
      await tour(r, [
        [p.getByRole("link", { name: /Offer letter/ }).first(), "An offer letter is made for you, with the school's logo and signature"],
        [p.getByRole("link", { name: /Parent's page/ }).first(), "and the parent sees the offer on their page"],
      ], 2400);
    },
  },
  {
    id: "e10-3",
    chapter: EPISODES.admissions,
    plan: "Standard",
    kind: "phone",
    title: "Parents",
    covers: [
      "/apply/[slug]/status/[token]: Offer of admission",
      "/apply/[slug]/status/[token]: Offer letter (PDF)",
      "/apply/[slug]/status/[token]: Accept the offer",
      "/apply/[slug]/status/[token]: Decline",
      "/apply/[slug]/status/[token]: Offer accepted",
    ],
    async run(r, ctx) {
      const p = r.page;
      if (!ctx.applyStatus) throw new Error("Record e10-1 first: it makes the application.");
      await r.go(ctx.applyStatus);
      r.caption("Mr Adigun gets an email: Ifeoluwa has been offered a place");
      await r.wait(2600);
      await r.reveal(p.getByRole("link", { name: /Offer letter \(PDF\)/ }).first());
      r.caption("He can download the offer letter");
      await r.wait(2200);
      const accept = p.getByRole("button", { name: "Accept the offer" });
      await r.reveal(accept);
      r.caption("and accept the offer, or decline it");
      await r.wait(1600);
      await r.click(accept, 1500);
      await r.offCamera(() => p.waitForURL(/accepted=1/, { timeout: 30_000 }));
      r.caption("Offer accepted. The school is told straight away.");
      await r.wait(2800);
    },
  },
  {
    id: "e10-4",
    chapter: EPISODES.admissions,
    plan: "Standard",
    kind: "desktop",
    title: "Enrolment",
    as: "owner",
    covers: [
      "/s/[slug]/admissions/[id]: Enrol as a student",
      "/s/[slug]/admissions/[id]: Enrol",
      "/s/[slug]/admissions/[id]: Open the student record",
      "journey: An applicant applies online, sits the exam, gets an offer and is enrolled",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/admissions`);
      await r.offCamera(() => p.getByRole("link", { name: "Ifeoluwa Adigun" }).click());
      await r.offCamera(() => p.waitForURL(/admissions\/[0-9a-f-]{36}/));
      r.caption("The offer was accepted. Time to enrol Ifeoluwa as a student.");
      await r.wait(2600);
      await r.reveal(p.getByRole("heading", { name: "Enrol as a student" }));
      r.caption("Choose her class");
      await r.select(p.getByLabel("Class", { exact: true }), { label: "JSS 1 Gold" });
      await r.wait(800);
      r.caption("Enrol: her student record is made, with an admission number, and her father linked");
      await r.click(p.getByRole("button", { name: "Enrol" }), 1500);
      await r.offCamera(() => p.waitForURL(/students\/[0-9a-f-]{36}/, { timeout: 30_000 }));
      r.caption("From application to student, without typing anything twice");
      await r.wait(3200);
    },
  },

  /* ---------------- Episode 11: Attendance ---------------- */
  {
    id: "e11-1",
    chapter: EPISODES.attendance,
    plan: "Free",
    kind: "phone",
    title: "Teachers",
    as: "teacher",
    covers: [
      "/s/[slug]/attendance",
      "/s/[slug]/attendance: Take register",
      "/s/[slug]/attendance/[classId]",
      "/s/[slug]/attendance/[classId]: Present",
      "/s/[slug]/attendance/[classId]: Absent",
      "/s/[slug]/attendance/[classId]: Late",
      "/s/[slug]/attendance/[classId]: Excused",
      "/s/[slug]/attendance/[classId]: Reason (optional)",
      "/s/[slug]/attendance/[classId]: Mark all present",
      "/s/[slug]/attendance/[classId]: Save register",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/attendance`);
      r.caption("8 a.m. Mrs Adeyemi takes the register for her class, on her phone");
      await r.wait(2400);
      await r.click(p.getByRole("link", { name: /Take register|View or edit register/ }).first(), 1200);
      await r.offCamera(() => p.getByRole("radiogroup").first().waitFor());
      r.caption("Everyone starts as present. She taps only the few who aren't.");
      await r.wait(2600);
      const groups = p.getByRole("radiogroup");
      const names = await r.offCamera(() => groups.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.replace("Attendance for ", ""))));
      const absent = names.find((n) => n === "Oluwaseun Lawal") ?? names[0];
      const late = names.find((n) => n !== absent)!;
      const excused = names.filter((n) => n !== absent && n !== late)[1] ?? names[names.length - 1];
      const row = (n: string) => p.getByRole("radiogroup", { name: `Attendance for ${n}` });
      await r.reveal(row(absent));
      r.caption(`${absent.split(" ")[0]} is absent`);
      await r.click(row(absent).getByRole("radio", { name: "Absent" }), 800);
      await r.wait(1000);
      r.caption(`${late.split(" ")[0]} came in late. Late still counts as present.`);
      await r.reveal(row(late));
      await r.click(row(late).getByRole("radio", { name: "Late" }), 800);
      await r.wait(1200);
      r.caption(`${excused.split(" ")[0]} is excused, with a reason`);
      await r.reveal(row(excused));
      await r.click(row(excused).getByRole("radio", { name: "Excused" }), 800);
      await r.type(p.getByLabel(`Reason for ${excused}`), "Hospital appointment");
      await r.wait(1000);
      r.caption("Made a mistake? Mark all present starts again.");
      await r.reveal(p.getByRole("button", { name: "Mark all present" }));
      await r.point(p.getByRole("button", { name: "Mark all present" }));
      await r.wait(1800);
      r.caption("Save register. Parents of absent children are told straight away.");
      await r.click(p.getByRole("button", { name: /^Save register/ }), 1500);
      await r.wait(2400);
    },
  },
  {
    id: "e11-2",
    chapter: EPISODES.attendance,
    plan: "Free",
    kind: "phone",
    title: "Parents",
    as: "parent",
    covers: ["email: Absence alert", "journey: Take the morning register, and the parent is told about an absence"],
    async run(r) {
      const p = r.page;
      await r.go("/p/notifications");
      r.caption("Minutes later, Mrs Lawal gets an alert, by email and in the parent app");
      await r.wait(2600);
      const alert = p.getByText(/was marked absent today/).first();
      if (await alert.count()) {
        await r.reveal(alert);
        await r.point(alert);
      }
      r.caption("If it's unexpected, she can contact the school straight away");
      await r.wait(2800);
    },
  },
  {
    id: "e11-3",
    chapter: EPISODES.attendance,
    plan: "Free",
    kind: "desktop",
    title: "The whole school",
    as: "owner",
    covers: [
      "/s/[slug]/attendance: Registers taken",
      "/s/[slug]/attendance: In school",
      "/s/[slug]/attendance: Absent",
      "/s/[slug]/attendance: Late",
      "/s/[slug]/attendance: Date",
      "/s/[slug]/attendance: Back to today",
      "/s/[slug]/attendance: View or edit register",
      "/s/[slug]/attendance/[classId]: Save register again",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/attendance`);
      r.caption("The principal sees every class at once");
      await r.wait(2400);
      r.caption("How many registers are in, who's in school, absent or late");
      await r.wait(2600);
      r.caption("Classes still to take their register are easy to spot");
      await r.wait(2400);
      const date = p.getByLabel("Date");
      r.caption("Look back at any school day");
      await r.point(date);
      const d = await date.inputValue();
      const prev = new Date(`${d}T12:00:00Z`);
      prev.setUTCDate(prev.getUTCDate() - (prev.getUTCDay() === 1 ? 3 : 1));
      await date.fill(prev.toISOString().slice(0, 10));
      await date.dispatchEvent("change");
      await r.offCamera(() => p.waitForURL(/date=/, { timeout: 15_000 }).catch(() => {}));
      await r.wait(2400);
      const back = p.getByRole("link", { name: "Back to today" });
      if (await back.count()) {
        r.caption("Back to today");
        await r.point(back);
        await r.offCamera(async () => {
          await back.click();
          await p.waitForURL((u) => !u.search.includes("date="), { timeout: 15_000 });
        });
      } else await r.go(`${S}/attendance`);
      const view = p.getByRole("link", { name: "View or edit register" }).first();
      r.caption("Open a register that's been taken to check it, or correct it");
      await r.point(view);
      await r.offCamera(async () => {
        await view.click();
        await p.getByRole("radiogroup").first().waitFor({ timeout: 20_000 });
      });
      await r.wait(2400);
      await r.reveal(p.getByRole("button", { name: /^Save register/ }));
      r.caption("Changes save over the earlier register");
      await r.point(p.getByRole("button", { name: /^Save register/ }));
      await r.wait(2200);
    },
  },

  /* ---------------- Episode 12: Timetable ---------------- */
  {
    id: "e12-1",
    chapter: EPISODES.timetable,
    plan: "Basic",
    kind: "desktop",
    title: "Bell schedule",
    as: "owner",
    covers: [
      "/s/[slug]/timetable#setup",
      "/s/[slug]/timetable: Bell schedule",
      "/s/[slug]/timetable: Schedule name",
      "/s/[slug]/timetable: School days",
      "/s/[slug]/timetable: Period label",
      "/s/[slug]/timetable: Start time",
      "/s/[slug]/timetable: End time",
      "/s/[slug]/timetable: Period type",
      "/s/[slug]/timetable: Add period",
      "/s/[slug]/timetable: Save schedule",
      "/s/[slug]/timetable: + Add another bell schedule (e.g. a shorter nursery day)",
      "/s/[slug]/timetable: Which classes follow which schedule",
    ],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/timetable?view=setup`);
      r.caption("Timetable. Start with the bell schedule: when each period starts and ends.");
      await r.wait(2600);
      await tour(r, [
        [p.getByLabel("Schedule name").first(), "Its name"],
        [p.getByText("School days").first(), "the school days"],
        [p.getByLabel("Period label").first(), "and every period: its label"],
        [p.getByLabel("Start time").first(), "start time"],
        [p.getByLabel("End time").first(), "end time"],
        [p.getByLabel("Period type").nth(2), "and type: lesson, break or assembly"],
      ], 1600);
      r.caption("Add a period at the end of the day");
      await r.click(p.getByRole("button", { name: "Add period" }).first(), 900);
      await r.wait(1400);
      await r.point(p.getByRole("button", { name: "Save schedule" }).first());
      r.caption("Save schedule");
      await r.wait(1400);
      await r.offCamera(() => p.reload());
      const another = p.getByText("+ Add another bell schedule (e.g. a shorter nursery day)");
      await r.reveal(another);
      r.caption("Nursery finishing earlier? Add another bell schedule.");
      await r.point(another);
      await r.wait(2200);
      const which = p.getByRole("heading", { name: "Which classes follow which schedule" });
      await r.reveal(which);
      r.caption("Then choose which classes follow which schedule");
      await r.point(p.getByRole("combobox", { name: "Bell schedule" }).first());
      await r.wait(2400);
    },
  },
  {
    id: "e12-2",
    chapter: EPISODES.timetable,
    plan: "Basic",
    kind: "desktop",
    title: "A class's timetable",
    as: "owner",
    covers: [
      "/s/[slug]/timetable",
      "/s/[slug]/timetable: Classes",
      "/s/[slug]/timetable: Class",
      "/s/[slug]/timetable: Term",
      "/s/[slug]/timetable: Lessons a week",
      "/s/[slug]/timetable: Subject",
      "/s/[slug]/timetable: Teacher",
      "/s/[slug]/timetable: Room (optional)",
      "/s/[slug]/timetable: Note (optional)",
      "/s/[slug]/timetable: Save",
      "/s/[slug]/timetable: Clear",
      "/s/[slug]/timetable: Print",
      "journey: Set the timetable and swap two lessons",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/timetable`);
      r.caption("Each class's week");
      await r.select(p.getByRole("combobox", { name: /^Class/ }), { label: "JSS 1 Gold" });
      await r.offCamera(() => p.waitForURL(/class=/, { timeout: 15_000 }).catch(() => {}));
      await r.wait(2000);
      r.caption("Lessons a week: how many periods each subject has so far");
      await r.reveal(p.getByRole("heading", { name: "Lessons a week" }));
      await r.wait(2400);
      r.caption("40 of 40 lessons placed: the week is full");
      await r.offCamera(() => p.evaluate(() => window.scrollTo(0, 0)));
      await r.point(p.getByText(/lessons placed/));
      await r.wait(1800);
      const lesson = p.getByRole("button", { name: /^Fri period 1: / });
      r.caption("Click any period to set or change its lesson");
      await r.click(lesson, 900);
      await r.point(dialog.getByLabel("Subject"));
      await r.wait(1400);
      r.caption("The teacher fills in by itself when the subject has one in Subject teachers");
      await r.point(dialog.getByLabel("Teacher"));
      await r.wait(1800);
      r.caption("Add a room, or a note like Library period");
      await r.type(dialog.getByLabel("Room (optional)"), "Language lab");
      await r.point(dialog.getByLabel("Note (optional)"));
      r.caption("If the teacher is already teaching another class then, SchoolHub warns you before saving");
      await r.wait(2400);
      await r.click(dialog.getByRole("button", { name: "Save", exact: true }), 1500);
      await r.offCamera(() => dialog.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {}));
      await r.wait(1400);

      r.caption("To swap two lessons, drag one onto the other");
      const filled = p.getByRole("button", { name: /^Tue period \d+: (?!free)/ });
      const a = filled.nth(0);
      const b = filled.nth(1);
      await r.reveal(a);
      await r.point(a);
      const from = (await a.boundingBox())!;
      const to = (await b.boundingBox())!;
      await p.mouse.down();
      await p.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2, { steps: 4 });
      await p.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 30 });
      await p.waitForTimeout(300);
      await p.mouse.up();
      await r.offCamera(() => p.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {}));
      await r.wait(1600);
      const clash = dialog.getByRole("button", { name: "Swap anyway" });
      if (await clash.isVisible().catch(() => false)) {
        r.caption("That swap would clash with another class. Cancel, or swap anyway.");
        await r.wait(2400);
        await r.click(dialog.getByRole("button", { name: "Cancel" }), 900);
      } else {
        r.caption("Swapped. If a swap would clash with another class, you're asked first.");
        await r.wait(2400);
      }
      r.caption("Click any lesson to change it or clear it");
      await r.click(a, 900);
      await r.point(dialog.getByRole("button", { name: "Clear" }));
      await r.wait(1800);
      await r.click(dialog.getByRole("button", { name: "Close" }), 700);
      await tour(r, [
        [p.getByRole("combobox", { name: /^Term/ }), "Each term can have its own timetable"],
        [p.getByRole("link", { name: "Print" }), "Print it for the classroom wall"],
      ], 2000);
    },
  },
  {
    id: "e12-3",
    chapter: EPISODES.timetable,
    plan: "Basic",
    kind: "desktop",
    title: "Teachers' timetables",
    as: "owner",
    covers: ["/s/[slug]/timetable#teacher", "/s/[slug]/timetable: Teachers", "/print/[slug]/timetable"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/timetable?view=teacher`);
      r.caption("Teachers: each teacher's week, built from the class timetables");
      await r.wait(2600);
      r.caption("Pick a teacher to see where they need to be, and when");
      await r.point(p.getByRole("combobox", { name: /^Teacher/ }));
      await r.wait(2200);
      r.caption("Teachers see their own timetable when they sign in, and students see their class's");
      await r.wait(2800);
    },
  },

  /* ---------------- Episode 13: Results and report cards ---------------- */
  {
    id: "e13-1",
    chapter: EPISODES.results,
    plan: "Free",
    kind: "desktop",
    title: "Results",
    as: "owner",
    covers: ["/s/[slug]/results", "/s/[slug]/results: Class results", "/s/[slug]/results: Open results", "/s/[slug]/results: Result PINs"],
    async run(r) {
      const p = r.page;
      await r.go(`${S}/results`);
      r.caption("Results: every class's scores and report cards for the term");
      await r.wait(2600);
      r.caption("Score sheets submitted, classes ready to publish, and classes already published");
      await r.wait(2800);
      r.caption("Each class moves through four steps: scores in, reviewed, approved, published");
      await r.reveal(p.getByRole("heading", { name: "Class results" }));
      await r.wait(3000);
      r.caption("Let's follow JSS 1 Diamond from scores to parents");
      await r.point(p.getByRole("row").filter({ hasText: "JSS 1 Diamond" }).getByRole("link").last());
      await r.wait(2000);
      r.caption("Result PINs, for parents checking results online, have their own episode");
      await r.point(p.getByRole("link", { name: "Result PINs" }));
      await r.wait(2000);
    },
  },
  {
    id: "e13-2",
    chapter: EPISODES.results,
    plan: "Free",
    kind: "desktop",
    title: "Entering scores",
    as: "maths",
    covers: [
      "/s/[slug]/results/sheet",
      "/s/[slug]/results: Your score sheets",
      "/s/[slug]/results: Enter scores",
      "/s/[slug]/results: View scores",
      "/s/[slug]/results/sheet: Submit scores",
      "/s/[slug]/results/sheet: Reopen for teacher",
    ],
    async run(r) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/results`);
      r.caption("Mr Obi teaches maths. His score sheets are at the top.");
      await r.wait(2400);
      await r.point(p.getByRole("link", { name: "Enter scores" }).first());
      await r.offCamera(async () => {
        await p.getByRole("link", { name: "Enter scores" }).first().click();
        await p.waitForURL(/results\/sheet/, { timeout: 20_000 });
        await p.locator("main table input[aria-label*=' for ']").first().waitFor();
      });
      r.caption("Each student, with a box for each CA and the exam");
      await r.wait(2600);
      const first = p.locator("main table input[aria-label*=' for ']").first();
      const value = await first.inputValue();
      r.caption("Type a score. It saves by itself, even if the internet drops for a moment.");
      await r.type(first, String(Math.min(20, Number(value || 15) + 1)));
      await p.keyboard.press("Tab");
      await r.wait(2200);
      r.caption("Totals, grades and positions work themselves out");
      await r.wait(2600);
      r.caption("Maths is done for the whole class. Submit the sheet to the class teacher.");
      await r.click(p.getByRole("button", { name: "Submit scores" }), 900);
      await r.wait(1600);
      await r.click(dialog.getByRole("button", { name: "Submit scores" }), 1500);
      await r.wait(1400);
      r.caption("Submitted. Only the class teacher or principal can reopen it now.");
      await r.wait(2600);
    },
  },
  {
    id: "e13-3",
    chapter: EPISODES.results,
    plan: "Free",
    kind: "desktop",
    title: "The class teacher",
    as: "teacher",
    covers: [
      "/s/[slug]/results/class/[classId]",
      "/s/[slug]/results/class/[classId]#subjects",
      "/s/[slug]/results/class/[classId]: Subject sheets",
      "/s/[slug]/results/class/[classId]: Open sheet",
      "/s/[slug]/results/class/[classId]#broadsheet",
      "/s/[slug]/results/class/[classId]: Broadsheet",
      "/s/[slug]/results/class/[classId]: Export CSV",
      "/s/[slug]/results/class/[classId]#reports",
      "/s/[slug]/results/class/[classId]: Report cards",
      "/s/[slug]/results/class/[classId]: Class teacher's comment",
      "/s/[slug]/results/class/[classId]: Suggest with AI",
      "/s/[slug]/results/class/[classId]: Save",
      "/s/[slug]/results/class/[classId]: Preview report card",
      "/s/[slug]/results/class/[classId]: Mark as reviewed",
      "pdf: Report card",
    ],
    async run(r, ctx) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      await r.go(`${S}/results`);
      await r.offCamera(async () => {
        await p.getByRole("row").filter({ hasText: "JSS 1 Diamond" }).getByRole("link").last().click();
        await p.waitForURL(/results\/class\//, { timeout: 20_000 });
      });
      const base = p.url().split("?")[0];
      ctx.resultsClass = new URL(base).pathname;
      r.caption("Mrs Adeyemi is the class teacher. She checks the class before it goes to the principal.");
      await r.wait(2600);
      await r.go(`${base}?tab=subjects`);
      r.caption("Subject sheets: which teachers have submitted their scores");
      await r.point(p.getByRole("link", { name: "Open sheet" }).first());
      await r.wait(2400);
      await r.go(`${base}?tab=broadsheet`);
      r.caption("The broadsheet: every student and every subject on one page");
      await r.wait(2800);
      await r.point(p.getByRole("link", { name: "Export CSV" }));
      r.caption("Export it to Excel if you need to");
      await r.wait(1800);
      await r.go(`${base}?tab=reports`);
      r.caption("Report cards: each student's position, average and comments");
      await r.wait(2400);
      const student = p.getByRole("button", { name: /Halima Danjuma/ });
      await r.click(student, 1000);
      const comment = p.getByLabel("Class teacher's comment");
      await r.reveal(comment);
      r.caption("Her comment for each child. Stuck for words? Kola can suggest one from the child's results.");
      await r.wait(1600);
      await r.click(p.getByRole("button", { name: "Suggest with AI" }).first(), 900);
      await r.offCamera(() => p.getByRole("button", { name: "Suggest with AI" }).first().waitFor({ timeout: 45_000 }));
      r.caption("She reads it and changes anything she likes");
      await r.wait(3000);
      r.caption("Then rates behaviour and skills, and saves");
      await r.click(p.getByRole("radiogroup", { name: "Punctuality" }).getByRole("radio").nth(3), 700);
      await r.click(p.getByRole("button", { name: "Save", exact: true }), 1500);
      await r.wait(1200);
      const preview = p.getByRole("link", { name: "Preview report card" });
      const href = await preview.getAttribute("href");
      await r.point(preview);
      r.caption("Preview the report card");
      await r.wait(1200);
      if (href) await showPdf(r, href, "The report card, with the school's logo, every subject, the comments and the ratings", 4200);
      r.caption("All done: mark the class as reviewed for the principal");
      await r.click(p.getByRole("button", { name: "Mark as reviewed" }), 900);
      await r.wait(1600);
      await r.click(dialog.getByRole("button", { name: "Mark as reviewed" }), 1500);
      await r.wait(2200);
    },
  },
  {
    id: "e13-4",
    chapter: EPISODES.results,
    plan: "Basic",
    kind: "desktop",
    title: "Approve and publish",
    as: "principal",
    covers: [
      "/s/[slug]/results/class/[classId]: Approve and lock",
      "/s/[slug]/results/class/[classId]: Send back",
      "/s/[slug]/results/class/[classId]: Principal's comment",
      "/s/[slug]/results/class/[classId]: Publish to parents",
      "/s/[slug]/results/class/[classId]: Next term begins (printed on report cards)",
      "/s/[slug]/results/class/[classId]: Publish",
      "/s/[slug]/results/class/[classId]: Report cards (PDF)",
      "/s/[slug]/results/class/[classId]: Unlock",
      "email: Results are ready",
      "journey: Teachers enter scores, the class teacher comments, the principal approves and publishes",
    ],
    async run(r, ctx) {
      const p = r.page;
      const dialog = p.getByRole("dialog");
      if (!ctx.resultsClass) throw new Error("Record e13-3 first.");
      await r.go(`${ctx.resultsClass}?tab=reports`);
      r.caption("Dr Ogunleye, the principal, sees JSS 1 Diamond is reviewed");
      await r.wait(2600);
      await r.click(p.getByRole("button", { name: /Oluwadamilare Okoro/ }), 1000);
      const pc = p.getByLabel("Principal's comment");
      await r.reveal(pc);
      r.caption("The principal adds a comment too");
      await r.type(pc, "An excellent term. Keep it up.");
      await r.click(p.getByRole("button", { name: "Save", exact: true }), 1500);
      await r.wait(1000);
      await r.offCamera(() => p.evaluate(() => window.scrollTo(0, 0)));
      await tour(r, [[p.getByRole("button", { name: "Send back" }), "Something wrong? Send it back to the teachers."]], 2200);
      r.caption("Happy with it? Approve and lock. Scores can't be changed after this.");
      await r.click(p.getByRole("button", { name: "Approve and lock" }), 900);
      await r.wait(1600);
      await r.click(dialog.getByRole("button", { name: "Approve and lock" }), 1500);
      await r.wait(1600);
      r.caption("Then publish to parents");
      await r.click(p.getByRole("button", { name: "Publish to parents" }), 900);
      r.caption("Add the date next term begins, printed on every report card");
      const resumes = dialog.getByLabel("Next term begins (printed on report cards)");
      await r.point(resumes);
      await resumes.fill("2027-01-11");
      await r.wait(1800);
      await r.click(dialog.getByRole("button", { name: "Publish", exact: true }), 1500);
      await r.wait(1600);
      r.caption("Published. Parents get an email and see the report card in the app.");
      await r.wait(2800);
      await tour(r, [
        [p.getByRole("link", { name: "Report cards (PDF)" }), "Print the whole class's report cards in one file"],
        [p.getByRole("button", { name: "Unlock" }), "Found a mistake later? Unlock, fix it, and publish again."],
      ], 2400);
    },
  },

  /* ---------------- Episode 14: Result PINs and the result checker ---------------- */
  {
    id: "e14-1",
    chapter: EPISODES.pins,
    plan: "Basic",
    kind: "desktop",
    title: "Result PINs",
    as: "owner",
    covers: [
      "/s/[slug]/results/pins",
      "/s/[slug]/results/pins: Result checker PINs",
      "/s/[slug]/results/pins: Where parents check results",
      "/s/[slug]/results/pins: Result checker link",
      "/s/[slug]/results/pins: PIN batches",
      "/s/[slug]/results/pins: How many PINs",
      "/s/[slug]/results/pins: Checks allowed per PIN",
      "/s/[slug]/results/pins: Generate PINs",
      "/s/[slug]/results/pins: Download CSV",
      "/s/[slug]/results/pins: Print cards",
      "pdf: Result PIN cards",
    ],
    async run(r, ctx) {
      const p = r.page;
      await r.go(`${S}/results/pins`);
      r.caption("Result PINs: like a scratch card, so parents can check results online without an account");
      await r.wait(2800);
      r.caption("This is where parents check results. Share the link, or print it on the PIN cards.");
      await r.point(p.getByLabel("Result checker link"));
      await r.wait(2400);
      r.caption("How many PINs, and how many times each one can be used");
      const count = p.getByLabel("How many PINs");
      await r.click(count, 300);
      // A number box can't be emptied (it falls back to 0), so the new value replaces the old in one go.
      await count.fill("6");
      await r.point(p.getByLabel("Checks allowed per PIN"));
      await r.wait(1400);
      r.caption("Each PIN locks to the first student it's used for, so it can't be passed around");
      await r.click(p.getByRole("button", { name: /^Generate \d+ PINs/ }), 1500);
      await r.offCamera(() => p.getByRole("button", { name: "Print cards" }).waitFor({ timeout: 20_000 }));
      r.caption("PINs are shown only once. Download them, or print the cards.");
      await r.reveal(p.getByRole("button", { name: "Print cards" }));
      await tour(r, [
        [p.getByRole("button", { name: "Download CSV" }), "Download them as a spreadsheet"],
        [p.getByRole("button", { name: "Print cards" }), "or print cards to sell or hand out with the report"],
      ], 2000);
      const card = p.getByText(/^\d{4}-\d{4}-\d{4}$/).first();
      await r.reveal(card);
      r.caption("Each card has the school's name, the term, the PIN, a serial number and the link");
      await r.point(card);
      ctx.pin = (await card.innerText()).trim();
      await r.wait(3000);
      await r.offCamera(() => p.goto(`${S}/results/pins`));
      await r.reveal(p.getByText("PIN batches").first());
      r.caption("PIN batches: every batch you've made, and how many have been used");
      await r.wait(2600);
    },
  },
  {
    id: "e14-2",
    chapter: EPISODES.pins,
    plan: "Basic",
    kind: "phone",
    title: "Parents",
    covers: [
      "/r/[slug]",
      "/r/[slug]: Admission number",
      "/r/[slug]: PIN",
      "/r/[slug]: Check result",
      "journey: Generate result PINs, and a parent checks a result with one",
    ],
    async run(r, ctx) {
      const p = r.page;
      if (!ctx.pin) throw new Error("Record e14-1 first: it makes the PINs.");
      const admissionNo = "ADC/2026/0009";
      await r.go("/r/adalin-college");
      r.caption("A parent opens the result checker on their phone");
      await r.wait(2400);
      await r.type(p.getByLabel("Admission number"), admissionNo);
      r.caption("Their child's admission number, and the PIN from the card");
      await r.type(p.getByLabel("PIN"), "1234-5678-0000");
      await r.click(p.getByRole("button", { name: "Check result" }), 1500);
      await r.offCamera(() => p.waitForURL(/[?&]e=/, { timeout: 15_000 }).catch(() => {}));
      r.caption("A mistyped PIN gets a clear message");
      await r.wait(2600);
      await r.type(p.getByLabel("Admission number"), admissionNo);
      await r.type(p.getByLabel("PIN"), ctx.pin);
      await r.point(p.getByRole("button", { name: "Check result" }));
      await showPdf(
        r,
        () => p.request.post("/r/adalin-college/check", { form: { admissionNo, pin: ctx.pin } }),
        "The report card opens straight away, ready to save or print",
        3600,
      );
    },
  },
];

if (require.main === module) {
  void runStoryboard("series", SCENES);
}
