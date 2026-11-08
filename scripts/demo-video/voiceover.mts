/*
 * Voiceover scripts for the series, ready to paste into a text-to-speech tool. The narration follows the
 * captions: one line per caption, in order, so what's said is what's on screen. Each episode is plain
 * spoken text only (title, captions, closing line), one line per paragraph.
 *
 * Writes .data/demo-video/voiceover.html (a page with a Copy button per episode), and per episode in
 * .data/demo-video/voiceover/: NN.txt (the script) and NN.json (when each line's caption appears, used
 * by mix.mts to place each spoken line at its caption).
 *
 *   npx tsx scripts/demo-video/voiceover.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { EPISODES } from "./series";
import type { Take } from "./kit";

const takes: Take[] = JSON.parse(readFileSync(".data/demo-video/series/takes.json", "utf8"));

// Kept in step with edit.ts: how a take is cut, and the cards around each episode.
const CUT_LEAD = 0.6;
const CARD = 3;
const OUTRO = 4.5;
const OUTRO_LINE = "Book a demo for your school. Adalin Technologies, adalintechnologies.com.";
const WORDS_PER_SECOND = 2.7; // the voice generator's pace

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

// Each scene's real length in the finished episode (clips run a little shorter than the timeline).
const measured = new Map<string, number>();
for (const line of readFileSync(".data/demo-video/series/clip-lengths.txt", "utf8").split("\n")) {
  const [id, d] = line.trim().split(" ");
  if (!id || !d) continue;
  const [h, m, s] = d.split(":").map(Number);
  measured.set(id, h * 3600 + m * 60 + s);
}

// Captions are written to be read; a few bits need saying differently.
const spoken = (s: string) =>
  s
    .replace(/\s*\(Ctrl K\)/, ", with Control K")
    .replace(/ – /g, " to ")
    .replace(/^(\d)\. /, "$1, ")
    .replace(/([^.?!])$/, "$1.");

type Line = { at: number; until: number; text: string };
const titles = Object.values(EPISODES) as string[];
let tight = 0;
const episodes = titles.map((title, i) => {
  const lines: Line[] = [{ at: 0, until: CARD, text: `Chapter ${i + 1}. ${title}.` }];
  let t = CARD;
  for (const take of takes.filter((x) => x.chapter === title)) {
    const { length: planned, spans } = timeline(take);
    const length = measured.get(take.id) ?? planned;
    for (const s of spans) {
      if (s.from >= length - 0.5) continue; // cut off by the clip's shorter ending
      lines.push({ at: t + s.from, until: t + Math.min(s.to, length), text: spoken(s.text) });
    }
    t += length;
  }
  lines.push({ at: t, until: t + OUTRO, text: OUTRO_LINE });
  for (const l of lines) if (l.text.split(/\s+/).length / WORDS_PER_SECOND > l.until - l.at + 0.5) tight++;
  return { n: i + 1, title, lines, seconds: t + OUTRO, text: lines.map((l) => l.text).join("\n\n") };
});

mkdirSync(".data/demo-video/voiceover", { recursive: true });
for (const e of episodes) {
  const nn = String(e.n).padStart(2, "0");
  writeFileSync(`.data/demo-video/voiceover/${nn}.txt`, e.text + "\n");
  writeFileSync(`.data/demo-video/voiceover/${nn}.json`, JSON.stringify({ seconds: e.seconds, lines: e.lines }, null, 1));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const totalLines = episodes.reduce((n, e) => n + e.lines.length, 0);
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
.script{padding:18px;color:var(--ink);font-size:17px;line-height:1.6;white-space:pre-wrap;max-width:70ch}
footer{font-size:13px;color:var(--muted)}
</style>
<main>
<header><h1 class="word">adalin <b>schoolhub</b> voiceover scripts</h1>
<p class="lede">The narration follows the captions, line for line, so the voice says what's on screen. Copy an episode, paste it into the voice generator as it is, and save one audio file per episode. Each line is placed at its caption when the audio is mixed in.</p></header>
<nav class="toc">${episodes.map((e) => `<a href="#ep${e.n}">${e.n}. ${esc(e.title)}</a>`).join("")}</nav>
${episodes
  .map(
    (e) => `<section class="ep" id="ep${e.n}">
<div class="ep-head"><div><h2>${e.n}. ${esc(e.title)}</h2><div class="meta">Video ${clock(e.seconds)} · ${e.lines.length} lines</div></div><button type="button">Copy script</button></div>
<div class="script">${esc(e.text)}</div>
</section>`,
  )
  .join("\n")}
<footer>${totalLines} lines across ${episodes.length} episodes.</footer>
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
console.log(`voiceover: ${episodes.length} episodes, ${totalLines} lines, ${tight} lines longer than their caption`);
