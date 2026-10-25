/*
 * How many schools one person can run, and on which plans (Director's decision, 25 Oct 2026):
 * - up to MAX_SELF_SERVE_SCHOOLS schools per proprietor by self-service; more is an Enterprise conversation;
 * - one Free school per proprietor: any other school starts on a free trial that ends onto a paid plan,
 *   and can't be moved back to Free while the proprietor has a free school.
 * Enterprise campuses don't count: groups are set up with us.
 */
import { and, eq } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { membershipRoles, memberships, roles, schools } from "../db/schema";
import { AppError } from "../errors";

export const MAX_SELF_SERVE_SCHOOLS = 5;
/** Where an extra school's trial lands: the cheapest paid plan. */
export const EXTRA_SCHOOL_AFTER_TRIAL = "basic";

type Owned = { id: string; name: string; planKey: string; trialReturnPlanKey: string | null; pendingPlanKey: string | null };

/** Schools this person runs as Proprietor. */
export async function ownedSchools(db: DB | Tx, userId: string): Promise<Owned[]> {
  return db
    .selectDistinct({ id: schools.id, name: schools.name, planKey: schools.planKey, trialReturnPlanKey: schools.trialReturnPlanKey, pendingPlanKey: schools.pendingPlanKey })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(schools, eq(schools.id, memberships.schoolId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active"), eq(roles.key, "owner")));
}

/** Free now, back to Free when a trial ends, or moving to Free next term. */
export function isFreeSchool(s: Pick<Owned, "planKey" | "trialReturnPlanKey" | "pendingPlanKey">) {
  return (s.trialReturnPlanKey ?? s.planKey) === "free" || s.pendingPlanKey === "free";
}

/** What adding another school would mean for this person. */
export async function newSchoolTerms(db: DB | Tx, userId: string) {
  const owned = (await ownedSchools(db, userId)).filter((s) => s.planKey !== "enterprise");
  const free = owned.find(isFreeSchool);
  return { count: owned.length, atLimit: owned.length >= MAX_SELF_SERVE_SCHOOLS, freeSchool: free?.name ?? null };
}

export function limitMessage() {
  return `You run ${MAX_SELF_SERVE_SCHOOLS} schools already. For more, talk to us about Enterprise: one login, a group dashboard and one bill for every school.`;
}

/** Refuses Free for a school whose proprietor already has another free school. */
export async function assertFreeAllowed(db: DB, schoolId: string) {
  const owners = await db
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.schoolId, schoolId), eq(memberships.status, "active"), eq(roles.key, "owner")));
  for (const { userId } of owners) {
    const other = (await ownedSchools(db, userId)).find((s) => s.id !== schoolId && s.planKey !== "enterprise" && isFreeSchool(s));
    if (other) throw new AppError(`Each proprietor gets one free school, and ${other.name} is already on Free. Choose a paid plan for this school.`, "limit");
  }
}

