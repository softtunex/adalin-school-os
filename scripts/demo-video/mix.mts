/*
 * Lays a voiceover onto a finished episode: each paragraph of the narration starts as its scene starts.
 * The audio is one file per episode from the voice generator (.data/demo-video/audio/NN.mp3). Paragraph
 * breaks are found from Whisper's word timings, matched against the script.
 *
 *   FFMPEG=.data/tools/ffmpeg.exe npx tsx scripts/demo-video/mix.mts 1
 *
 * Writes .data/demo-video/series/voiced/NN-*.mp4.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { EPISODES } from "./series";
import type { Take } from "./kit";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const n = Number(process.argv[2]);
const nn = String(n).padStart(2, "0");
const title = (Object.values(EPISODES) as string[])[n - 1];
const takes: Take[] = JSON.parse(readFileSync(".data/demo-video/series/takes.json", "utf8"));
const lengths = new Map<string, number>();
for (const line of readFileSync(".data/demo-video/series/clip-lengths.txt", "utf8").split("\n")) {
  const [id, d] = line.trim().split(" ");
  if (!id || !d) continue;
  const [h, m, s] = d.split(":").map(Number);
  lengths.set(id, h * 3600 + m * 60 + s);
}
const CARD = 3;
const OUTRO = 4.5;

const audio = `.data/demo-video/audio/${nn}.mp3`;
const video = `.data/demo-video/series/chapters/${readdirSync(".data/demo-video/series/chapters").find((f) => f.startsWith(nn + "-"))}`;
const paragraphs = readFileSync(`.data/demo-video/voiceover/${nn}.txt`, "utf8").trim().split(/\n\s*\n/);

// Where each paragraph should start in the video: the title card, each scene, the closing card.
const scenes = takes.filter((t) => t.chapter === title).map((t) => lengths.get(t.id) ?? t.length);
const starts = [0];
let t = CARD;
for (const s of scenes) { starts.push(t); t += s; }
starts.push(t);
const videoLength = t + OUTRO;
if (starts.length !== paragraphs.length) throw new Error(`${paragraphs.length} paragraphs for ${starts.length} slots`);

// Word timings for the audio, from Whisper on Groq (the narration only, nothing personal), cached
// next to the audio. The key is read from .env.production.local and never printed.
const wordsFile = audio.replace(/\.mp3$/, ".words.json");
if (!existsSync(wordsFile)) {
  const key = readFileSync(".env.production.local", "utf8").match(/^GROQ_API_KEY=["']?([^"'\r\n]+)/m)?.[1];
  if (!key) throw new Error("GROQ_API_KEY missing");
  const form = new FormData();
  form.append("file", new Blob([readFileSync(audio)], { type: "audio/mpeg" }), `${nn}.mp3`);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("language", "en");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  writeFileSync(wordsFile, JSON.stringify((await res.json()).words));
}
const heard: { word: string; start: number; end: number }[] = JSON.parse(readFileSync(wordsFile, "utf8"));
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
const heardNorm = heard.map((w) => norm(w.word));
const audioLength = heard[heard.length - 1].end + 0.3;

// Each paragraph break: find where the next paragraph's opening words are heard, near where the word
// count says it should be, and cut in the gap just before them.
const tokens = paragraphs.map((p) => p.split(/\s+/).map(norm).filter(Boolean));
const total = tokens.reduce((a, p) => a + p.length, 0);
const cuts = [0];
let done = 0;
let from = 0;
for (let i = 1; i < paragraphs.length; i++) {
  done += tokens[i - 1].length;
  const expect = Math.round((done / total) * heard.length);
  const open = tokens[i].slice(0, 4);
  let best = -1, bestScore = -1;
  for (let j = Math.max(from, expect - 60); j < Math.min(heard.length, expect + 60); j++) {
    const score = open.filter((w, k) => heardNorm[j + k] === w).length * 100 - Math.abs(j - expect);
    if (score > bestScore) { bestScore = score; best = j; }
  }
  if (bestScore < 200) throw new Error(`can't find paragraph ${i + 1} ("${open.join(" ")}") in the audio`);
  const at = best > 0 ? (heard[best - 1].end + heard[best].start) / 2 : 0;
  console.log(`paragraph ${i + 1} starts at ${at.toFixed(1)}s: "${heard.slice(best, best + 4).map((w) => w.word).join(" ")}"`);
  cuts.push(at);
  from = best + 1;
}
cuts.push(audioLength);

// Each piece goes in at its slot; if a piece would run into the next slot, it starts earlier, never
// overlapping the piece before.
const pieces = paragraphs.map((_, i) => ({ from: cuts[i], to: cuts[i + 1], at: starts[i] }));
for (let i = pieces.length - 1; i >= 0; i--) {
  const p = pieces[i];
  const next = i + 1 < pieces.length ? pieces[i + 1].at : videoLength;
  const len = p.to - p.from;
  if (p.at + len > next) p.at = Math.max(i ? pieces[i - 1].at : 0, next - len);
}
for (let i = 1; i < pieces.length; i++) {
  const prevEnd = pieces[i - 1].at + (pieces[i - 1].to - pieces[i - 1].from);
  if (pieces[i].at < prevEnd) throw new Error(`paragraph ${i + 1} doesn't fit its scene`);
}
pieces.forEach((p, i) => console.log(`paragraph ${i + 1}: ${(p.to - p.from).toFixed(1)}s of speech at ${p.at.toFixed(1)}s`));

mkdirSync(".data/demo-video/series/voiced", { recursive: true });
const out = video.replace("/chapters/", "/voiced/");
// One padded WAV per paragraph (its speech, then silence until the next slot), joined end to end.
const work = ".data/demo-video/series/voiced/work";
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const ff = (...args: string[]) => execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
const list: string[] = [];
const lead = pieces[0].at;
if (lead > 0) { ff("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", lead.toFixed(3), `${work}/lead.wav`); list.push("file 'lead.wav'"); }
pieces.forEach((p, i) => {
  const slot = (i + 1 < pieces.length ? pieces[i + 1].at : videoLength) - p.at;
  ff("-i", audio, "-af", `atrim=${p.from.toFixed(3)}:${p.to.toFixed(3)},asetpts=PTS-STARTPTS,apad=whole_dur=${slot.toFixed(3)},atrim=0:${slot.toFixed(3)}`, "-ar", "44100", "-ac", "1", `${work}/${i}.wav`);
  list.push(`file '${i}.wav'`);
});
writeFileSync(`${work}/list.txt`, list.join("\n"));
ff("-i", video, "-f", "concat", "-safe", "0", "-i", `${work}/list.txt`, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", out);
rmSync(work, { recursive: true, force: true });
console.log(`Done: ${out}`);
