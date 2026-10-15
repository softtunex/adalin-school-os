import { and, desc, gt, lt } from "drizzle-orm";
import type { DB } from "../db/client";
import { auditLogs } from "../db/schema";
import { withTenant } from "../db/tenant";
import { getLimit, requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLog(db: DB, access: Access, before?: Date) {
  requirePermission(access, "audit:view");
  requireFeature(access.plan, "audit_log");
  const days = getLimit(access.plan, "audit_days");
  const conditions = [];
  if (days !== null) conditions.push(gt(auditLogs.createdAt, new Date(Date.now() - days * 86_400_000)));
  if (before) conditions.push(lt(auditLogs.createdAt, before));
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(AUDIT_PAGE_SIZE),
  );
}
