import { asc, count, desc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { assessmentComponents, gradeBands, schools, scores } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { DEFAULT_COMPONENTS, GRADING_PRESETS, type Band } from "../results/compute";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

/** Creates default CA/exam components and grading bands the first time a school needs them. */
export async function ensureAssessmentDefaults(tx: Tx, schoolId: string) {
  const [{ n }] = await tx.select({ n: count() }).from(assessmentComponents);
  if (n === 0) {
    await tx.insert(assessmentComponents).values(DEFAULT_COMPONENTS.map((c, i) => ({ schoolId, name: c.name, maxScore: c.maxScore, sort: i }))).onConflictDoNothing();
  }
  const [{ b }] = await tx.select({ b: count() }).from(gradeBands);
  if (b === 0) {
    const [school] = await tx.select({ curriculum: schools.curriculum }).from(schools).where(eq(schools.id, schoolId));
    const preset = school?.curriculum === "british" ? GRADING_PRESETS.british : GRADING_PRESETS.waec;
    await tx.insert(gradeBands).values(preset.bands.map((band) => ({ schoolId, ...band }))).onConflictDoNothing();
  }
}

export async function loadAssessmentConfig(tx: Tx, schoolId: string) {
  await ensureAssessmentDefaults(tx, schoolId);
  const [components, bands] = await Promise.all([
    tx.select().from(assessmentComponents).orderBy(asc(assessmentComponents.sort)),
    tx.select().from(gradeBands).orderBy(desc(gradeBands.minScore)),
  ]);
  return { components, bands: bands as (Band & { id: string })[] };
}

export async function getAssessmentConfig(db: DB, access: Access) {
  requirePermission(access, "academics:view");
  return withTenant(db, access.school.id, async (tx) => {
    const config = await loadAssessmentConfig(tx, access.school.id);
    const counts = await tx.select({ componentId: scores.componentId, n: count() }).from(scores).groupBy(scores.componentId);
    const scoreCounts = Object.fromEntries(counts.map((c) => [c.componentId, c.n]));
    return { ...config, scoreCounts, hasScores: counts.some((c) => c.n > 0) };
  });
}

export const componentsSchema = z
  .array(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1, "Name every component.").max(30),
      maxScore: z.coerce.number().int().min(1).max(100),
    }),
  )
  .min(1, "Add at least one component.")
  .max(8, "Use at most 8 components.")
  .refine((list) => list.reduce((n, c) => n + c.maxScore, 0) === 100, "The maximum scores must add up to 100.")
  .refine((list) => new Set(list.map((c) => c.name.toLowerCase())).size === list.length, "Each component needs a different name.");

/**
 * Replaces the components. Rows with an id keep their recorded scores; rows without one
 * are new, empty columns. Removing a column that already holds scores deletes those
 * scores, so it needs an explicit confirmation from the caller.
 */
export async function saveComponents(
  db: DB,
  access: Access,
  input: z.infer<typeof componentsSchema>,
  opts: { confirmDeleteScores?: boolean; ip?: string | null } = {},
) {
  requirePermission(access, "academics:manage");
  await withTenant(db, access.school.id, async (tx) => {
    const existing = await tx.select().from(assessmentComponents).orderBy(asc(assessmentComponents.sort));
    const byId = new Map(existing.map((c) => [c.id, c]));
    for (const c of input) if (c.id && !byId.has(c.id)) throw new AppError("That assessment column no longer exists. Refresh and try again.", "conflict");

    const keep = new Set(input.flatMap((c) => (c.id ? [c.id] : [])));
    const removed = existing.filter((c) => !keep.has(c.id));
    const counts = await tx.select({ componentId: scores.componentId, n: count(), top: max(scores.score) }).from(scores).groupBy(scores.componentId);
    const stats = new Map(counts.map((c) => [c.componentId, c]));

    const losing = removed.reduce((n, c) => n + (stats.get(c.id)?.n ?? 0), 0);
    if (losing > 0 && !opts.confirmDeleteScores) {
      throw new AppError(`Removing ${removed.map((c) => c.name).join(" and ")} would delete ${losing} recorded score${losing === 1 ? "" : "s"}. Confirm to continue.`, "conflict");
    }
    for (const c of input) {
      const top = c.id ? stats.get(c.id)?.top : null;
      if (top != null && Number(top) > c.maxScore) throw new AppError(`${c.name} already has a score of ${top}, above the new maximum of ${c.maxScore}.`, "conflict");
    }

    if (removed.length) await tx.delete(assessmentComponents).where(inArray(assessmentComponents.id, removed.map((c) => c.id)));
    // Park kept rows on temporary names first so swaps and renames can't trip the unique name index.
    for (const id of keep) await tx.update(assessmentComponents).set({ name: `__${id}` }).where(eq(assessmentComponents.id, id));
    for (const [i, c] of input.entries()) {
      if (c.id) await tx.update(assessmentComponents).set({ name: c.name, maxScore: c.maxScore, sort: i }).where(eq(assessmentComponents.id, c.id));
      else await tx.insert(assessmentComponents).values({ schoolId: access.school.id, name: c.name, maxScore: c.maxScore, sort: i });
    }
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip: opts.ip }, {
      action: "academics.components",
      summary: `Set assessment to ${input.map((c) => `${c.name} ${c.maxScore}`).join(", ")}${losing ? ` (deleted ${losing} scores)` : ""}`,
    });
  });
}

export const bandsSchema = z
  .array(
    z.object({
      grade: z.string().trim().min(1).max(4),
      minScore: z.coerce.number().int().min(0).max(100),
      remark: z.string().trim().max(30).default(""),
      passes: z.boolean(),
    }),
  )
  .min(2, "Add at least two grades.")
  .max(15)
  .refine((list) => list.some((b) => b.minScore === 0), "One grade must start at 0 so every score gets a grade.")
  .refine((list) => new Set(list.map((b) => b.minScore)).size === list.length, "Two grades can't start at the same score.")
  .refine((list) => new Set(list.map((b) => b.grade.toUpperCase())).size === list.length, "Each grade needs a different name.");

export async function saveBands(db: DB, access: Access, input: z.infer<typeof bandsSchema>, ip?: string | null) {
  requirePermission(access, "academics:manage");
  await withTenant(db, access.school.id, async (tx) => {
    await tx.delete(gradeBands);
    await tx.insert(gradeBands).values(input.map((b) => ({ schoolId: access.school.id, ...b })));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "academics.grading",
      summary: `Updated the grading scale (${[...input].sort((a, b) => b.minScore - a.minScore).map((b) => b.grade).join(", ")})`,
    });
  });
}
