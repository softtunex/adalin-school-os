// Compares what the series scenes say they cover with the inventory of every page, tab and button.
// Usage: node scripts/demo-video/inventory.mjs > .data/demo-video/inventory.json
//        npx tsx scripts/demo-video/coverage.mjs [area]      e.g. "/login" or "/s/[slug]/fees"
import { readFileSync } from "node:fs";

const inv = JSON.parse(readFileSync(".data/demo-video/inventory.json", "utf8"));
const { SCENES } = await import("./series.ts");
const covered = new Set(SCENES.flatMap((s) => s.covers ?? []));
const area = process.argv[2];

// Never recorded: Adalin's own console, and print/dev-only pages.
const SKIP = /^\/admin|^\/offline|^\/print|^\/api/;
let total = 0;
let done = 0;
const missing = [];
for (const e of inv) {
  if (SKIP.test(e.route) || (area && !e.route.startsWith(area))) continue;
  const items = [...(e.page ? [e.route] : []), ...e.tabs.map((t) => `${e.route}#${t.split(":")[0]}`), ...e.ctas.filter((c) => !c.includes("…")).map((c) => `${e.route}: ${c}`)];
  for (const it of items) {
    total++;
    if (covered.has(it)) done++;
    else missing.push(it);
  }
}
// What the running app showed each role (crawl.ts), counted too where it exists.
import { existsSync } from "node:fs";
if (!area || area === "live") {
  const live = existsSync(".data/demo-video/inventory-live.json") ? JSON.parse(readFileSync(".data/demo-video/inventory-live.json", "utf8")) : [];
  const liveItems = new Set(live.filter((e) => !SKIP.test(e.route)).flatMap((e) => e.items.filter((i) => i.kind !== "field").map((i) => `${e.route}: ${i.name}`)));
  let liveDone = 0;
  const liveMissing = [];
  for (const it of liveItems) (covered.has(it) ? liveDone++ : liveMissing.push(it));
  if (liveItems.size) console.log(`Running app (every role): covered ${liveDone} of ${liveItems.size}`);
  if (area === "live") console.log(liveMissing.sort().map((m) => `  missing  ${m}`).join("\n"));
}

// PDFs, emails and journeys.
const { CHECKLIST } = await import("./checklist.ts");
const listDone = CHECKLIST.filter((c) => covered.has(c));
console.log(`PDFs, emails and journeys: covered ${listDone.length} of ${CHECKLIST.length}`);
if (area === "checklist") console.log(CHECKLIST.filter((c) => !covered.has(c)).map((m) => `  missing  ${m}`).join("\n"));

console.log(`Code inventory: covered ${done} of ${total} (${Math.round((done / total) * 100)}%)`);
if (area && area !== "live" && area !== "checklist") console.log(missing.map((m) => `  missing  ${m}`).join("\n"));
