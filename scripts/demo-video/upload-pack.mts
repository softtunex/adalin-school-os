/*
 * The YouTube upload pack for the voiced series: a title, description and chapter timestamps per episode,
 * timed from the finished videos (series/voiced/), so pauses added by mix.mts are counted.
 *
 *   npx tsx scripts/demo-video/upload-pack.mts
 *
 * Writes .data/demo-video/upload-pack.html (Copy buttons per episode) and upload-pack.json (the same,
 * for linking Kola to each chapter once the videos have their YouTube addresses).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { EPISODES } from "./series";

const MIN_CHAPTER = 10; // YouTube ignores chapters shorter than this
const titles = Object.values(EPISODES) as string[];
const voiced = readdirSync(".data/demo-video/series/voiced").filter((f) => f.endsWith(".lines.json"));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const episodes = titles.map((title, i) => {
  const n = i + 1;
  const nn = String(n).padStart(2, "0");
  const script: { lines: { scene?: string }[] } = JSON.parse(readFileSync(`.data/demo-video/voiceover/${nn}.json`, "utf8"));
  const file = voiced.find((f) => f.startsWith(nn + "-"))!;
  const placed: { at: number }[] = JSON.parse(readFileSync(`.data/demo-video/series/voiced/${file}`, "utf8"));
  const end = placed[placed.length - 1].at; // the closing line, on the end card

  // A chapter per scene, starting where its first line plays. Too-short scenes join the one before.
  const chapters: { at: number; name: string }[] = [];
  script.lines.forEach((l, k) => {
    if (!l.scene || script.lines[k - 1]?.scene === l.scene) return;
    chapters.push({ at: chapters.length ? placed[k].at : 0, name: l.scene });
  });
  for (let k = chapters.length - 1; k > 0; k--) {
    const next = chapters[k + 1]?.at ?? end;
    if (next - chapters[k].at < MIN_CHAPTER) chapters.splice(k, 1);
  }
  const scenes = [...new Set(script.lines.map((l) => l.scene).filter(Boolean))] as string[];
  const ytTitle = `SchoolHub Tutorial ${n} of 30: ${title}`;
  const description = [
    `Part ${n} of the Adalin SchoolHub tutorial series. This episode covers ${scenes.length > 1 ? scenes.slice(0, -1).join(", ").toLowerCase() + " and " + scenes[scenes.length - 1].toLowerCase() : scenes[0].toLowerCase()}.`,
    "",
    "Chapters",
    ...chapters.map((c) => `${clock(c.at)} ${c.name}`),
    "",
    "Need help with something else? Ask Kola, the helper inside SchoolHub, or watch the rest of the series in the playlist.",
    "",
    "Adalin SchoolHub: https://schoolhub.adalintech.com",
  ].join("\n");
  return { n, title, file: file.replace(/\.lines\.json$/, ".mp4"), ytTitle, description, chapters, chaptersWork: chapters.length >= 3 };
});

// Keep the YouTube links already recorded by youtube-upload.mts.
const known = new Map<number, string>();
try {
  for (const e of JSON.parse(readFileSync(".data/demo-video/upload-pack.json", "utf8"))) known.set(e.n, e.url ?? "");
} catch {}
writeFileSync(".data/demo-video/upload-pack.json", JSON.stringify(episodes.map(({ n, title, file, ytTitle, chapters }) => ({ n, title, file, ytTitle, chapters, url: known.get(n) ?? "" })), null, 1));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const few = episodes.filter((e) => !e.chaptersWork).map((e) => e.n);
const html = `<title>SchoolHub Upload Pack</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f6f4;--card:#fff;--ink:#1d1b19;--body:#3f3b36;--muted:#7a746d;--line:#e6e2dc;--soft:#f1eee9;--brand:#fe6007;--brand-ink:#b84300;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171513;--card:#211e1b;--ink:#f3efe9;--body:#ddd6cd;--muted:#9a938b;--line:#36312c;--soft:#2a2622;--brand:#ff7a2e;--brand-ink:#ff9a5c;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#171513;--card:#211e1b;--ink:#f3efe9;--body:#ddd6cd;--muted:#9a938b;--line:#36312c;--soft:#2a2622;--brand:#ff7a2e;--brand-ink:#ff9a5c;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--body);font:16px/1.55 Inter,system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding-inline:16px;padding-block:32px 72px;display:flex;flex-direction:column;gap:22px}
h1,h2{font-family:Nunito,system-ui,sans-serif;color:var(--ink);margin:0;text-wrap:balance}h1{font-size:32px;font-weight:900}h2{font-size:20px;font-weight:800}
.lede{margin:6px 0 0;color:var(--muted);max-width:68ch}
.steps{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px}.steps ol{margin:8px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:6px}.steps b{color:var(--ink)}
.toc{display:flex;flex-wrap:wrap;gap:6px}.toc a{font-size:13.5px;color:var(--body);text-decoration:none;border:1px solid var(--line);background:var(--card);border-radius:99px;padding:4px 11px}.toc a:hover{border-color:var(--brand);color:var(--brand-ink)}
section.ep{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;scroll-margin-top:12px}
.ep-head{padding:16px 18px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:2px}
.file{font:13px ui-monospace,Consolas,monospace;color:var(--muted);overflow-wrap:anywhere}
.field{padding:14px 18px;display:flex;flex-direction:column;gap:8px}.field+.field{border-top:1px solid var(--line)}
.label{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.box{background:var(--soft);border-radius:10px;padding:12px 14px;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
button{font:600 13.5px Inter,system-ui,sans-serif;color:#fff;background:var(--brand);border:0;border-radius:9px;padding:7px 13px;cursor:pointer;text-transform:none;letter-spacing:0}
footer{font-size:13px;color:var(--muted)}
</style>
<main>
<header><h1>SchoolHub upload pack</h1>
<p class="lede">Titles, descriptions and chapter times for the 30 tutorial episodes, timed from the finished voiced videos. Upload each as Unlisted and add it to the playlist in order.</p></header>
<div class="steps"><b>For each episode</b><ol>
<li>YouTube Studio → <b>Create → Upload videos</b>, and pick the file named under the episode (in <code>.data/demo-video/series/voiced/</code>).</li>
<li>Paste the <b>title</b> and the <b>description</b>. The chapter times in the description become chapters on the video automatically.</li>
<li><b>Playlists:</b> choose "Adalin SchoolHub: Tutorial Series" (create it with the first upload, set to Unlisted).</li>
<li><b>Audience:</b> "No, it's not made for kids".</li>
<li><b>Visibility:</b> <b>Unlisted</b>, then Save.</li>
</ol></div>
<nav class="toc">${episodes.map((e) => `<a href="#ep${e.n}">${e.n}. ${esc(e.title)}</a>`).join("")}</nav>
${episodes
  .map(
    (e) => `<section class="ep" id="ep${e.n}">
<div class="ep-head"><h2>${e.n}. ${esc(e.title)}</h2><div class="file">${esc(e.file)}</div></div>
<div class="field"><div class="label">Title<button type="button">Copy</button></div><div class="box">${esc(e.ytTitle)}</div></div>
<div class="field"><div class="label">Description<button type="button">Copy</button></div><div class="box">${esc(e.description)}</div></div>
</section>`,
  )
  .join("\n")}
<footer>${few.length ? `Episodes ${few.join(", ")} have fewer than three chapters, so YouTube shows no chapter bar on them; the times still work as links. ` : ""}Chapters shorter than ${MIN_CHAPTER} seconds are folded into the one before.</footer>
</main>
<script>
document.addEventListener("click", (ev) => {
  const b = ev.target.closest(".field button");
  if (!b) return;
  const box = b.closest(".field").querySelector(".box");
  const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500); };
  navigator.clipboard.writeText(box.textContent).then(done, () => {
    const r = document.createRange(); r.selectNodeContents(box);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Press Ctrl+C";
  });
});
</script>`;
writeFileSync(".data/demo-video/upload-pack.html", html);
console.log(`upload pack: ${episodes.length} episodes, ${episodes.reduce((s, e) => s + e.chapters.length, 0)} chapters; fewer than 3 chapters: ${few.join(", ") || "none"}`);
