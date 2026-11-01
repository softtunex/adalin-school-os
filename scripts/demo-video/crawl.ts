/*
 * Walks the running demo app as every role and lists what each person can actually see: every page in
 * their menu, every tab, and every button and link, including the ones inside menus and pop-ups (opened,
 * read, then closed with Escape). It never presses anything that saves, so the demo data is untouched.
 * Demo server only (scripts/demo-server.ts). Writes .data/demo-video/inventory-live.json.
 *
 *   npx tsx scripts/demo-video/crawl.ts            every role
 *   npx tsx scripts/demo-video/crawl.ts teacher    one role
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { ACCOUNTS, BASE } from "./kit";

const OUT = path.join(".data", "demo-video", "inventory-live.json");
const ROLES = Object.keys(ACCOUNTS);
const only = process.argv.slice(2);

/** A visited address as a route pattern: the school's address becomes [slug], ids become [id]. */
function routeOf(url: string) {
  const u = new URL(url);
  const parts = u.pathname.split("/").map((s, i, all) => {
    if ((all[i - 1] === "s" || all[i - 1] === "g") && i === 2) return "[slug]";
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s) || /^[A-Za-z0-9_-]{20,}$/.test(s) || /^\d+$/.test(s)) return "[id]";
    return s;
  });
  return parts.join("/") || "/";
}

/** Visible buttons, links, tabs and form fields on the page, by their accessible names. */
async function controls(page: Page, scope = "body") {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel) ?? document.body;
    const seen = new Set<string>();
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const name = (el: Element) =>
      (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || (el as HTMLInputElement).value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 70);
    const out: { kind: string; name: string }[] = [];
    const add = (kind: string, n: string) => {
      const k = `${kind}:${n}`;
      if (n && !seen.has(k)) {
        seen.add(k);
        out.push({ kind, name: n });
      }
    };
    root.querySelectorAll('[role="tab"]').forEach((el) => visible(el) && add("tab", name(el)));
    root.querySelectorAll('button, [role="button"], a[href], [role="menuitem"], summary').forEach((el) => {
      if (!visible(el) || el.closest('[role="tablist"]')) return;
      add(el.tagName === "A" ? "link" : el.getAttribute("role") === "menuitem" ? "menuitem" : "button", name(el));
    });
    root.querySelectorAll("label").forEach((el) => visible(el) && add("field", name(el)));
    return out;
  }, scope);
}

type Entry = { role: string; route: string; tab?: string; via?: string; items: { kind: string; name: string }[] };

async function crawlRole(role: string, browser: import("@playwright/test").Browser): Promise<Entry[]> {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
  // tsx names inner functions with a __name helper; the page needs it too for the code we run inside it.
  await context.addInitScript({ content: "window.__name = (f) => f;" });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await ACCOUNTS[role](page);
  // Sign-in can pass through /schools on its way in: let the redirects finish.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  // Some people land on the school picker first: record it, then step into their (first) school.
  if (new URL(page.url()).pathname === "/schools") {
    const school = page.locator('main a[href^="/s/"], a[href^="/s/"]').first();
    if (await school.count()) await page.goto(await school.evaluate((a) => (a as HTMLAnchorElement).href));
  }
  const start = page.url();
  const entries: Entry[] = [];
  const seenPages = new Set<string>();

  // Every page in this person's menu (groups opened first), plus the page they land on.
  const navLinks = async () => {
    const nav = page.getByRole("navigation", { name: "Main" });
    if (await nav.count()) {
      for (const g of await nav.getByRole("button").all()) if ((await g.getAttribute("aria-expanded", { timeout: 2000 }).catch(() => null)) === "false") await g.click({ timeout: 2000 }).catch(() => {});
      return nav.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    }
    return page.locator("nav a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  };
  const queue = [start, ...(await navLinks())].filter((u) => u.startsWith(BASE));

  // Pages one level down (a student's profile, a class's results) via the first matching link on each page.
  const visit = async (url: string, via?: string) => {
    const key = routeOf(url) + new URL(url).search.replace(/[?&](page|q|sort)=[^&]*/g, "");
    if (seenPages.has(key) || seenPages.size > 400) return;
    seenPages.add(key);
    const res = await page.goto(url).catch(() => null);
    if (!res || res.status() >= 400) return;
    await page.waitForLoadState("networkidle").catch(() => {});
    const tab = new URL(page.url()).searchParams.get("tab") ?? undefined;
    entries.push({ role, route: routeOf(page.url()), tab, via, items: await controls(page, "main") });

    // Menus and pop-ups: open, read, close. Only controls that say they open one.
    const openers = page.locator('main [aria-haspopup]:visible, main [aria-expanded="false"]:visible');
    const n = Math.min(await openers.count(), 25);
    for (let i = 0; i < n; i++) {
      // A menu can re-render the page; anything that has gone is skipped, not waited for.
      const o = openers.nth(i);
      if (!(await o.isVisible().catch(() => false))) continue;
      const label = ((await o.getAttribute("aria-label", { timeout: 2000 }).catch(() => null)) ?? (await o.innerText({ timeout: 2000 }).catch(() => ""))).trim().slice(0, 60);
      if (/delete|remove|publish|approve|pay|send|log ?out|sign out/i.test(label)) continue;
      await o.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(300);
      const pop = page.locator('[role="menu"]:visible, [role="dialog"]:visible, [role="listbox"]:visible').last();
      if (await pop.count()) {
        const items = await pop.evaluate((el) => {
          const out: { kind: string; name: string }[] = [];
          el.querySelectorAll('button, a[href], [role="menuitem"], [role="option"], label, [role="tab"]').forEach((c) => {
            const n = (c.getAttribute("aria-label") || (c as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().slice(0, 70);
            if (n) out.push({ kind: c.getAttribute("role") ?? c.tagName.toLowerCase(), name: n });
          });
          return out;
        });
        entries.push({ role, route: routeOf(page.url()), tab, via: `opened: ${label}`, items });
      }
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(150);
    }

    // Tabs on this page, each visited.
    const tabLinks = await page.locator('main [role="tablist"] a[href], main a[href*="?tab="]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const t of tabLinks) if (t.startsWith(BASE)) await visit(t, `tab of ${routeOf(url)}`);
    return page.locator("main a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  };

  // One page that misbehaves is noted and skipped; the rest of this person's pages still get read.
  const safeVisit = (url: string, via?: string) =>
    visit(url, via).catch((e: Error) => {
      console.log(`  ${role}: skipped ${routeOf(url)} (${e.message.split("\n")[0].slice(0, 80)})`);
      return [] as string[];
    });
  for (const url of queue) {
    const inner = (await safeVisit(url)) ?? [];
    // One level deeper: the first link to each kind of sub-page (e.g. one student, one invoice).
    const kinds = new Map<string, string>();
    for (const h of inner) if (h.startsWith(BASE) && !kinds.has(routeOf(h))) kinds.set(routeOf(h), h);
    for (const h of kinds.values()) await safeVisit(h, `from ${routeOf(url)}`);
  }
  await context.close();
  console.log(`${role}: ${seenPages.size} pages and tabs`);
  return entries;
}

async function main() {
  mkdirSync(path.dirname(OUT), { recursive: true });
  const previous: Entry[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
  const roles = only.length ? only : ROLES;
  const browser = await chromium.launch();
  const fresh: Entry[] = [];
  for (const role of roles) {
    try {
      fresh.push(...(await crawlRole(role, browser)));
    } catch (e) {
      console.log(`${role}: FAILED ${(e as Error).message.split("\n")[0]}`);
    }
  }
  await browser.close();
  const kept = previous.filter((e) => !roles.includes(e.role));
  writeFileSync(OUT, JSON.stringify([...kept, ...fresh], null, 1));
  const items = new Set([...kept, ...fresh].flatMap((e) => e.items.map((i) => `${e.route}: ${i.name}`)));
  console.log(`Saved ${OUT}: ${new Set([...kept, ...fresh].map((e) => e.route)).size} routes, ${items.size} distinct controls`);
}

void main();
