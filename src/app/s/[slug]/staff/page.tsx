import type { Metadata } from "next";
import { Avatar, Card, Chip, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getLimit } from "@/lib/plans/entitlements";
import { can, rolePermissions } from "@/lib/services/access";
import { listRoles } from "@/lib/services/roles";
import { listStaff } from "@/lib/services/staff";
import { InviteButton, MemberActions, RevokeInviteButton, type RoleOption } from "./staff-client";

export const metadata: Metadata = { title: "Staff" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireAccess(slug);
  const db = getDb();
  const [{ staff, pending, seatsUsed }, allRoles] = await Promise.all([listStaff(db, access), listRoles(db, access)]);

  // Only offer roles this person could actually grant.
  const grantable: RoleOption[] = allRoles
    .filter((r) => r.kind === "staff" && rolePermissions(r).every((p) => access.permissions.has(p)))
    .map((r) => ({ id: r.id, name: r.name, description: r.description }));

  const limit = getLimit(access.plan, "staff");
  const canInvite = can(access, "staff:invite");
  const canAssign = can(access, "staff:assign_roles");
  const canDeactivate = can(access, "staff:deactivate");
  const atLimit = limit !== null && seatsUsed >= limit;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Staff"
        description={
          limit !== null
            ? `${seatsUsed} of ${limit} staff places used on the ${access.plan.name} plan, including pending invitations.`
            : `${staff.length} staff members.`
        }
        actions={canInvite ? <InviteButton slug={slug} roles={grantable} disabledReason={atLimit ? `Your ${access.plan.name} plan allows ${limit} staff. Upgrade to add more.` : undefined} /> : null}
      />

      {staff.length === 0 ? (
        <EmptyState icon={<Icon name="users" size={26} />} title="No staff yet">
          Invite your teachers and admin staff. Each person only sees what their role allows.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {staff.map((m) => {
              const isSelf = m.membershipId === access.membershipId;
              return (
                <tr key={m.membershipId} className={m.status === "deactivated" ? "opacity-60" : undefined}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} size={38} />
                      <div className="min-w-0">
                        <p className="font-bold text-ink">
                          {m.name} {isSelf ? <span className="font-medium text-muted">(you)</span> : null}
                        </p>
                        <p className="truncate text-[13.5px] text-muted">{m.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {m.roles
                        .filter((r) => r.kind === "staff")
                        .map((r) => (
                          <Chip key={r.roleId} tone={r.key === "owner" ? "brand" : "neutral"}>
                            {r.name}
                          </Chip>
                        ))}
                    </div>
                  </Td>
                  <Td>{m.status === "active" ? <Chip tone="success">Active</Chip> : <Chip tone="danger">Deactivated</Chip>}</Td>
                  <Td className="tabular whitespace-nowrap text-muted">{dateFmt.format(m.joinedAt)}</Td>
                  <Td className="text-right">
                    {!isSelf && (canAssign || canDeactivate) ? (
                      <MemberActions
                        slug={slug}
                        member={{ membershipId: m.membershipId, name: m.name, status: m.status, roleIds: m.roles.map((r) => r.roleId) }}
                        roles={grantable}
                        canAssign={canAssign}
                        canDeactivate={canDeactivate}
                      />
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {canInvite && pending.length > 0 ? (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="text-[18px] font-extrabold">
            Pending invitations
          </h2>
          <div className="mt-3 grid gap-3">
            {pending.map((inv) => {
              const expired = inv.expiresAt < new Date();
              return (
                <Card key={inv.id} className="flex flex-wrap items-center gap-4 p-4">
                  <span className="grid size-10 place-items-center rounded-[12px] bg-blue-wash text-blue">
                    <Icon name="mail" size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink">{inv.name}</p>
                    <p className="truncate text-[13.5px] text-muted">
                      {inv.email} · {expired ? "Expired" : `Expires ${dateFmt.format(inv.expiresAt)}`}
                    </p>
                  </div>
                  {expired ? <Chip tone="warning">Expired</Chip> : <Chip tone="blue">Waiting</Chip>}
                  <RevokeInviteButton slug={slug} invitationId={inv.id} />
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
