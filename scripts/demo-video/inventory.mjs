// Lists every page, tab and button label in the app, so the demo videos can be checked against it.
// Usage: node scripts/demo-video/inventory.mjs > .data/demo-video/inventory.json
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const APP = "src/app";
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(name)) files.push(p.replace(/\\/g, "/"));
  }
})(APP);
// Shared pieces every page carries (menu, page search, school switcher, theme, Kola).
for (const name of readdirSync("src/components")) if (/\.tsx$/.test(name)) files.push(`src/components/${name}`);

// Route of a file: its folder, minus route groups like (auth). Shared components are "shared:<file>".
const routeOf = (f) =>
  f.startsWith("src/components/") ? `shared:${path.basename(f, ".tsx")}` :
  "/" +
  path
    .dirname(f)
    .slice(APP.length + 1)
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .join("/");

const clean = (s) => s.replace(/\{[^}]*\}/g, "…").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const routes = {};
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const r = routeOf(f);
  const entry = (routes[r] ??= { pages: false, tabs: new Set(), ctas: new Set() });
  if (f.endsWith("/page.tsx")) entry.pages = true;
  // Tabs: { key: "x", label: "Y" } lists and ?tab= links.
  for (const m of src.matchAll(/key:\s*"([a-z0-9-]+)",\s*label:\s*"([^"]+)"/g)) entry.tabs.add(`${m[1]}: ${m[2]}`);
  for (const m of src.matchAll(/\?tab=([a-z0-9-]+)/g)) entry.tabs.add(m[1]);
  // Buttons and links that act: <Button…>text</Button>, ButtonLink, SubmitButton, menu items.
  for (const m of src.matchAll(/<(Button|ButtonLink|SubmitButton|MenuItem|DropdownItem|ToolbarLink|Link|a|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = clean(m[2].replace(/<[^>]+>/g, " "));
    if (t && t.length < 60) entry.ctas.add(t);
  }
  for (const m of src.matchAll(/(?:label|title|pendingText|confirmLabel|actionLabel):\s*"([^"]{2,50})"/g)) {
    if (/^[A-Z]/.test(m[1])) entry.ctas.add(m[1]);
  }
}

const out = Object.entries(routes)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([route, e]) => ({ route, page: e.pages, tabs: [...e.tabs].sort(), ctas: [...e.ctas].sort() }))
  .filter((e) => e.page || e.tabs.length || e.ctas.length);
console.log(JSON.stringify(out, null, 1));
