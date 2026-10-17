import { sql } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { platformInvoices } from "../db/schema";
import { lagosToday } from "./attendance";

/** Billing arithmetic shared by plans and add-ons. */

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Share of a term still to run on a day: 1 at or before the start, 0 after the end. */
export function termFraction(term: { startsOn: string | null; endsOn: string | null }, on: string) {
  if (!term.startsOn || !term.endsOn) return 1;
  const total = dayDiff(term.startsOn, term.endsOn) + 1;
  if (total <= 0) return 1;
  const left = dayDiff(on, term.endsOn) + 1;
  return Math.max(0, Math.min(1, left / total));
}

/** Kobo for a number of students (or units) at a price, for a share of the term, rounded to the naira. */
export function charge(priceKobo: number, quantity: number, fraction = 1) {
  return Math.round((priceKobo * quantity * fraction) / 100) * 100;
}

/** The next bill number across every school (ADL-2026-00012). Call outside any school's transaction. */
export async function nextBillNumber(db: DB | Tx) {
  const prefix = `ADL-${lagosToday().slice(0, 4)}-`;
  const [{ top }] = await db
    .select({ top: sql<number>`coalesce(max(cast(substring(${platformInvoices.number} from ${prefix.length + 1}::int) as integer)), 0)`.mapWith(Number) })
    .from(platformInvoices)
    .where(sql`${platformInvoices.number} like ${`${prefix}%`}`);
  return `${prefix}${String(top + 1).padStart(5, "0")}`;
}
