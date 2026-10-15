import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { membershipRoles, memberships, plans, roles, schools, users } from "../db/schema";
import { AppError } from "../errors";
import type { PlanRow } from "../plans/entitlements";
import { isPermission, type Permission } from "../rbac/permissions";
import { getSystemRole, type RoleKind } from "../rbac/roles";

export type RoleRow = typeof roles.$inferSelect;

export function rolePermissions(role: Pick<RoleRow, "key" | "isSystem" | "permissions">): Permission[] {
  if (role.isSystem) return [...(getSystemRole(role.key)?.permissions ?? [])];
  return role.permissions.filter(isPermission);
}

export type Access = {
  user: { id: string; name: string; email: string | null };
  school: typeof schools.$inferSelect;
  plan: PlanRow;
  membershipId: string;
  roles: { id: string; key: string; name: string; kind: RoleKind }[];
  permissions: Set<Permission>;
  isStaff: boolean;
};

/** Resolves what a user can do in a school, or null if they aren't an active member. */
export async function loadAccess(db: DB, userId: string, schoolSlug: string): Promise<Access | null> {
  const [row] = await db
    .select({ school: schools, plan: plans, membership: memberships, user: users })
    .from(memberships)
    .innerJoin(schools, eq(schools.id, memberships.schoolId))
    .innerJoin(plans, eq(plans.key, schools.planKey))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.userId, userId), eq(schools.slug, schoolSlug), eq(memberships.status, "active")))
    .limit(1);
  if (!row) return null;

  const assigned = await db
    .select({ role: roles })
    .from(membershipRoles)
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(eq(membershipRoles.membershipId, row.membership.id));

  const permissions = new Set<Permission>();
  for (const { role } of assigned) for (const p of rolePermissions(role)) permissions.add(p);

  return {
    user: { id: row.user.id, name: row.user.name, email: row.user.email },
    school: row.school,
    plan: row.plan,
    membershipId: row.membership.id,
    roles: assigned.map(({ role }) => ({ id: role.id, key: role.key, name: role.name, kind: role.kind })),
    permissions,
    isStaff: assigned.some(({ role }) => role.kind === "staff"),
  };
}

export function can(access: Access, permission: Permission): boolean {
  return access.permissions.has(permission);
}

export function requirePermission(access: Access, permission: Permission) {
  if (!can(access, permission)) throw new AppError("You don't have permission to do that.", "forbidden");
}

export async function listUserSchools(db: DB, userId: string) {
  return db
    .select({ id: schools.id, name: schools.name, slug: schools.slug, logoUrl: schools.logoUrl })
    .from(memberships)
    .innerJoin(schools, eq(schools.id, memberships.schoolId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
    .orderBy(schools.name);
}
