/*
 * Building blocks for scripted demo recordings: a visible cursor and tap ripple, smooth pointer
 * moves, typing at human speed, a timeline of captions and cuts for the editor, saved sign-ins for
 * every role, and a runner that records a storyboard scene by scene.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, devices, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

export const BASE = process.env.DEMO_URL ?? "http://localhost:3305";
export const SLUG = "adalin-college";
export const S = `/s/${SLUG}`;
const PACE = Number(process.env.DEMO_PACE ?? 1.5);

// Videos record at CSS-pixel size (device scale doesn't sharpen them), so desktop records at
// 1600x900 and the editor scales it to 1080p; the phone plays at its native size inside the frame.
export const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, video: { width: 1600, height: 900 } };
export const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, video: { width: 412, height: 915 } };

export type Plan = "Free" | "Basic" | "Standard" | "Premium" | "Enterprise";
export type Mark = { at: number; caption?: string; tag?: string; cut?: "start" | "end" };
export type Take = { id: string; chapter: string; plan?: Plan; kind: "desktop" | "phone"; title: string; video: string; marks: Mark[]; length: number };

/** Values one scene hands to a later one (a new school's address, an invitation link). Kept on disk so a scene can be re-recorded alone. */
export type Ctx = Record<string, string>;

export type Scene = {
  id: string;
  chapter: string;
  /** The cheapest plan that has this; shown as a badge on the captions. */
  plan?: Plan;
  kind: "desktop" | "phone";
  /** Phone scenes: the label above the caption (e.g. "Teachers"). */
  title: string;
  /** Whose saved sign-in to start with (see ACCOUNTS); none for a visitor. */
  as?: string;
  /** Save this scene's sign-in under a name, for later scenes. */
  saveAs?: string;
  run: (r: Recorder, ctx: Ctx) => Promise<void>;
};

/** In-page helpers (clock, pointer, hidden demo notices); see browser.js. */
const BROWSER_JS = readFileSync(path.join("scripts", "demo-video", "browser.js"), "utf8");

/** How far the demo server's clock is moved, as written by scripts/demo-server.ts. */
export function serverClockOffset() {
  const file = path.join(".data", "demo-video", "clock.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { offsetMs: number }).offsetMs : 0;
}

export class Recorder {
  private t0 = 0;
  marks: Mark[] = [];
  page!: Page;
  context!: BrowserContext;
  constructor(private browser: Browser, readonly scene: Scene, private dir: string, private storageState?: string) {}

  get phone() {
    return this.scene.kind === "phone";
  }

  async open() {
    mkdirSync(this.dir, { recursive: true });
    const size = this.phone ? PHONE : DESKTOP;
    const phone = this.phone ? { userAgent: devices["Pixel 7"].userAgent, isMobile: true, hasTouch: true } : {};
    this.context = await this.browser.newContext({
      ...phone,
      viewport: size.viewport,
      deviceScaleFactor: size.deviceScaleFactor,
      recordVideo: { dir: this.dir, size: size.video },
      storageState: this.storageState,
      baseURL: BASE,
      bypassCSP: true,
      timezoneId: "Africa/Lagos",
      locale: "en-NG",
    });
    const demo = JSON.stringify({ offset: serverClockOffset(), phone: this.phone });
    await this.context.addInitScript({ content: `window.__DEMO = ${demo};\n${BROWSER_JS}` });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(20_000);
    this.t0 = Date.now();
    // Nothing worth seeing until the first page has loaded.
    this.cutStart();
    return this.page;
  }

  private now() {
    return (Date.now() - this.t0) / 1000;
  }
  /** Show a caption from now until the next one. `tag` overrides the scene's plan badge. */
  caption(text: string, tag?: string) {
    this.marks.push({ at: this.now(), caption: text, tag });
  }
  cutStart() {
    if (this.marks.at(-1)?.cut !== "start") this.marks.push({ at: this.now(), cut: "start" });
  }
  cutEnd() {
    this.marks.push({ at: this.now(), cut: "end" });
  }
  /** Do something off camera (waiting on a slow step, a test checkout). */
  async offCamera<T>(work: () => Promise<T>) {
    this.cutStart();
    const out = await work();
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(300);
    this.cutEnd();
    return out;
  }

  /** Go somewhere off camera (loading frames are cut), then settle. */
  async go(url: string) {
    await this.offCamera(() => this.page.goto(url));
  }

  /** Hold on the current view. DEMO_PACE stretches every hold (1.5 = comfortable reading speed). */
  async wait(ms: number) {
    await this.page.waitForTimeout(ms * PACE);
  }

  /** Bring an element into view smoothly if it isn't comfortably on screen. */
  async reveal(target: Locator) {
    await target.waitFor({ state: "visible" });
    const onScreen = await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 80 && r.bottom <= innerHeight - 110;
    });
    if (!onScreen) {
      await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await this.page.waitForTimeout(900);
    }
  }

  async point(target: Locator) {
    await this.reveal(target);
    const box = (await target.boundingBox())!;
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: this.phone ? 1 : 28 });
    await this.page.waitForTimeout(this.phone ? 150 : 250);
  }

  async click(target: Locator, settle = 700) {
    await this.point(target);
    await this.page.mouse.down();
    await this.page.waitForTimeout(90);
    await this.page.mouse.up();
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(settle);
  }

  /** Press something whose result happens off camera (e.g. a test checkout): the cut starts as it's pressed. */
  async clickIntoCut(target: Locator) {
    await this.point(target);
    await this.page.mouse.down();
    await this.page.waitForTimeout(90);
    this.cutStart();
    await this.page.mouse.up();
  }

  async type(target: Locator, text: string) {
    await this.click(target, 200);
    await target.fill("");
    await target.pressSequentially(text, { delay: this.phone ? 55 : 70 });
    await this.page.waitForTimeout(400);
  }

  /** Pick from a native select: point at it, then choose (the open list isn't drawn in recordings). */
  async select(target: Locator, option: string | { label: string }) {
    await this.point(target);
    await target.selectOption(option);
    await this.page.waitForTimeout(500);
  }

  /** Scroll the page by a distance, smoothly. */
  async scroll(by: number, settle = 1100) {
    await this.page.evaluate((y) => {
      const main = [...document.querySelectorAll<HTMLElement>("main, [data-scroll]")].find((el) => el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== "visible");
      (main ?? window).scrollBy({ top: y, behavior: "smooth" });
    }, by);
    await this.page.waitForTimeout(settle);
  }

  async close(): Promise<Take> {
    const length = this.now();
    const video = this.page.video()!;
    await this.context.close();
    const { id, chapter, plan, kind, title } = this.scene;
    return { id, chapter, plan, kind, title, video: await video.path(), marks: this.marks, length };
  }
}

/* ---------- Sign-ins ---------- */

const staff = (email: string) => async (page: Page) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Demo2026!");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(s|g)\/|\/schools/, { timeout: 60_000 });
};

/** Every demo person, signed in off camera the first time a scene needs them. */
export const ACCOUNTS: Record<string, (page: Page) => Promise<void>> = {
  owner: staff("director@demo.adalinschoolhub.ng"),
  principal: staff("ogunleye0@demo.adalinschoolhub.ng"),
  admin: staff("nwosu1@demo.adalinschoolhub.ng"),
  bursar: staff("musa2@demo.adalinschoolhub.ng"),
  teacher: staff("adeyemi3@demo.adalinschoolhub.ng"),
  maths: staff("obi4@demo.adalinschoolhub.ng"),
  librarian: staff("librarian6@demo.adalinschoolhub.ng"),
  storekeeper: staff("storekeeper7@demo.adalinschoolhub.ng"),
  nurse: staff("nurse8@demo.adalinschoolhub.ng"),
  transport: staff("transport9@demo.adalinschoolhub.ng"),
  warden: staff("warden10@demo.adalinschoolhub.ng"),
  enterprise: staff("enterprise@demo.adalinschoolhub.ng"),
  parent: async (page) => {
    await page.goto("/parent");
    await page.getByLabel("Phone number or email").fill("parent8@example.com");
    await page.getByRole("button", { name: "Send me a code" }).click();
    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/p$/, { timeout: 60_000 });
  },
  student: async (page) => {
    await page.goto(`/student?school=${SLUG}`);
    await page.getByLabel("Admission number").fill("ADC/2026/0009");
    await page.getByLabel("Password").fill("Student2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/learn/, { timeout: 60_000 });
  },
};

/* ---------- Runner ---------- */

/**
 * Records a storyboard: every scene, or only the ids given on the command line. A scene that fails
 * is reported (with a screenshot) and the rest carry on, so one run shows every problem.
 */
export async function runStoryboard(name: string, scenes: Scene[]) {
  const out = path.join(".data", "demo-video", name);
  const sessions = path.join(out, "sessions");
  mkdirSync(sessions, { recursive: true });
  const only = process.argv.slice(2);
  const ctxFile = path.join(out, "ctx.json");
  const ctx: Ctx = existsSync(ctxFile) ? JSON.parse(readFileSync(ctxFile, "utf8")) : {};
  const takesFile = path.join(out, "takes.json");
  const takes: Take[] = existsSync(takesFile) ? JSON.parse(readFileSync(takesFile, "utf8")) : [];
  const order = new Map(scenes.map((s, i) => [s.id, i]));
  const browser = await chromium.launch();

  const sessionFor = async (who: string) => {
    const file = path.join(sessions, `${who}.json`);
    if (!existsSync(file)) {
      const signIn = ACCOUNTS[who];
      if (!signIn) throw new Error(`No sign-in for "${who}"; record the scene that saves it first.`);
      const context = await browser.newContext({ baseURL: BASE });
      await signIn(await context.newPage());
      await context.storageState({ path: file });
      await context.close();
    }
    return file;
  };

  const failed: string[] = [];
  for (const scene of scenes.filter((s) => !only.length || only.includes(s.id) || only.includes(s.chapter))) {
    process.stdout.write(`Recording ${scene.id}... `);
    let r: Recorder | null = null;
    try {
      r = new Recorder(browser, scene, path.join(out, "raw"), scene.as ? await sessionFor(scene.as) : undefined);
      await r.open();
      await scene.run(r, ctx);
      if (scene.saveAs) await r.context.storageState({ path: path.join(sessions, `${scene.saveAs}.json`) });
      const take = await r.close();
      const i = takes.findIndex((t) => t.id === take.id);
      if (i >= 0) takes[i] = take;
      else takes.push(take);
      takes.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
      writeFileSync(takesFile, JSON.stringify(takes, null, 1));
      writeFileSync(ctxFile, JSON.stringify(ctx, null, 1));
      console.log(`${take.length.toFixed(1)}s`);
    } catch (e) {
      failed.push(scene.id);
      console.log(`FAILED: ${(e as Error).message.split("\n")[0]}`);
      await r?.page?.screenshot({ path: path.join(out, `${scene.id}-failed.png`) }).catch(() => {});
      await r?.context?.close().catch(() => {});
    }
  }
  await browser.close();
  if (failed.length) {
    console.log(`\n${failed.length} scene(s) failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}
