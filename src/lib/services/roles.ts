import { and, count, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { membershipRoles, memberships, roles } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { isPermission, type Permission } from "../rbac/permissions";
import { requirePermission, rolePermissions, type Access } from "./access";
import { recordAudit } from "./audit";
import { slugify } from "./schools";

export async function listRoles(db: DB, access: Access) {
  requirePermission(access, "roles:view");
  return withTenant(db, access.school.id, async (tx) => {
    const rows = await tx.select().from(roles).orderBy(roles.createdAt);
    const counts = await tx
      .select({ roleId: membershipRoles.roleId, n: count() })
      .from(membershipRoles)
      .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
      .where(eq(memberships.status, "active"))
      .groupBy(membershipRoles.roleId);
    const countBy = new Map(counts.map((c) => [c.roleId, c.n]));
    return rows.map((r) => ({ ...r, permissions: rolePermissions(r), memberCount: countBy.get(r.id) ?? 0 }));
  });
}

function cleanPermissions(access: Access, requested: string[]): Permission[] {
  const valid = [...new Set(requested)].filter(isPermission);
  const notHeld = valid.filter((p) => !access.permissions.has(p));
  if (notHeld.length) throw new AppError("A custom role can't include permissions you don't have yourself.", "forbidden");
  if (valid.length === 0) throw new AppError("Choose at least one permission.", "invalid");
  return valid;
}

export async function createCustomRole(
  db: DB,
  access: Access,
  input: { name: string; description: string; permissions: string[] },
  ip?: string | null,
) {
  requirePermission(access, "roles:manage");
  requireFeature(access.plan, "custom_roles");
  const permissions = cleanPermissions(access, input.permissions);
  return withTenant(db, access.school.id, async (tx) => {
    const key = `custom_${slugify(input.name).replace(/-/g, "_")}`;
    const [clash] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
    if (clash) throw new AppError("A role with this name already exists.", "conflict");
    const [role] = await tx
      .insert(roles)
      .values({ schoolId: access.school.id, key, name: input.name, description: input.description, kind: "staff", permissions })
      .returning();
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "role.created",
      summary: `Created the ${role.name} role`,
      entityType: "role",
      entityId: role.id,
      meta: { permissions },
    });
    return role;
  });
}

export async function updateCustomRole(
  db: DB,
  access: Access,
  roleId: string,
  input: { name: string; description: string; permissions: string[] },
  ip?: string | null,
) {
  requirePermission(access, "roles:manage");
  requireFeature(access.plan, "custom_roles");
  const permissions = cleanPermissions(access, input.permissions);
  await withTenant(db, access.school.id, async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw new AppError("That role wasn't found.", "not_found");
    if (role.isSystem) throw new AppError("Built-in roles can't be edited. Create a custom role instead.", "invalid");
    await tx.update(roles).set({ name: input.name, description: input.description, permissions }).where(eq(roles.id, roleId));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "role.updated",
      summary: `Updated the ${input.name} role`,
      entityType: "role",
      entityId: roleId,
      meta: { from: role.permissions, to: permissions },
    });
  });
}

export async function deleteCustomRole(db: DB, access: Access, roleId: string, ip?: string | null) {
  requirePermission(access, "roles:manage");
  await withTenant(db, access.school.id, async (tx) => {
    const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw new AppError("That role wasn't found.", "not_found");
    if (role.isSystem) throw new AppError("Built-in roles can't be deleted.", "invalid");
    const [used] = await tx.select({ n: count() }).from(membershipRoles).where(and(eq(membershipRoles.roleId, roleId)));
    if ((used?.n ?? 0) > 0) throw new AppError("Remove this role from all staff before deleting it.", "conflict");
    await tx.delete(roles).where(eq(roles.id, roleId));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "role.deleted",
      summary: `Deleted the ${role.name} role`,
      entityType: "role",
      entityId: roleId,
    });
  });
}
