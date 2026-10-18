import type { CSSProperties } from "react";

/*
 * A school's own colour. The app's brand tokens are derived from one hex value, so buttons,
 * links, badges and documents all follow it. White text sits on the colour (buttons), so
 * colours too light to read white on are refused.
 */

export const DEFAULT_BRAND = "#FE6007";

/** Colours Nigerian schools commonly wear, offered as one-tap choices. */
export const BRAND_PRESETS: [string, string][] = [
  ["Adalin SchoolHub orange", "#FE6007"],
  ["Royal blue", "#1E4FBF"],
  ["Navy", "#1B2A5C"],
  ["Maroon", "#7A1C2E"],
  ["Wine", "#8E2453"],
  ["Forest green", "#1E6B3A"],
  ["Emerald", "#0F8A5F"],
  ["Purple", "#5B2A86"],
  ["Teal", "#0E7C86"],
  ["Brown", "#7A4A1E"],
];

export function normalizeHex(input: string) {
  const s = input.trim().replace(/^#?/, "#");
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null;
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(c: number[]) {
  return `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Mixes towards black (amount > 0) or white (amount < 0). */
export function shade(hex: string, amount: number) {
  const target = amount > 0 ? 0 : 255;
  const t = Math.abs(amount);
  return toHex(rgb(hex).map((v) => v + (target - v) * t));
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast of white text on this colour (WCAG ratio). */
export function contrastWithWhite(hex: string) {
  return 1.05 / (luminance(hex) + 0.05);
}

/** Large bold button text needs at least 3:1. */
export function brandProblem(hex: string) {
  const h = normalizeHex(hex);
  if (!h) return "Enter a colour like #1E4FBF.";
  if (contrastWithWhite(h) < 3) return "That colour is too light for white writing on buttons. Choose a darker shade.";
  return null;
}

export function brandOf(school: { brandColor?: string | null }, features: readonly string[] | Set<string>) {
  const has = features instanceof Set ? features.has("brand_theme") : features.includes("brand_theme");
  return has && school.brandColor ? (normalizeHex(school.brandColor) ?? DEFAULT_BRAND) : DEFAULT_BRAND;
}

/** CSS variables that re-colour everything inside an element. Washes mix with the page colour, so dark mode still works. */
export function brandStyle(hex: string): CSSProperties | undefined {
  if (hex === DEFAULT_BRAND) return undefined;
  return {
    "--brand": hex,
    "--brand-deep": shade(hex, 0.22),
    // Text in the brand colour: a touch darker on white, much lighter on the dark theme so navy or maroon stay readable.
    "--brand-ink": `light-dark(${shade(hex, 0.08)}, ${shade(hex, -0.55)})`,
    "--brand-wash": `color-mix(in srgb, ${hex} 10%, var(--canvas))`,
    "--brand-wash-strong": `color-mix(in srgb, ${hex} 20%, var(--canvas))`,
  } as CSSProperties;
}
