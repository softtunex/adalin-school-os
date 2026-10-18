/*
 * Turns recorded takes into finished video: cuts loading frames, puts phone scenes in a phone on a
 * branded stage, adds captions (with plan badges), chapter cards and title cards, and writes one
 * MP4 for the whole storyboard plus one per chapter.
 * Needs a full ffmpeg (with libx264): set FFMPEG to its path, or have it on PATH.
 *
 *   npx tsx scripts/demo-video/edit.ts [overview|full]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { BASE, PHONE, type Take } from "./kit";

const NAME = process.argv[2] ?? "overview";
const DIR = path.join(".data", "demo-video", NAME);
const WORK = path.join(DIR, "work");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const W = 1920;
const H = 1080;
const FPS = 30;

// The phone screen's place on the stage (native size, so no scaling).
const SCREEN = { x: 1210, y: Math.round((H - PHONE.viewport.height) / 2), w: PHONE.viewport.width, h: PHONE.viewport.height, r: 40 };
const BEZEL = 13;

const INTRO = { title: "Run your whole school from one place", sub: "Attendance, results, fees, messages and staff, for every school in Nigeria.", seconds: 4 };
const OUTRO = { title: "Book a demo for your school", sub: "Adalin Technologies · adalintechnologies.com", seconds: 4.5 };

// Overlays are drawn on one of the app's own pages, so they use its self-hosted brand fonts.
const BASE_CSS = `#__overlay,#__overlay *{box-sizing:border-box;margin:0}
html,body{background:transparent!important;overflow:hidden!important}
#__overlay{position:fixed;inset:0;width:${W}px;height:${H}px;z-index:2147483647;font-family:var(--font-geist-sans),system-ui,sans-serif;color:#1d1b19;-webkit-font-smoothing:antialiased}
#__overlay .display{font-family:var(--font-nunito),sans-serif;font-weight:900;letter-spacing:-0.02em}
#__overlay .word .a{color:#1d1b19}#__overlay .word .b{color:#fe6007}
#__overlay .badge{flex:none;display:inline-flex;align-items:center;border-radius:999px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Plan badges: deeper colours for higher plans. */
const BADGE: Record<string, string> = { Free: "#6b6b73", Basic: "#1670b0", Standard: "#1b7a30", Premium: "#6b3fc9", Enterprise: "#1d1b19" };
const badge = (tag: string | undefined, size: number) =>
  tag ? `<span class="badge" style="font-size:${size}px;padding:${size * 0.35}px ${size * 0.8}px;background:${BADGE[tag] ?? "#b84300"};color:#fff">${esc(tag)}</span>` : "";

/** Draw an overlay over a blank app page and save it; transparent wherever the overlay doesn't paint. */
async function render(page: Page, html: string, file: string) {
  await page.evaluate(
    ([css, body]) => {
      document.body.innerHTML = `<style>${css}</style><div id="__overlay">${body}</div>`;
      return document.fonts.ready;
    },
    [BASE_CSS, html],
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, omitBackground: true });
}

function captionPill(text: string, tag?: string) {
  return `<div style="position:absolute;left:0;right:0;bottom:58px;display:flex;justify-content:center">
    <div style="display:flex;align-items:center;gap:18px;max-width:1600px;padding:20px 38px;border-radius:999px;background:rgba(29,27,25,0.9);color:#fff;font-size:36px;font-weight:600;line-height:1.25;box-shadow:0 10px 30px rgba(0,0,0,0.18)">
      <span style="flex:none;width:14px;height:14px;border-radius:50%;background:#fe6007"></span><span>${esc(text)}</span>${badge(tag, 20)}
    </div></div>`;
}

function stage(eyebrow: string, text: string, tag: string | undefined, logo: string) {
  const { x, y, w, h, r } = SCREEN;
  // Everything is painted through a mask with a hole where the phone's screen goes.
  const hole = `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  return `<svg width="${W}" height="${H}" style="position:absolute;inset:0">
      <defs><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/><path d="${hole}" fill="#000"/></mask></defs>
      <g mask="url(#m)"><rect width="${W}" height="${H}" fill="#f7f6f4"/><circle cx="${x + w / 2}" cy="${H / 2}" r="470" fill="#fff0e6"/></g>
    </svg>
    <div style="position:absolute;left:${x - BEZEL}px;top:${y - BEZEL}px;width:${w + BEZEL * 2}px;height:${h + BEZEL * 2}px;border:${BEZEL}px solid #1d1b19;border-radius:${r + BEZEL}px;box-shadow:0 30px 60px rgba(29,27,25,0.22)"></div>
    <div style="position:absolute;left:150px;top:0;bottom:0;width:860px;display:flex;flex-direction:column;justify-content:center;gap:28px">
      <div style="display:flex;align-items:center;gap:16px"><span style="font-size:26px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#b84300">${esc(eyebrow)}</span>${badge(tag, 18)}</div>
      <div class="display" style="font-size:72px;line-height:1.08;text-wrap:balance">${esc(text)}</div>
    </div>
    <div style="position:absolute;left:150px;bottom:64px;display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:48px">${logo}</div><div class="display word" style="font-size:34px"><span class="a">adalin</span> <span class="b">schoolhub</span></div>
    </div>`;
}

function card(title: string, sub: string, logo: string) {
  return `<div style="position:absolute;inset:0;background:#f7f6f4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center">
      <div style="display:flex;align-items:center;gap:22px"><div style="width:120px;height:131px">${logo}</div>
        <div class="display word" style="font-size:96px"><span class="a">adalin</span> <span class="b">schoolhub</span></div></div>
      <div class="display" style="font-size:64px;max-width:1400px;text-wrap:balance">${esc(title)}</div>
      <div style="font-size:34px;color:#66625d;max-width:1300px">${esc(sub)}</div>
    </div>`;
}

function chapterCard(n: number, total: number, title: string, plans: string[], logo: string) {
  return `<div style="position:absolute;inset:0;background:#f7f6f4">
      <div style="position:absolute;left:150px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:30px">
        <div style="font-size:30px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#b84300">Chapter ${n} of ${total}</div>
        <div class="display" style="font-size:120px;line-height:1.02;max-width:1500px;text-wrap:balance">${esc(title)}</div>
        <div style="display:flex;gap:14px">${plans.map((p) => badge(p, 24)).join("")}</div>
      </div>
      <div style="position:absolute;left:150px;bottom:64px;display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:48px">${logo}</div><div class="display word" style="font-size:34px"><span class="a">adalin</span> <span class="b">schoolhub</span></div>
      </div>
    </div>`;
}

/** The parts of a take to keep, and where each caption lands once the cuts are made. */
function timeline(take: Take) {
  const keep: [number, number][] = [];
  let from: number | null = null;
  for (const m of take.marks) {
    if (m.cut === "start" && from !== null) {
      if (m.at - from > 0.05) keep.push([from, m.at]);
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
  const caps = take.marks.filter((m) => m.caption).map((m) => ({ text: m.caption!, tag: m.tag ?? take.plan, at: map(m.at) }));
  const spans = caps.map((c, i) => ({ ...c, from: i === 0 ? 0 : c.at, to: caps[i + 1]?.at ?? length }));
  return { keep, length, spans };
}

function ffmpeg(args: string[]) {
  execFileSync(FFMPEG, ["-v", "error", "-y", ...args], { stdio: "inherit" });
}

const ENCODE = ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart"];

function join(parts: string[], out: string) {
  const list = `${out}.txt`;
  writeFileSync(list, parts.map((p) => `file '${path.resolve(p).replace(/\\/g, "/")}'`).join("\n"));
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
  rmSync(list);
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const PLAN_ORDER = ["Free", "Basic", "Standard", "Premium", "Enterprise"];

async function main() {
  const takes: Take[] = JSON.parse(readFileSync(path.join(DIR, "takes.json"), "utf8"));
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`${BASE}/login`);
  const logo = (await page.locator('a[aria-label$="home"] svg').first().evaluate((el) => el.outerHTML)).replace(/class="[^"]*"/, 'width="100%" height="100%"');

  const still = async (id: string, html: string, seconds: number) => {
    const png = path.join(WORK, `${id}.png`);
    await render(page, html, png);
    const mp4 = path.join(WORK, `${id}.mp4`);
    ffmpeg(["-loop", "1", "-t", String(seconds), "-i", png, "-vf", `fps=${FPS},fade=t=in:st=0:d=0.4:color=0xf7f6f4,fade=t=out:st=${seconds - 0.4}:d=0.4:color=0xf7f6f4`, ...ENCODE, mp4]);
    return mp4;
  };

  const scene = async (take: Take) => {
    const { keep, length, spans } = timeline(take);
    const overlays: string[] = [];
    for (const [i, s] of spans.entries()) {
      const png = path.join(WORK, `${take.id}-cap${i}.png`);
      await render(page, take.kind === "phone" ? stage(take.title, s.text, s.tag, logo) : captionPill(s.text, s.tag), png);
      overlays.push(png);
    }
    const select = keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+");
    const trimmed = `[0:v]fps=${FPS},select='${select}',setpts=N/${FPS}/TB`;
    const chain: string[] = [];
    if (take.kind === "phone") {
      chain.push(`${trimmed}[app]`, `color=c=0xf7f6f4:s=${W}x${H}:r=${FPS}:d=${length.toFixed(3)}[bg]`, `[bg][app]overlay=${SCREEN.x}:${SCREEN.y}:shortest=1[v0]`);
    } else {
      chain.push(`${trimmed},scale=${W}:${H}:flags=lanczos[v0]`);
    }
    spans.forEach((s, i) => chain.push(`[v${i}][${i + 1}:v]overlay=0:0:enable='between(t,${s.from.toFixed(3)},${s.to.toFixed(3)})'[v${i + 1}]`));
    chain.push(`[v${spans.length}]fade=t=in:st=0:d=0.3:color=0xf7f6f4,fade=t=out:st=${Math.max(0, length - 0.3).toFixed(3)}:d=0.3:color=0xf7f6f4[out]`);
    const mp4 = path.join(WORK, `${take.id}.mp4`);
    ffmpeg(["-i", take.video, ...overlays.flatMap((o) => ["-loop", "1", "-i", o]), "-filter_complex", chain.join(";"), "-map", "[out]", "-t", length.toFixed(3), ...ENCODE, mp4]);
    console.log(`  ${take.id}: ${length.toFixed(1)}s, ${spans.length} captions`);
    return { mp4, length };
  };

  const chapters = [...new Set(takes.map((t) => t.chapter))];
  const withCards = chapters.length > 1;
  const intro = await still("00-intro", card(INTRO.title, INTRO.sub, logo), INTRO.seconds);
  const outro = await still("zz-outro", card(OUTRO.title, OUTRO.sub, logo), OUTRO.seconds);
  const all = [intro];
  let seconds = INTRO.seconds + OUTRO.seconds;
  mkdirSync(path.join(DIR, "chapters"), { recursive: true });

  for (const [n, chapter] of chapters.entries()) {
    console.log(`${chapter}`);
    const parts: string[] = [];
    if (withCards) {
      const plans = [...new Set(takes.filter((t) => t.chapter === chapter).flatMap((t) => [t.plan, ...t.marks.map((m) => m.tag)]).filter(Boolean) as string[])];
      plans.sort((a, b) => PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b));
      parts.push(await still(`ch${String(n + 1).padStart(2, "0")}`, chapterCard(n + 1, chapters.length, chapter, plans, logo), 3));
      seconds += 3;
    }
    for (const take of takes.filter((t) => t.chapter === chapter)) {
      const { mp4, length } = await scene(take);
      parts.push(mp4);
      seconds += length;
    }
    all.push(...parts);
    if (withCards) join([...parts, outro], path.join(DIR, "chapters", `${String(n + 1).padStart(2, "0")}-${slugify(chapter)}.mp4`));
  }
  await browser.close();

  all.push(outro);
  const out = path.join(DIR, `adalin-schoolhub-${NAME}.mp4`);
  join(all, out);
  console.log(`Done: ${out} (${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
