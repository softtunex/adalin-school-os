import { AppError } from "../errors";
import { cheapestPlanWith, FEATURES, LIMITS, type FeatureKey, type LimitKey } from "./catalog";

export type PlanRow = {
  key: string;
  name: string;
  pricePerStudentKobo: number | null;
  features: string[];
  limits: Record<string, number>;
  sort: number;
};

export function hasFeature(plan: PlanRow, feature: FeatureKey): boolean {
  return plan.features.includes(feature);
}

/** null means unlimited. */
export function getLimit(plan: PlanRow, limit: LimitKey): number | null {
  const value = plan.limits[limit];
  return typeof value === "number" ? value : null;
}

export function requireFeature(plan: PlanRow, feature: FeatureKey) {
  if (hasFeature(plan, feature)) return;
  const upgrade = cheapestPlanWith(feature);
  throw new AppError(
    `${FEATURES[feature]} is available from the ${upgrade?.name ?? "a higher"} plan. Upgrade to use it.`,
    "upgrade",
  );
}

export function requireWithinLimit(plan: PlanRow, limit: LimitKey, currentCount: number, adding = 1) {
  const max = getLimit(plan, limit);
  if (max === null || currentCount + adding <= max) return;
  throw new AppError(
    `Your ${plan.name} plan allows ${max} ${LIMITS[limit].toLowerCase()}. Upgrade to add more.`,
    "limit",
  );
}
