/*
 * Voiceover narration for the series, ready to paste into a text-to-speech tool. Each episode is plain
 * spoken text only: the title, one paragraph per scene (scripts/demo-video/narration.json), and the
 * closing line. Every paragraph is checked against its scene's real length in the finished episode.
 *
 * Writes .data/demo-video/voiceover.html (a page with a Copy button per episode) and one text file per
 * episode in .data/demo-video/voiceover/ (01.txt ... 30.txt).
 *
 *   npx tsx scripts/demo-video/voiceover.mts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { EPISODES } from "./series";
import type { Take } from "./kit";

const takes: Take[] = JSON.parse(readFileSync(".data/demo-video/series/takes.json", "utf8"));
const narration: Record<string, string> = JSON.parse(readFileSync("scripts/demo-video/narration.json", "utf8"));

const OUTRO_LINE = "Book a demo for your school. Adalin Technologies, adalintechnologies.com.";
const WORDS_PER_SECOND = 2.5; // a typical text-to-speech pace

// Each scene's length in the finished episode, measured from its clip: "<take id> <hh:mm:ss.ss>".
const measured = new Map<string, number>();
for (const line of readFileSync(".data/demo-video/series/clip-lengths.txt", "utf8").split("\n")) {
  const [id, d] = line.trim().split(" ");
  if (!id || !d) continue;
  const [h, m, s] = d.split(":").map(Number);
  measured.set(id, h * 3600 + m * 60 + s);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const problems: string[] = [];
const titles = Object.values(EPISODES) as string[];
const episodes = titles.map((title, i) => {
  const paragraphs = [`Chapter ${i + 1}. ${title}.`];
  let seconds = 3 + 4.5;
  for (const take of takes.filter((x) => x.chapter === title)) {
    const text = narration[take.id];
    const length = measured.get(take.id) ?? take.length;
    seconds += length;
    if (!text) {
      problems.push(`${take.id}: no narration`);
      continue;
    }
    const need = words(text) / WORDS_PER_SECOND;
    if (need > length) problems.push(`${take.id}: ${need.toFixed(0)}s of speech for a ${length.toFixed(0)}s scene`);
    paragraphs.push(text);
  }
  paragraphs.push(OUTRO_LINE);
  return { n: i + 1, title, text: paragraphs.join("\n\n"), seconds };
});
for (const id of Object.keys(narration)) if (!takes.some((t) => t.id === id)) problems.push(`${id}: narration for a scene that doesn't exist`);

rmSync(".data/demo-video/voiceover.txt", { force: true });
mkdirSync(".data/demo-video/voiceover", { recursive: true });
for (const e of episodes) writeFileSync(`.data/demo-video/voiceover/${String(e.n).padStart(2, "0")}.txt`, e.text + "\n");

const totalWords = episodes.reduce((n, e) => n + words(e.text), 0);
const totalSeconds = episodes.reduce((n, e) => n + e.seconds, 0);
const html = `<title>SchoolHub Voiceover Scripts</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f6f4;--card:#fff;--ink:#1d1b19;--body:#3f3b36;--muted:#7a746d;--line:#e6e2dc;--brand:#fe6007;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171513;--card:#211e1b;--ink:#f3efe9;--body:#ddd6cd;--muted:#9a938b;--line:#36312c;--brand:#ff7a2e;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#171513;--card:#211e1b;--ink:#f3efe9;--body:#ddd6cd;--muted:#9a938b;--line:#36312c;--brand:#ff7a2e;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--body);font:16px/1.55 Inter,system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding-inline:16px;padding-block:32px 72px;display:flex;flex-direction:column;gap:22px}
h1,h2{font-family:Nunito,system-ui,sans-serif;color:var(--ink);margin:0;text-wrap:balance}h1{font-size:32px;font-weight:900}h2{font-size:21px;font-weight:800}
.word b{color:var(--brand)}.lede{margin:6px 0 0;color:var(--muted);max-width:68ch}
.toc{display:flex;flex-wrap:wrap;gap:6px}.toc a{font-size:13.5px;color:var(--body);text-decoration:none;border:1px solid var(--line);background:var(--card);border-radius:99px;padding:4px 11px}.toc a:hover{border-color:var(--brand);color:var(--brand)}
section.ep{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;scroll-margin-top:12px}
.ep-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line)}
.meta{font-size:13.5px;color:var(--muted);font-variant-numeric:tabular-nums}
button{font:600 14px Inter,system-ui,sans-serif;color:#fff;background:var(--brand);border:0;border-radius:10px;padding:9px 16px;cursor:pointer}
.script{padding:18px;color:var(--ink);font-size:17px;line-height:1.65;white-space:pre-wrap;max-width:70ch}
footer{font-size:13px;color:var(--muted)}
</style>
<main>
<header><h1 class="word">adalin <b>schoolhub</b> voiceover scripts</h1>
<p class="lede">${episodes.length} episodes, spoken text only. Copy an episode, paste it into the voice generator, and save one audio file per episode. Each paragraph is one scene and is written to fit inside it.</p></header>
<nav class="toc">${episodes.map((e) => `<a href="#ep${e.n}">${e.n}. ${esc(e.title)}</a>`).join("")}</nav>
${episodes
  .map(
    (e) => `<section class="ep" id="ep${e.n}">
<div class="ep-head"><div><h2>${e.n}. ${esc(e.title)}</h2><div class="meta">Video ${clock(e.seconds)} · ${words(e.text)} words</div></div><button type="button">Copy script</button></div>
<div class="script">${esc(e.text)}</div>
</section>`,
  )
  .join("\n")}
<footer>${totalWords.toLocaleString("en")} words for ${Math.round(totalSeconds / 60)} minutes of video.</footer>
</main>
<script>
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("section.ep button");
  if (!b) return;
  const box = b.closest("section").querySelector(".script");
  const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy script"), 1500); };
  navigator.clipboard.writeText(box.textContent).then(done, () => {
    const r = document.createRange(); r.selectNodeContents(box);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected, press Ctrl+C";
  });
});
</script>`;
writeFileSync(".data/demo-video/voiceover.html", html);
console.log(`voiceover: ${episodes.length} episodes, ${totalWords} words, ${Math.round(totalSeconds / 60)} min of video`);
for (const p of problems) console.log("  " + p);
