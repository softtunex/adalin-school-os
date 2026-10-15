import { and, count, countDistinct, desc, gt, ilike, inArray, like, or, type SQL } from "drizzle-orm";
import type { DB } from "../db/client";
import { auditLogs } from "../db/schema";
import { withTenant } from "../db/tenant";
import { getLimit, requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";

export const AUDIT_PAGE_SIZE = 25;

export const AUDIT_CATEGORIES = {
  access: { label: "Access & security", prefixes: ["staff.", "role."] },
  academics: { label: "Academics", prefixes: ["academics.", "session.", "term.", "level.", "class.", "subject.", "teacher."] },
  students: { label: "Students", prefixes: ["student.", "guardian."] },
  school: { label: "School settings", prefixes: ["school."] },
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

/** Changes that deserve a second look: access changes and anything removed. */
export const IMPORTANT_ACTIONS = [
  "staff.deactivated",
  "staff.roles_changed",
  "role.created",
  "role.updated",
  "role.deleted",
  "class.removed",
  "subject.removed",
  "student.status",
  "guardian.unlinked",
] as const;

export function categoryOf(action: string): AuditCategory | null {
  for (const [key, def] of Object.entries(AUDIT_CATEGORIES)) {
    if (def.prefixes.some((p) => action.startsWith(p))) return key as AuditCategory;
  }
  return null;
}

export function isImportant(action: string) {
  return (IMPORTANT_ACTIONS as readonly string[]).includes(action);
}

export type AuditFilters = { q?: string; category?: string; page?: number };

function filterConditions(access: Access, filters: AuditFilters): SQL[] {
  const conditions: SQL[] = [];
  const days = getLimit(access.plan, "audit_days");
  if (days !== null) conditions.push(gt(auditLogs.createdAt, new Date(Date.now() - days * 86_400_000)));
  const cat = filters.category && filters.category in AUDIT_CATEGORIES ? AUDIT_CATEGORIES[filters.category as AuditCategory] : null;
  if (cat) conditions.push(or(...cat.prefixes.map((p) => like(auditLogs.action, `${p}%`)))!);
  if (filters.category === "important") conditions.push(inArray(auditLogs.action, [...IMPORTANT_ACTIONS]));
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conditions.push(or(ilike(auditLogs.summary, term), ilike(auditLogs.actorName, term), ilike(auditLogs.action, term))!);
  }
  return conditions;
}

export async function listAuditLog(db: DB, access: Access, filters: AuditFilters = {}) {
  requirePermission(access, "audit:view");
  requireFeature(access.plan, "audit_log");
  const page = Math.max(1, filters.page ?? 1);
  const where = and(...filterConditions(access, filters));
  const windowOnly = and(...filterConditions(access, {}));
  return withTenant(db, access.school.id, async (tx) => {
    const [rows, [{ total }], [stats], [{ important }], [{ accessCount }]] = await Promise.all([
      tx
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(AUDIT_PAGE_SIZE)
        .offset((page - 1) * AUDIT_PAGE_SIZE),
      tx.select({ total: count() }).from(auditLogs).where(where),
      tx.select({ events: count(), actors: countDistinct(auditLogs.actorUserId) }).from(auditLogs).where(windowOnly),
      tx.select({ important: count() }).from(auditLogs).where(and(windowOnly, inArray(auditLogs.action, [...IMPORTANT_ACTIONS]))),
      tx
        .select({ accessCount: count() })
        .from(auditLogs)
        .where(and(windowOnly, or(...AUDIT_CATEGORIES.access.prefixes.map((p) => like(auditLogs.action, `${p}%`))))),
    ]);
    return { rows, total, page, stats: { events: stats.events, actors: stats.actors, important, access: accessCount } };
  });
}

/** Everything matching the filters, for CSV export (capped). */
export async function exportAuditLog(db: DB, access: Access, filters: AuditFilters = {}) {
  requirePermission(access, "audit:view");
  requireFeature(access.plan, "audit_log");
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(and(...filterConditions(access, filters)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10_000),
  );
}
