/*
 * Links Kola's help guide to the tutorial videos: for each SchoolHub page, the scenes that show it, each
 * opening at the second that scene starts in the uploaded (voiced) episode.
 *
 *   npx tsx scripts/demo-video/kola-videos.mts
 *
 * Reads the YouTube links from .data/demo-video/upload-pack.json (filled by youtube-upload.mts), what each
 * scene shows from SCENES' `covers`, and scene start times from the voiced episodes. Writes
 * src/lib/ai/kola-videos.ts.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { EPISODES, SCENES } from "./series";
import { KOLA_GUIDE } from "../../src/lib/ai/kola-guide";

const PER_PAGE = 3;
const PLAYLIST = "https://www.youtube.com/playlist?list=PLGcZ6pPBMjbA";
const titles = Object.values(EPISODES) as string[];
const pack: { n: number; url: string }[] = JSON.parse(readFileSync(".data/demo-video/upload-pack.json", "utf8"));
const takes: { id: string; chapter: string; title: string }[] = JSON.parse(readFileSync(".data/demo-video/series/takes.json", "utf8"));
const voiced = readdirSync(".data/demo-video/series/voiced").filter((f) => f.endsWith(".lines.json"));

// Where each scene starts in its finished episode: where its first line plays.
const starts = new Map<string, number>(); // "<episode>|<scene title>" → seconds
titles.forEach((_, i) => {
  const nn = String(i + 1).padStart(2, "0");
  const script: { lines: { scene?: string }[] } = JSON.parse(readFileSync(`.data/demo-video/voiceover/${nn}.json`, "utf8"));
  const placed: { at: number }[] = JSON.parse(readFileSync(`.data/demo-video/series/voiced/${voiced.find((f) => f.startsWith(nn + "-"))}`, "utf8"));
  script.lines.forEach((l, k) => {
    const key = `${i + 1}|${l.scene}`;
    if (l.scene && !starts.has(key)) starts.set(key, k === 1 ? 0 : Math.floor(placed[k].at));
  });
});

const pageOf = (cover: string) => {
  const m = cover.match(/^\/s\/\[slug\](\/[^/:\s]+)?/);
  return m ? (m[1] ?? "") : null;
};

type Video = { title: string; url: string; weight: number };
const byPage = new Map<string, Video[]>();
let parent: Video[] = [];
for (const scene of SCENES) {
  const take = takes.find((t) => t.id === scene.id);
  if (!take) continue;
  const n = titles.indexOf(take.chapter) + 1;
  const url = pack.find((e) => e.n === n)?.url;
  const at = starts.get(`${n}|${take.title}`);
  if (!url || at === undefined) continue;
  const video = (weight: number): Video => ({ title: `Episode ${n}: ${take.title}`, url: at ? `${url}?t=${at}` : url, weight });
  const counts = new Map<string, number>();
  for (const c of scene.covers ?? []) {
    const page = pageOf(c);
    if (page !== null && page in KOLA_GUIDE) counts.set(page, (counts.get(page) ?? 0) + 1);
    if (/^\/p(\/|$|:)/.test(c)) counts.set("parent", (counts.get("parent") ?? 0) + 1);
  }
  for (const [page, weight] of counts) {
    if (page === "parent") parent.push(video(weight));
    else byPage.set(page, [...(byPage.get(page) ?? []), video(weight)]);
  }
}
const best = (list: Video[]) => [...list].sort((a, b) => b.weight - a.weight).slice(0, PER_PAGE).map(({ title, url }) => ({ title, url }));
parent = parent.filter((v, i, all) => all.findIndex((w) => w.url === v.url) === i);

const out = `/*
 * Tutorial videos for Kola to point to, per page (same keys as KOLA_GUIDE). Made by
 * scripts/demo-video/kola-videos.mts from the uploaded series; don't edit by hand. Each link opens the
 * scene that shows the page. The videos are unlisted on YouTube (Episode 1 is public).
 */

export type KolaVideo = { title: string; url: string };

export const KOLA_SERIES = ${JSON.stringify(PLAYLIST)};

export const KOLA_VIDEOS: Record<string, KolaVideo[]> = ${JSON.stringify(Object.fromEntries([...byPage].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, best(v)])), null, 2)};

export const KOLA_PARENT_VIDEOS: KolaVideo[] = ${JSON.stringify(best(parent), null, 2)};
`;
writeFileSync("src/lib/ai/kola-videos.ts", out);
const missing = Object.keys(KOLA_GUIDE).filter((k) => !byPage.has(k));
console.log(`kola videos: ${byPage.size} pages linked, ${parent.length} parent-app scenes; pages without a video: ${missing.map((k) => k || "(overview)").join(", ") || "none"}`);
