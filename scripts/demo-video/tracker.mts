/*
 * Builds the series tracker page (.data/demo-video/tracker.html) from the storyboard itself, so it can't
 * drift: episodes and scenes from series.ts, PDFs/emails/journeys from checklist.ts, pages, tabs and
 * buttons from the code inventory. Re-run after every episode, then republish the page.
 *
 *   npx tsx scripts/demo-video/tracker.mts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { SCENES, EPISODES } from "./series.ts";
import { PDFS, EMAILS, JOURNEYS } from "./checklist.ts";

const inv = JSON.parse(readFileSync(".data/demo-video/inventory.json", "utf8"));
const takes: { id: string; length: number }[] = existsSync(".data/demo-video/series/takes.json") ? JSON.parse(readFileSync(".data/demo-video/series/takes.json", "utf8")) : [];
const covered = new Set(SCENES.flatMap((s) => s.covers ?? []));
const SKIP = /^\/admin|^\/offline|^\/print|^\/api/;

// What each upcoming episode is meant to cover, so the plan is visible before it's recorded.
const PLAN: Record<string, string> = {
  pins: "PINs page, printed PIN cards, the public result checker",
  homework: "Assignments, submissions and marking; lesson notes and approval",
  cbt: "Question bank, exam builder, a student sitting a test, auto-marking, scripts",
  materials: "Learning materials for each class and subject",
  behaviour: "Merits and incidents, telling parents; the library and lending",
  care: "Bus routes, boarding and exeats, sick bay visits",
  comms: "Announcements, the school calendar, staff and parent messages",
  fees: "Fee structure, invoices, online and cash payments, debtors, discounts, receipts",
  money: "Expenses, payroll runs and payslips",
  hr: "Staff clock-in, leave requests and approvals",
  documents: "ID cards, testimonials, certificates, transcripts, letters, QR verification",
  records: "Inventory and the audit log",
  kola: "Asking Kola, and every AI helper in the app",
  parent: "The parent app, reading report cards, paying fees",
  student: "The student app: homework, CBT, results, materials, library",
  enterprise: "Group dashboard, API documentation, sign-in rules, a second campus",
};

const keys = Object.keys(EPISODES) as (keyof typeof EPISODES)[];
const episodes = keys.map((k, i) => {
  const title = EPISODES[k];
  const scenes = SCENES.filter((s) => s.chapter === title);
  const plans = [...new Set(scenes.map((s) => s.plan).filter(Boolean))];
  const secs = scenes.reduce((n, s) => n + (takes.find((t) => t.id === s.id)?.length ?? 0), 0);
  return { n: i + 1, key: k, title, scenes: scenes.map((s) => s.title), plans, secs, done: scenes.length > 0, plan: PLAN[k] ?? "" };
});

const counts = { page: [0, 0], tab: [0, 0], cta: [0, 0] };
const pagesLeft: string[] = [];
for (const e of inv) {
  if (SKIP.test(e.route)) continue;
  const shown = covered.has(e.route) || [...covered].some((x) => x.startsWith(`${e.route}:`) || x.startsWith(`${e.route}#`));
  if (e.page) {
    counts.page[1]++;
    if (shown) counts.page[0]++;
    else pagesLeft.push(e.route);
  }
  for (const t of e.tabs) {
    counts.tab[1]++;
    if (covered.has(`${e.route}#${t.split(":")[0]}`)) counts.tab[0]++;
  }
  for (const c of e.ctas.filter((c: string) => !c.includes("…"))) {
    counts.cta[1]++;
    if (covered.has(`${e.route}: ${c}`)) counts.cta[0]++;
  }
}
const list = (items: string[]) => items.map((x) => ({ name: x.replace(/^(pdf|email|journey): /, ""), done: covered.has(x) }));
const pdfs = list(PDFS);
const emails = list(EMAILS);
const journeys = list(JOURNEYS);
const doneEps = episodes.filter((e) => e.done).length;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const mins = (s: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const bar = (label: string, [d, t]: number[], note = "") => `
  <div class="stat"><div class="stat-top"><span class="label">${label}</span><span class="num">${d}<span class="of"> / ${t}</span></span></div>
  <div class="track"><div class="fill" style="width:${t ? Math.round((d / t) * 100) : 0}%"></div></div>
  <span class="note">${t - d} left${note ? ` · ${note}` : ""}</span></div>`;
const checks = (items: { name: string; done: boolean }[]) =>
  `<ul class="checks">${items.map((i) => `<li class="${i.done ? "done" : ""}"><span class="box" aria-hidden="true">${i.done ? "✓" : ""}</span>${esc(i.name)}</li>`).join("")}</ul>`;

const updated = new Date().toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SchoolHub Video Series</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f6f4;--card:#fff;--ink:#1d1b19;--body:#45413c;--muted:#7a746d;--line:#e6e2dc;--brand:#fe6007;--brand-wash:#fff0e6;--ok:#1b7a30;--ok-wash:#e7f4ea;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171513;--card:#211e1b;--ink:#f3efe9;--body:#d4cec6;--muted:#9a938b;--line:#36312c;--brand:#ff7a2e;--brand-wash:#3a2214;--ok:#5cc075;--ok-wash:#1b2e20;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#171513;--card:#211e1b;--ink:#f3efe9;--body:#d4cec6;--muted:#9a938b;--line:#36312c;--brand:#ff7a2e;--brand-wash:#3a2214;--ok:#5cc075;--ok-wash:#1b2e20;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--body);font:15px/1.5 Inter,system-ui,sans-serif}
main{max-width:1080px;margin:0 auto;padding-inline:16px;padding-block:32px 64px;display:flex;flex-direction:column;gap:28px}
h1,h2{font-family:Nunito,system-ui,sans-serif;color:var(--ink);margin:0;text-wrap:balance}h1{font-size:34px;font-weight:900}h2{font-size:21px;font-weight:800}
.lede{margin:6px 0 0;color:var(--muted)}.word b{color:var(--brand)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.stat-top{display:flex;justify-content:space-between;align-items:baseline}.label{font-weight:600;color:var(--ink)}
.num{font-variant-numeric:tabular-nums;font-weight:600;color:var(--ink);font-size:20px}.of{color:var(--muted);font-size:14px;font-weight:500}
.track{height:8px;border-radius:99px;background:var(--line);overflow:hidden}.fill{height:100%;background:var(--brand);border-radius:99px}
.note{font-size:13px;color:var(--muted)}
section{display:flex;flex-direction:column;gap:12px}
.table{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:14px}
table{width:100%;border-collapse:collapse;min-width:640px}th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}tr:last-child td{border-bottom:0}
td.n{font-variant-numeric:tabular-nums;color:var(--muted);width:44px}td.t{color:var(--ink);font-weight:600}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.pill.done{background:var(--ok-wash);color:var(--ok)}.pill.todo{background:var(--brand-wash);color:var(--brand)}
.scenes{font-size:13.5px;color:var(--muted)}tr.next td{background:var(--brand-wash)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}.panel h3{margin:0 0 10px;font-size:15px;color:var(--ink)}
.checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:14px}
.checks li{display:flex;gap:9px;align-items:flex-start}.box{flex:none;width:18px;height:18px;border-radius:5px;border:1.5px solid var(--line);display:grid;place-items:center;font-size:12px;margin-top:2px}
.checks li.done{color:var(--muted)}.checks li.done .box{background:var(--ok);border-color:var(--ok);color:#fff}
.pages{columns:3 220px;font-size:13.5px;font-family:ui-monospace,Menlo,monospace;color:var(--body);margin:0;padding:0;list-style:none}.pages li{break-inside:avoid;padding:2px 0}
footer{font-size:13px;color:var(--muted)}
</style></head><body><main>
<header><h1 class="word">adalin <b>schoolhub</b> video series</h1>
<p class="lede">Every page, tab, button and flow, one episode at a time. Updated ${esc(updated)}.</p></header>

<div class="stats">
${bar("Episodes", [doneEps, episodes.length])}
${bar("Pages", counts.page)}
${bar("Tabs", counts.tab)}
${bar("Buttons and links", counts.cta, "counted strictly")}
${bar("Journeys", [journeys.filter((j) => j.done).length, journeys.length])}
${bar("PDFs", [pdfs.filter((j) => j.done).length, pdfs.length])}
${bar("Emails", [emails.filter((j) => j.done).length, emails.length])}
</div>

<section><h2>Episodes</h2><div class="table"><table>
<thead><tr><th>#</th><th>Episode</th><th>Status</th><th>Plan</th><th>Length</th><th>Scenes, or what it will cover</th></tr></thead><tbody>
${episodes
  .map((e, i) => {
    const next = !e.done && (i === 0 || episodes[i - 1].done);
    return `<tr class="${next ? "next" : ""}"><td class="n">${e.n}</td><td class="t">${esc(e.title)}</td><td><span class="pill ${e.done ? "done" : "todo"}">${e.done ? "Done" : next ? "Next" : "To do"}</span></td><td>${esc(e.plans.join(", "))}</td><td class="n">${mins(e.secs)}</td><td class="scenes">${esc(e.done ? e.scenes.join(" · ") : e.plan)}</td></tr>`;
  })
  .join("\n")}
</tbody></table></div></section>

<section><h2>Journeys, PDFs and emails</h2><div class="cols">
<div class="panel"><h3>Journeys (${journeys.filter((j) => j.done).length} of ${journeys.length})</h3>${checks(journeys)}</div>
<div class="panel"><h3>PDFs (${pdfs.filter((j) => j.done).length} of ${pdfs.length})</h3>${checks(pdfs)}<h3 style="margin-top:18px">Emails (${emails.filter((j) => j.done).length} of ${emails.length})</h3>${checks(emails)}</div>
</div></section>

<section><h2>Pages still to show (${pagesLeft.length})</h2><div class="panel"><ul class="pages">${pagesLeft.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div></section>

<footer>Counts come from the storyboard: a button only counts when a scene names it word for word, so the buttons figure runs low. Built by scripts/demo-video/tracker.mts.</footer>
</main></body></html>`;

writeFileSync(".data/demo-video/tracker.html", html);
console.log(`tracker: ${doneEps}/${episodes.length} episodes, pages ${counts.page.join("/")}, tabs ${counts.tab.join("/")}, buttons ${counts.cta.join("/")}`);
