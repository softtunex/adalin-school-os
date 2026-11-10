/*
 * Uploads the voiced tutorial episodes to the Adalin Technologies YouTube channel through YouTube Studio,
 * as UNLISTED videos in the "Adalin SchoolHub: Tutorial Series" playlist, with the title and description
 * (chapter times included) from the upload pack. The official upload API can't be used: videos from an
 * unaudited API project are forced to Private.
 *
 * Sign-in happens once, by hand, in a plain Chrome window using the profile in .data/youtube-profile
 * (git-ignored); this script never sees a password. Close that window before running this.
 *
 *   npx tsx scripts/demo-video/youtube-upload.mts 1        (one episode)
 *   npx tsx scripts/demo-video/youtube-upload.mts 2-30     (a range; episodes already uploaded are skipped)
 *
 * Each video's link is saved into .data/demo-video/upload-pack.json as it finishes. Any step that doesn't
 * find what it expects stops the run with a screenshot in .data/demo-video/youtube-fail.png.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";

const CHANNEL = "UCrTrB-aYY-WnmJ7skeO5ySg";
const PLAYLIST = "Adalin SchoolHub: Tutorial Series";
const PACK = ".data/demo-video/upload-pack.json";
const PROFILE = resolve(".data/youtube-profile");

type Ep = { n: number; title: string; file: string; ytTitle: string; chapters: { at: number; name: string }[]; url: string; thumb?: boolean };
// The episode's title card as a still, made from the voiced video:
//   for f in .data/demo-video/series/voiced/*.mp4; do ffmpeg -ss 1.8 -i $f -frames:v 1 -vf scale=1280:720 .data/demo-video/thumbnails/NN.png; done
const thumb = (n: number) => `.data/demo-video/thumbnails/${String(n).padStart(2, "0")}.png`;
const pack: Ep[] = JSON.parse(readFileSync(PACK, "utf8"));
const html = readFileSync(".data/demo-video/upload-pack.html", "utf8");

// The description exactly as shown in the pack (the HTML is the one source of the wording).
function description(n: number): string {
  const section = html.split(`id="ep${n}"`)[1];
  const box = section.split('<div class="label">Description')[1].split('<div class="box">')[1].split("</div>")[0];
  return box.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

const [a, b] = (process.argv[2] ?? "").split("-").map(Number);
if (!a) throw new Error("Which episodes? e.g. 1 or 2-30");
const todo = pack.filter((e) => e.n >= a && e.n <= (b || a) && !e.url);

const step = async (what: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err) {
    await page.screenshot({ path: ".data/demo-video/youtube-fail.png" }).catch(() => {});
    throw new Error(`Stopped at "${what}": ${(err as Error).message.split("\n")[0]}`);
  }
};

const ctx = await chromium.launchPersistentContext(PROFILE, { channel: "chrome", headless: false, viewport: { width: 1400, height: 900 } });
const page: Page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(30_000);

async function fill(box: Locator, text: string, multiline: boolean) {
  await box.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  const lines = multiline ? text.split("\n") : [text];
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press("Enter");
    if (lines[i]) await page.keyboard.insertText(lines[i]);
  }
  const got = (await box.innerText()).replace(/\s+/g, " ").trim();
  if (got !== text.replace(/\s+/g, " ").trim()) throw new Error(`text didn't stick (got "${got.slice(0, 60)}…")`);
}

// Videos uploaded before thumbnails were added get theirs on the video's edit page.
for (const ep of pack.filter((e) => e.n >= a && e.n <= (b || a) && e.url && !e.thumb)) {
  const id = ep.url.split("/").pop();
  await step(`thumbnail for episode ${ep.n}`, async () => {
    await page.goto(`https://studio.youtube.com/video/${id}/edit`);
    await page.locator("ytcp-thumbnail-uploader input#file-loader").setInputFiles(thumb(ep.n));
    const save = page.locator("ytcp-button#save");
    await page.waitForFunction(() => document.querySelector("ytcp-button#save")?.getAttribute("aria-disabled") !== "true", undefined, { timeout: 60_000 });
    await save.click();
    await page.waitForFunction(() => document.querySelector("ytcp-button#save")?.getAttribute("aria-disabled") === "true", undefined, { timeout: 60_000 });
  });
  ep.thumb = true;
  writeFileSync(PACK, JSON.stringify(pack, null, 1));
  console.log(`Episode ${ep.n}: thumbnail set`);
}

for (const ep of todo) {
  console.log(`Episode ${ep.n}: ${ep.ytTitle}`);
  // A run that stopped part-way leaves a draft (already uploaded, private): finish that instead of
  // uploading the episode twice.
  let resumed = false;
  await step("look for an unfinished draft", async () => {
    await page.goto(`https://studio.youtube.com/channel/${CHANNEL}/videos/upload`);
    if (!page.url().includes("studio.youtube.com")) throw new Error("not signed in to YouTube Studio");
    await page.locator("ytcp-video-row, #empty-state, ytcp-video-section-content").first().waitFor();
    await page.waitForTimeout(2000);
    const row = page.locator("ytcp-video-row").filter({ hasText: ep.ytTitle }).filter({ hasText: "Edit draft" });
    if (await row.count()) {
      await row.first().getByText("Edit draft").click();
      resumed = true;
    }
  });
  if (!resumed) {
    await step("open the upload dialog", async () => {
      await page.goto(`https://studio.youtube.com/channel/${CHANNEL}/videos/upload?d=ud`);
      await page.locator('input[type="file"]').first().waitFor({ state: "attached" });
    });
    await step("choose the file", () => page.locator('input[type="file"]').first().setInputFiles(`.data/demo-video/series/voiced/${ep.file}`));
  } else console.log("  finishing the draft left by an earlier run");
  await page.locator("#title-textarea #textbox").waitFor();
  await step("title", async () => fill(page.locator("#title-textarea #textbox"), ep.ytTitle, false));
  await step("description", async () => fill(page.locator("#description-textarea #textbox"), description(ep.n), true));
  await step("thumbnail", () => page.locator("ytcp-thumbnail-uploader input#file-loader").setInputFiles(thumb(ep.n)));

  await step("playlist", async () => {
    await page.locator("ytcp-video-metadata-playlists ytcp-dropdown-trigger").click();
    const dialog = page.locator("ytcp-playlist-dialog > tp-yt-paper-dialog");
    await dialog.waitFor();
    await page.waitForTimeout(1500); // the list fills in after the dialog opens
    const list = dialog.locator("#playlists-list");
    if (!(await list.getByText(PLAYLIST, { exact: true }).count())) {
      // First upload: make the playlist, unlisted, oldest first so the episodes play in order.
      await dialog.locator('button[aria-label="Create playlist"]').click();
      await page.getByRole("menuitem", { name: "New playlist" }).click();
      const create = page.locator("ytcp-playlist-creation-dialog tp-yt-paper-dialog").first();
      await create.waitFor();
      await fill(create.locator("#title-textarea #textbox"), PLAYLIST, false);
      const choose = async (menu: string, item: RegExp) => {
        await create.locator(`${menu} ytcp-dropdown-trigger`).click();
        await page.locator("tp-yt-paper-item:visible").filter({ hasText: item }).first().click();
      };
      await choose("#visibility-selector", /^\s*Unlisted\s*$/);
      await choose("#metadata-sorting-menu", /Date added \(oldest\)|Manual/);
      await create.locator("#create-button").click();
      await create.waitFor({ state: "hidden" });
      await list.getByText(PLAYLIST, { exact: true }).waitFor();
    }
    if (!(await list.locator('[aria-checked="true"]').count())) await list.getByText(PLAYLIST, { exact: true }).click();
    if (!(await list.locator('[aria-checked="true"]').count())) throw new Error("playlist not ticked");
    await dialog.locator('button[aria-label="Done"]').click();
    await dialog.waitFor({ state: "hidden" });
  });

  await step("not made for kids", () => page.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').click());
  for (let k = 0; k < 3; k++) await step(`next (${k + 1})`, () => page.locator("#next-button").click());
  await step("unlisted", async () => {
    await page.locator('tp-yt-paper-radio-button[name="UNLISTED"]').click();
    if ((await page.locator('tp-yt-paper-radio-button[name="UNLISTED"]').getAttribute("aria-checked")) !== "true") throw new Error("Unlisted not selected");
  });

  let url = "";
  await step("read the video link", async () => {
    const link = page.locator('a[href*="youtu.be/"]:visible').first();
    await link.waitFor();
    url = (await link.getAttribute("href")) ?? "";
    if (!/youtu\.be\/|watch\?v=/.test(url)) throw new Error(`odd link ${url}`);
  });
  await step("wait for the upload to finish", async () => {
    await page.waitForFunction(
      () => !/upload(ing)?\s+\d+%|uploading/i.test(document.querySelector("ytcp-video-upload-progress")?.textContent ?? ""),
      undefined,
      { timeout: 15 * 60_000, polling: 2000 },
    );
  });
  await step("save", async () => {
    await page.locator("#done-button").click();
    await page.locator("ytcp-uploads-dialog").waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
  });

  ep.url = url;
  ep.thumb = true;
  writeFileSync(PACK, JSON.stringify(pack, null, 1));
  console.log(`  uploaded, unlisted: ${url}`);
  await page.keyboard.press("Escape").catch(() => {});
}

await ctx.close();
console.log(`Done: ${todo.length} uploaded.`);
