import { z } from "zod";

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 });

/** ₦150,000 or ₦150,000.50. Money is always held in kobo. */
export function formatNaira(kobo: number): string {
  return naira.format(kobo / 100).replace("NGN", "₦").replace(/\s/g, "");
}

/** ₦1.2M, ₦850K: for stat cards and chart labels. */
export function formatNairaCompact(kobo: number): string {
  const n = kobo / 100;
  return Math.abs(n) < 10_000 ? formatNaira(kobo) : `₦${compact.format(n)}`;
}

/** Plain number for inputs, e.g. 150000 or 150000.5. */
export function koboToInput(kobo: number | null | undefined): string {
  if (kobo == null) return "";
  return (kobo / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/** Reads what people type: "150,000", "₦150000", "150000.50", "150k". Returns kobo, or null if it isn't money. */
export function parseNaira(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase().replace(/[₦,\s]/g, "").replace(/^ngn/, "");
  if (!s) return null;
  let multiplier = 1;
  if (/^\d+(\.\d+)?k$/.test(s)) {
    multiplier = 1000;
    s = s.slice(0, -1);
  } else if (/^\d+(\.\d+)?m$/.test(s)) {
    multiplier = 1_000_000;
    s = s.slice(0, -1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s) && multiplier === 1) return null;
  const value = Number(s) * multiplier;
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

const MAX_KOBO = 100_000_000_000_00; // ₦100 billion

/** A required amount in naira, validated and turned into kobo. */
export function nairaField(label = "amount", { allowZero = false } = {}) {
  return z.unknown().transform((v, ctx) => {
    const kobo = parseNaira(v);
    if (kobo === null) {
      ctx.addIssue({ code: "custom", message: `Enter the ${label} in naira, e.g. 150,000.` });
      return z.NEVER;
    }
    if (kobo < 0 || (!allowZero && kobo === 0)) {
      ctx.addIssue({ code: "custom", message: `The ${label} must be more than ₦0.` });
      return z.NEVER;
    }
    if (kobo > MAX_KOBO) {
      ctx.addIssue({ code: "custom", message: `That ${label} is too large.` });
      return z.NEVER;
    }
    return kobo;
  });
}
