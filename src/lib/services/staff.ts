import { and, count, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { INVITE_TTL_DAYS } from "../config";
import { hashPassword, hashToken, newToken } from "../auth/crypto";
import type { DB, Tx } from "../db/client";
import { invitations, membershipRoles, memberships, roles, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireWithinLimit } from "../plans/entitlements";
import { requirePermission, rolePermissions, type Access, type RoleRow } from "./access";
import { recordAudit, type AuditActor } from "./audit";
import { markOnboarding } from "./onboarding";

function actorOf(access: Access, ip?: string | null): AuditActor {
  return { userId: access.user.id, name: access.user.name, ip };
}

/** Nobody can hand out a permission they don't hold themselves. */
function assertCanGrant(access: Access, roleRows: RoleRow[]) {
  for (const role of roleRows) {
    for (const p of rolePermissions(role)) {
      if (!access.permissions.has(p)) {
        throw new AppError(`You can't assign the ${role.name} role because it has permissions you don't have.`, "forbidden");
      }
    }
  }
}

async function loadStaffRoles(tx: Tx, roleIds: string[]) {
  if (roleIds.length === 0) throw new AppError("Choose at least one role.", "invalid");
  const rows = await tx.select().from(roles).where(inArray(roles.id, roleIds));
  if (rows.length !== new Set(roleIds).size) throw new AppError("One of the selected roles no longer exists.", "invalid");
  if (rows.some((r) => r.kind !== "staff")) throw new AppError("Parent and student roles can't be given to staff.", "invalid");
  return rows;
}

async function staffSeatsUsed(tx: Tx) {
  const [active] = await tx
    .select({ n: sql<number>`count(distinct ${memberships.id})::int` })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff")));
  const [pending] = await tx
    .select({ n: count() })
    .from(invitations)
    .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())));
  return (active?.n ?? 0) + (pending?.n ?? 0);
}

export async function listStaff(db: DB, access: Access) {
  requirePermission(access, "staff:view");
  return withTenant(db, access.school.id, async (tx) => {
    const members = await tx
      .select({
        membershipId: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        status: memberships.status,
        jobTitle: memberships.jobTitle,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .orderBy(users.name);
    const assignments = await tx
      .select({ membershipId: membershipRoles.membershipId, roleId: roles.id, key: roles.key, name: roles.name, kind: roles.kind })
      .from(membershipRoles)
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId));
    const pending = await tx
      .select()
      .from(invitations)
      .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .orderBy(invitations.createdAt);

    const byMember = new Map<string, typeof assignments>();
    for (const a of assignments) byMember.set(a.membershipId, [...(byMember.get(a.membershipId) ?? []), a]);
    const staff = members
      .map((m) => ({ ...m, roles: byMember.get(m.membershipId) ?? [] }))
      .filter((m) => m.roles.some((r) => r.kind === "staff"));
    return { staff, pending, seatsUsed: await staffSeatsUsed(tx) };
  });
}

export async function inviteStaff(
  db: DB,
  access: Access,
  input: { name: string; email: string; roleIds: string[]; jobTitle?: string },
  ip?: string | null,
) {
  requirePermission(access, "staff:invite");
  return withTenant(db, access.school.id, async (tx) => {
    const roleRows = await loadStaffRoles(tx, input.roleIds);
    assertCanGrant(access, roleRows);
    requireWithinLimit(access.plan, "staff", await staffSeatsUsed(tx));

    const [existing] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`)
      .limit(1);
    if (existing) throw new AppError("This person is already on your staff list.", "conflict");

    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(sql`lower(${invitations.email}) = ${input.email.toLowerCase()}`, isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));

    const token = newToken();
    const [invitation] = await tx
      .insert(invitations)
      .values({
        schoolId: access.school.id,
        name: input.name,
        email: input.email.toLowerCase(),
        roleIds: input.roleIds,
        tokenHash: hashToken(token),
        invitedBy: access.user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      })
      .returning();
    await markOnboarding(tx, access.school.id, "staff");
    await recordAudit(tx, access.school.id, actorOf(access, ip), {
      action: "staff.invited",
      summary: `Invited ${input.name} (${input.email}) as ${roleRows.map((r) => r.name).join(", ")}`,
      entityType: "invitation",
      entityId: invitation.id,
    });
    return { invitation, token };
  });
}

export async function revokeInvitation(db: DB, access: Access, invitationId: string, ip?: string | null) {
  requirePermission(access, "staff:invite");
  await withTenant(db, access.school.id, async (tx) => {
    const [inv] = await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt)))
      .returning();
    if (!inv) throw new AppError("That invitation no longer exists.", "not_found");
    await recordAudit(tx, access.school.id, actorOf(access, ip), {
      action: "staff.invite_revoked",
      summary: `Cancelled the invitation for ${inv.email}`,
      entityType: "invitation",
      entityId: inv.id,
    });
  });
}

/** Looks up a pending invitation by its raw token (platform-level, before the person is a member). */
export async function findInvitation(db: DB, token: string) {
  const [inv] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return inv ?? null;
}

/**
 * Accepts an invitation. Pass `userId` when the person is already logged in to an
 * existing account, otherwise `password` (and optionally `name`) to create one.
 */
export async function acceptInvitation(
  db: DB,
  token: string,
  who: { userId: string } | { name: string; password: string },
) {
  const inv = await findInvitation(db, token);
  if (!inv) throw new AppError("This invitation has expired or was cancelled. Ask the school for a new one.", "invalid");

  const passwordHash = "password" in who ? await hashPassword(who.password) : null;
  return db.transaction(async (tx) => {
    let userId: string;
    if ("userId" in who) {
      const [user] = await tx.select().from(users).where(eq(users.id, who.userId)).limit(1);
      if (!user || user.email?.toLowerCase() !== inv.email) {
        throw new AppError(`This invitation was sent to ${inv.email}. Log in with that email to accept it.`, "forbidden");
      }
      userId = user.id;
    } else {
      const [existing] = await tx.select().from(users).where(sql`lower(${users.email}) = ${inv.email}`).limit(1);
      if (existing) throw new AppError("You already have an account. Log in to accept this invitation.", "conflict");
      const [user] = await tx.insert(users).values({ name: who.name, email: inv.email, passwordHash }).returning();
      userId = user.id;
    }

    const validRoles = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.schoolId, inv.schoolId), inArray(roles.id, inv.roleIds)));
    if (validRoles.length === 0) throw new AppError("The roles on this invitation were removed. Ask the school for a new one.", "invalid");

    const [membership] = await tx
      .insert(memberships)
      .values({ schoolId: inv.schoolId, userId })
      .onConflictDoUpdate({ target: [memberships.schoolId, memberships.userId], set: { status: "active" } })
      .returning();
    await tx
      .insert(membershipRoles)
      .values(validRoles.map((r) => ({ schoolId: inv.schoolId, membershipId: membership.id, roleId: r.id })))
      .onConflictDoNothing();
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    await tx.update(users).set({ lastSchoolId: inv.schoolId }).where(eq(users.id, userId));
    await recordAudit(tx, inv.schoolId, null, {
      action: "staff.joined",
      summary: `${inv.name} accepted their invitation`,
      entityType: "membership",
      entityId: membership.id,
    });
    return { userId, schoolId: inv.schoolId };
  });
}

async function activeOwnerCount(tx: Tx, excludingMembershipId?: string) {
  const conditions = [eq(roles.key, "owner"), eq(memberships.status, "active")];
  if (excludingMembershipId) conditions.push(ne(memberships.id, excludingMembershipId));
  const [row] = await tx
    .select({ n: count() })
    .from(membershipRoles)
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
    .where(and(...conditions));
  return row?.n ?? 0;
}

export async function setMemberRoles(db: DB, access: Access, membershipId: string, roleIds: string[], ip?: string | null) {
  requirePermission(access, "staff:assign_roles");
  await withTenant(db, access.school.id, async (tx) => {
    const [member] = await tx
      .select({ id: memberships.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.id, membershipId))
      .limit(1);
    if (!member) throw new AppError("That staff member wasn't found.", "not_found");

    const newRoles = await loadStaffRoles(tx, roleIds);
    const currentRoles = (
      await tx.select({ role: roles }).from(membershipRoles).innerJoin(roles, eq(roles.id, membershipRoles.roleId)).where(eq(membershipRoles.membershipId, membershipId))
    ).map((r) => r.role);

    // Granting and removing are both privileged: you can't touch roles above your own level.
    assertCanGrant(access, newRoles);
    assertCanGrant(access, currentRoles);

    const keepsOwner = newRoles.some((r) => r.key === "owner");
    const hadOwner = currentRoles.some((r) => r.key === "owner");
    if (hadOwner && !keepsOwner && (await activeOwnerCount(tx, membershipId)) === 0) {
      throw new AppError("A school must always have at least one Proprietor.", "invalid");
    }

    const staffRoleIds = currentRoles.filter((r) => r.kind === "staff").map((r) => r.id);
    if (staffRoleIds.length) {
      await tx.delete(membershipRoles).where(and(eq(membershipRoles.membershipId, membershipId), inArray(membershipRoles.roleId, staffRoleIds)));
    }
    await tx.insert(membershipRoles).values(newRoles.map((r) => ({ schoolId: access.school.id, membershipId, roleId: r.id })));
    await recordAudit(tx, access.school.id, actorOf(access, ip), {
      action: "staff.roles_changed",
      summary: `Changed ${member.name}'s roles to ${newRoles.map((r) => r.name).join(", ")}`,
      entityType: "membership",
      entityId: membershipId,
      meta: { from: currentRoles.map((r) => r.key), to: newRoles.map((r) => r.key) },
    });
  });
}

export async function setMemberStatus(
  db: DB,
  access: Access,
  membershipId: string,
  status: "active" | "deactivated",
  ip?: string | null,
) {
  requirePermission(access, "staff:deactivate");
  if (membershipId === access.membershipId) throw new AppError("You can't deactivate your own account.", "invalid");
  await withTenant(db, access.school.id, async (tx) => {
    const [member] = await tx
      .select({ id: memberships.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.id, membershipId))
      .limit(1);
    if (!member) throw new AppError("That staff member wasn't found.", "not_found");
    const memberRoles = (
      await tx.select({ role: roles }).from(membershipRoles).innerJoin(roles, eq(roles.id, membershipRoles.roleId)).where(eq(membershipRoles.membershipId, membershipId))
    ).map((r) => r.role);
    assertCanGrant(access, memberRoles);
    if (status === "active") requireWithinLimit(access.plan, "staff", await staffSeatsUsed(tx));

    await tx.update(memberships).set({ status }).where(eq(memberships.id, membershipId));
    await recordAudit(tx, access.school.id, actorOf(access, ip), {
      action: status === "active" ? "staff.reactivated" : "staff.deactivated",
      summary: `${status === "active" ? "Reactivated" : "Deactivated"} ${member.name}`,
      entityType: "membership",
      entityId: membershipId,
    });
  });
}
