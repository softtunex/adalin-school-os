/*
 * Lays a voiceover onto a finished episode, each spoken line starting as its caption appears.
 * The audio is one file per episode from the voice generator (.data/demo-video/audio/NN.mp3), read from
 * the script made by voiceover.mts. Where each line begins in the audio comes from Whisper's word timings.
 *
 *   FFMPEG=.data/tools/ffmpeg.exe npx tsx scripts/demo-video/mix.mts 1
 *
 * Writes .data/demo-video/series/voiced/NN-*.mp4.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const GAP = 0.15; // the least space between two lines when one runs late

const nn = String(Number(process.argv[2])).padStart(2, "0");
const audio = `.data/demo-video/audio/${nn}.mp3`;
const video = `.data/demo-video/series/chapters/${readdirSync(".data/demo-video/series/chapters").find((f) => f.startsWith(nn + "-"))}`;
const script: { seconds: number; lines: { at: number; until: number; text: string }[] } = JSON.parse(
  readFileSync(`.data/demo-video/voiceover/${nn}.json`, "utf8"),
);
const lines = script.lines;

// Word timings for the audio, from Whisper on Groq (the narration only, nothing personal), cached next to
// the audio. The key is read from .env.production.local and never printed.
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

// Find where each line begins in the audio: look for its opening words just after the previous line,
// allowing for Whisper hearing a word or two differently. Lines it can't place are reported.
const tokens = lines.map((l) => l.text.split(/\s+/).map(norm).filter(Boolean));
const begins = [0];
let expect = tokens[0].length;
let unsure = 0;
for (let i = 1; i < lines.length; i++) {
  const open = tokens[i].slice(0, 4);
  let best = expect, bestScore = -Infinity;
  for (let j = Math.max(begins[i - 1] + 1, expect - 8); j <= Math.min(heard.length - 1, expect + 8); j++) {
    const score = open.filter((w, k) => heardNorm[j + k] === w).length * 10 - Math.abs(j - expect);
    if (score > bestScore) { bestScore = score; best = j; }
  }
  if (bestScore < Math.min(2, open.length) * 10 - 8) {
    unsure++;
    console.log(`  unsure where line ${i + 1} starts ("${lines[i].text.slice(0, 40)}"), heard "${heard.slice(best, best + 4).map((w) => w.word).join(" ")}"`);
  }
  begins.push(best);
  expect = best + tokens[i].length;
}
const cuts = begins.map((b) => (b > 0 ? (heard[b - 1].end + heard[b].start) / 2 : 0));
cuts.push(audioLength);

// Each line goes in when its caption appears, or just after the line before if that one runs late.
const pieces = lines.map((l, i) => ({ from: cuts[i], to: cuts[i + 1], at: l.at }));
let late = 0;
for (let i = 1; i < pieces.length; i++) {
  const prevEnd = pieces[i - 1].at + (pieces[i - 1].to - pieces[i - 1].from) + GAP;
  if (prevEnd > pieces[i].at) { late = Math.max(late, prevEnd - lines[i].at); pieces[i].at = prevEnd; }
}
const last = pieces[pieces.length - 1];
const end = Math.max(script.seconds, last.at + last.to - last.from);
console.log(`${lines.length} lines placed; the latest runs ${late.toFixed(1)}s behind its caption; ${unsure} unsure`);

// One WAV per line (its speech, then silence until the next line), joined end to end.
mkdirSync(".data/demo-video/series/voiced", { recursive: true });
const out = video.replace("/chapters/", "/voiced/");
const work = ".data/demo-video/series/voiced/work";
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const ff = (...args: string[]) => execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
const list: string[] = [];
pieces.forEach((p, i) => {
  const slot = (i + 1 < pieces.length ? pieces[i + 1].at : end) - p.at;
  const lead = i === 0 ? p.at : 0;
  ff("-i", audio, "-af", `atrim=${p.from.toFixed(3)}:${p.to.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(lead * 1000)},apad=whole_dur=${(slot + lead).toFixed(3)},atrim=0:${(slot + lead).toFixed(3)}`, "-ar", "44100", "-ac", "1", `${work}/${i}.wav`);
  list.push(`file '${i}.wav'`);
});
writeFileSync(`${work}/list.txt`, list.join("\n"));
ff("-i", video, "-f", "concat", "-safe", "0", "-i", `${work}/list.txt`, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", out);
rmSync(work, { recursive: true, force: true });
console.log(`Done: ${out}`);
