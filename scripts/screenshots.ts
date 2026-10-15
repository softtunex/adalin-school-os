import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3005";
const OUT = process.env.OUT_DIR ?? ".data/shots";
const EMAIL = "director@demo.schoolos.ng";
const PASSWORD = "Demo2026!";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const pages = (process.env.PAGES ?? "overview,staff,audit,roles,settings").split(",");

  for (const [label, opts] of [
    ["desktop", { viewport: { width: 1440, height: 900 } }],
    ["mobile", { ...devices["Pixel 7"] }],
  ] as const) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    for (const path of ["/", "/login"]) {
      await page.goto(BASE + path);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${OUT}/${label}-${path === "/" ? "home" : "login"}.png`, fullPage: path === "/" });
    }
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/s\//);
    const slug = new URL(page.url()).pathname.split("/")[2];
    for (const theme of ["light", "dark"]) {
      await ctx.addCookies([{ name: "theme", value: theme, url: BASE }]);
      for (const p of pages) {
        if (theme === "dark" && !["overview", "staff"].includes(p)) continue;
        await page.goto(`${BASE}/s/${slug}${p === "overview" ? "" : `/${p}`}`);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${OUT}/${label}-${theme}-${p}.png`, fullPage: label === "desktop" });
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
