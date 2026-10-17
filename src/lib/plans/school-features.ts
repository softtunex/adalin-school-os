import { sql } from "drizzle-orm";
import { plans, schools } from "../db/schema";

/**
 * A school's features: its plan's, plus add-ons and anything Adalin granted, minus anything
 * Adalin switched off. For queries that join schools to plans.
 */
export const schoolFeaturesSql = sql<string[]>`(
  select coalesce(jsonb_agg(distinct f.value), '[]'::jsonb)
  from jsonb_array_elements_text(${plans.features} || ${schools.extraFeatures}) as f(value)
  where not (${schools.adminBlocks} ? f.value)
)`.mapWith((v: unknown) => (typeof v === "string" ? (JSON.parse(v) as string[]) : (v as string[])));

/** The same in code, for a school row and its plan's features already in hand. */
export function featuresOf(planFeatures: readonly string[], school: { extraFeatures?: string[] | null; adminBlocks?: string[] | null }) {
  const blocks = new Set(school.adminBlocks ?? []);
  return [...new Set([...planFeatures, ...(school.extraFeatures ?? [])])].filter((f) => !blocks.has(f));
}
