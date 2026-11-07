/*
 * Voiceover scripts for the series: every caption of every episode, timed to the finished episode files
 * (.data/demo-video/series/chapters). Writes a page to read from while recording
 * (.data/demo-video/voiceover.html) and a plain-text copy (voiceover.txt).
 *
 *   npx tsx scripts/demo-video/voiceover.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { EPISODES } from "./series";
import type { Take } from "./kit";

const takes: Take[] = JSON.parse(readFileSync(".data/demo-video/series/takes.json", "utf8"));

// Kept in step with edit.ts: how a take is cut, and the cards around each episode.
const CUT_LEAD = 0.6;
const CARD = 3;
const OUTRO = 4.5;
const OUTRO_LINE = "Book a demo for your school. Adalin Technologies, adalintechnologies.com.";
const WORDS_PER_SECOND = 2.4; // a comfortable speaking pace

function timeline(take: Take) {
  const keep: [number, number][] = [];
  let from: number | null = null;
  for (const m of take.marks) {
    if (m.cut === "start" && from !== null) {
      const to = Math.max(from, m.at - CUT_LEAD);
      if (to - from > 0.05) keep.push([from, to]);
      from = null;
    } else if (m.cut === "end") from = m.at;
  }
  if (from !== null) keep.push([from, take.length]);
  const map = (t: number) => {
    let out = 0;
    for (const [a, b] of keep) {
      if (t >= b) out += b - a;
      else return out + Math.max(0, t - a);
    }
    return out;
  };
  const length = keep.reduce((s, [a, b]) => s + b - a, 0);
  const caps = take.marks.filter((m) => m.caption).map((m) => ({ text: m.caption!, at: map(m.at) }));
  const spans = caps.map((c, i) => ({ text: c.text, from: i === 0 ? 0 : c.at, to: caps[i + 1]?.at ?? length }));
  return { length, spans: spans.filter((s) => s.to - s.from >= 1 / 30) };
}

// The finished clips run a little shorter than the recorded timeline (the recorder stops writing frames
// once a scene goes still), so each scene's real length is measured from its clip:
// "<take id> <hh:mm:ss.ss>" per line, later lines winning.
const measured = new Map<string, number>();
for (const line of readFileSync(".data/demo-video/series/clip-lengths.txt", "utf8").split("\n")) {
  const [id, d] = line.trim().split(" ");
  if (!id || !d) continue;
  const [h, m, s] = d.split(":").map(Number);
  measured.set(id, h * 3600 + m * 60 + s);
}

type Line = { at: number; seconds: number; text: string; scene: string };
const titles = Object.values(EPISODES) as string[];
const episodes = titles.map((title, i) => {
  const lines: Line[] = [{ at: 0, seconds: CARD, text: `Chapter ${i + 1}: ${title}.`, scene: "Title card" }];
  let t = CARD;
  for (const take of takes.filter((x) => x.chapter === title)) {
    const { length: planned, spans } = timeline(take);
    const length = measured.get(take.id) ?? planned;
    for (const s of spans) {
      if (s.from >= length - 0.5) continue; // cut off by the clip's shorter ending
      lines.push({ at: t + s.from, seconds: Math.min(s.to, length) - s.from, text: s.text, scene: take.title });
    }
    t += length;
  }
  lines.push({ at: t, seconds: OUTRO, text: OUTRO_LINE, scene: "Closing card" });
  return { n: i + 1, title, lines, length: t + OUTRO };
});

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// Plain text, one block per episode.
writeFileSync(
  ".data/demo-video/voiceover.txt",
  episodes
    .map((e) => [`EPISODE ${e.n}: ${e.title.toUpperCase()}  (${clock(e.length)})`, ...e.lines.map((l) => `[${clock(l.at)}] ${l.text}`)].join("\n"))
    .join("\n\n"),
);

const totalLines = episodes.reduce((n, e) => n + e.lines.length, 0);
const totalSeconds = episodes.reduce((n, e) => n + e.length, 0);
const html = `<title>SchoolHub Voiceover Scripts</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f6f4;--card:#fff;--ink:#1d1b19;--body:#3f3b36;--muted:#7a746d;--line:#e6e2dc;--brand:#fe6007;--brand-wash:#fff0e6;--warn:#a35a00;--warn-wash:#fff4e0;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171513;--card:#211e1b;--ink:#f3efe9;--body:#ddd6cd;--muted:#9a938b;--line:#36312c;--brand:#ff7a2e;--brand-wash:#3a2214;--warn:#f0b35a;--warn-wash:#3a2a12;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#171513;--card:#211e1b;--ink:#f3efe9;--body:#ddd6cd;--muted:#9a938b;--line:#36312c;--brand:#ff7a2e;--brand-wash:#3a2214;--warn:#f0b35a;--warn-wash:#3a2a12;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--body);font:16px/1.55 Inter,system-ui,sans-serif}
main{max-width:920px;margin:0 auto;padding-inline:16px;padding-block:32px 72px;display:flex;flex-direction:column;gap:22px}
h1,h2{font-family:Nunito,system-ui,sans-serif;color:var(--ink);margin:0;text-wrap:balance}h1{font-size:32px;font-weight:900}h2{font-size:21px;font-weight:800}
.word b{color:var(--brand)}.lede{margin:6px 0 0;color:var(--muted);max-width:68ch}
.how{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;font-size:15px}.how ul{margin:8px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:4px}
.toc{display:flex;flex-wrap:wrap;gap:6px}.toc a{font-size:13.5px;color:var(--body);text-decoration:none;border:1px solid var(--line);background:var(--card);border-radius:99px;padding:4px 11px;font-variant-numeric:tabular-nums}.toc a:hover{border-color:var(--brand);color:var(--brand)}
section.ep{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;scroll-margin-top:12px}
.ep-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line)}
.meta{font-size:13.5px;color:var(--muted);font-variant-numeric:tabular-nums}
button{font:600 13.5px Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:7px 12px;cursor:pointer}button:hover{border-color:var(--brand)}
ol{list-style:none;margin:0;padding:0}
li{display:grid;grid-template-columns:62px 1fr;gap:4px 14px;padding:11px 18px;border-bottom:1px solid var(--line)}li:last-child{border-bottom:0}
li.card{background:var(--brand-wash)}
.at{font:600 15px ui-monospace,Menlo,Consolas,monospace;color:var(--brand);font-variant-numeric:tabular-nums;padding-top:1px}
.txt{color:var(--ink);font-size:17px;line-height:1.5}
.sub{grid-column:2;font-size:12.5px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap}
.tight{color:var(--warn);background:var(--warn-wash);border-radius:6px;padding:0 6px}
footer{font-size:13px;color:var(--muted)}
@media (max-width:520px){li{grid-template-columns:1fr}.sub{grid-column:1}}
</style>
<main>
<header><h1 class="word">adalin <b>schoolhub</b> voiceover scripts</h1>
<p class="lede">Every line of all ${episodes.length} episodes, timed to the finished videos: ${totalLines} lines, ${Math.round(totalSeconds / 60)} minutes in all.</p></header>
<div class="how"><strong>How to use it</strong><ul>
<li>Each line starts at the time on its left, the moment its caption appears in the video.</li>
<li>Under each line is how long you have before the next one. <span class="tight">Tight</span> marks a line that takes longer to say at an easy pace than the time it has. Say it a little quicker, or shorten it.</li>
<li>You can say more than the caption, as long as you finish before the next line's time.</li>
<li>Record each episode as one audio file, starting at 0:00 with the title card.</li>
</ul></div>
<nav class="toc">${episodes.map((e) => `<a href="#ep${e.n}">${e.n}. ${esc(e.title)}</a>`).join("")}</nav>
${episodes
  .map(
    (e) => `<section class="ep" id="ep${e.n}">
<div class="ep-head"><div><h2>${e.n}. ${esc(e.title)}</h2><div class="meta">${clock(e.length)} · ${e.lines.length} lines</div></div>
<button type="button" data-copy="${esc([`Episode ${e.n}: ${e.title}`, ...e.lines.map((l) => `[${clock(l.at)}] ${l.text}`)].join("\n"))}">Copy script</button></div>
<ol>${e.lines
      .map((l) => {
        const need = words(l.text) / WORDS_PER_SECOND;
        const tight = need > l.seconds + 0.3;
        return `<li class="${l.scene.endsWith("card") ? "card" : ""}"><span class="at">${clock(l.at)}</span><span class="txt">${esc(l.text)}</span><span class="sub"><span>${esc(l.scene)}</span><span>${l.seconds.toFixed(1)}s to speak</span>${tight ? `<span class="tight">Tight: about ${need.toFixed(1)}s at an easy pace</span>` : ""}</span></li>`;
      })
      .join("")}</ol>
</section>`,
  )
  .join("\n")}
<footer>Generated from the recorded takes by scripts/demo-video/voiceover.mts. Times are minutes:seconds from the start of each episode file.</footer>
</main>
<script>
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-copy]");
  if (!b) return;
  const done = () => { const t = b.textContent; b.textContent = "Copied"; setTimeout(() => (b.textContent = t), 1500); };
  navigator.clipboard.writeText(b.dataset.copy).then(done, () => {
    const r = document.createRange(); r.selectNodeContents(b.closest("section").querySelector("ol"));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected, press Ctrl+C";
  });
});
</script>`;
writeFileSync(".data/demo-video/voiceover.html", html);
console.log(`voiceover: ${episodes.length} episodes, ${totalLines} lines, ${Math.round(totalSeconds / 60)} min`);
