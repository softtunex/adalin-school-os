/*
 * Building blocks for scripted demo recordings: a visible cursor and tap ripple, smooth pointer
 * moves, typing at human speed, and a timeline of captions and cut ranges for the editor.
 */
import { mkdirSync } from "node:fs";
import { devices, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

export const BASE = process.env.DEMO_URL ?? "http://localhost:3305";
export const SLUG = "adalin-college";
const PACE = Number(process.env.DEMO_PACE ?? 1.5);
export const S = `/s/${SLUG}`;

// Videos record at CSS-pixel size (device scale doesn't sharpen them), so desktop records at
// 1600x900 and the editor scales it to 1080p; the phone plays at its native size inside the frame.
export const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, video: { width: 1600, height: 900 } };
export const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, video: { width: 412, height: 915 } };

export type Mark = { at: number; caption?: string; cut?: "start" | "end" };
export type Take = { id: string; kind: "desktop" | "phone"; title: string; video: string; marks: Mark[]; length: number };

/** A pointer that shows up in the recording, a ripple wherever it presses, and no demo-only notices. */
function pointerScript(phone: boolean) {
  const KEY = "__demo_pointer";
  const mount = () => {
    if (document.getElementById(KEY)) return;
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? '{"x":-100,"y":-100}') as { x: number; y: number };
    const cursor = document.createElement("div");
    cursor.id = KEY;
    Object.assign(cursor.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", display: phone ? "none" : "block", transform: `translate(${saved.x - 3}px, ${saved.y - 2}px)` });
    cursor.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2.5 18.5 12l-6.4 1.4 3.8 7.2-2.7 1.4-3.8-7.3L4 19z" fill="#1d1b19" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    addEventListener("mousemove", (e) => {
      cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`;
      sessionStorage.setItem(KEY, JSON.stringify({ x: e.clientX, y: e.clientY }));
    }, true);
    addEventListener("mousedown", (e) => {
      const size = phone ? 56 : 40;
      const ring = document.createElement("div");
      Object.assign(ring.style, { position: "fixed", left: `${e.clientX - size / 2}px`, top: `${e.clientY - size / 2}px`, width: `${size}px`, height: `${size}px`, borderRadius: "50%", border: "3px solid #fe6007", background: "rgba(254,96,7,0.18)", zIndex: "2147483646", pointerEvents: "none" });
      document.documentElement.appendChild(ring);
      ring.animate([{ transform: "scale(0.4)", opacity: 1 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 550, easing: "ease-out" }).onfinish = () => ring.remove();
    }, true);
  };
  // Demo-server notices ("Test mode: no real money moves...") never appear on the live site.
  const hideNotices = () => {
    for (const el of document.querySelectorAll<HTMLElement>('[role="status"], [role="alert"]')) {
      if (el.textContent?.trim().startsWith("Test mode")) el.style.display = "none";
    }
  };
  const watch = () => {
    mount();
    hideNotices();
    new MutationObserver(hideNotices).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
}

export class Recorder {
  private t0 = 0;
  marks: Mark[] = [];
  page!: Page;
  context!: BrowserContext;
  constructor(private browser: Browser, readonly id: string, readonly kind: "desktop" | "phone", readonly title: string, private dir: string, private storageState?: string) {}

  async open() {
    mkdirSync(this.dir, { recursive: true });
    const size = this.kind === "phone" ? PHONE : DESKTOP;
    const phone = this.kind === "phone" ? { userAgent: devices["Pixel 7"].userAgent, isMobile: true, hasTouch: true } : {};
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
    await this.context.addInitScript(pointerScript, this.kind === "phone");
    this.page = await this.context.newPage();
    this.t0 = Date.now();
    // Nothing worth seeing until the first page has loaded.
    this.cutStart();
    return this.page;
  }

  private now() {
    return (Date.now() - this.t0) / 1000;
  }
  caption(text: string) {
    this.marks.push({ at: this.now(), caption: text });
  }
  cutStart() {
    this.marks.push({ at: this.now(), cut: "start" });
  }
  cutEnd() {
    this.marks.push({ at: this.now(), cut: "end" });
  }

  /** Go somewhere off camera (loading frames are cut), then settle. */
  async go(path: string) {
    if (this.marks.at(-1)?.cut !== "start") this.cutStart();
    await this.page.goto(path);
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(300);
    this.cutEnd();
  }

  /** Hold on the current view. DEMO_PACE stretches every hold (1.5 = comfortable reading speed). */
  async wait(ms: number) {
    await this.page.waitForTimeout(ms * PACE);
  }

  /** Bring an element into view smoothly if it isn't comfortably on screen. */
  async reveal(target: Locator) {
    await target.waitFor({ state: "visible", timeout: 30_000 });
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
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: this.kind === "phone" ? 1 : 28 });
    await this.page.waitForTimeout(this.kind === "phone" ? 150 : 250);
  }

  async click(target: Locator, settle = 700) {
    await this.point(target);
    await this.page.mouse.down();
    await this.page.waitForTimeout(90);
    await this.page.mouse.up();
    await this.page.waitForLoadState("networkidle").catch(() => {});
    await this.page.waitForTimeout(settle);
  }

  async type(target: Locator, text: string) {
    await this.click(target, 200);
    await target.pressSequentially(text, { delay: 75 });
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
    return { id: this.id, kind: this.kind, title: this.title, video: await video.path(), marks: this.marks, length };
  }
}
