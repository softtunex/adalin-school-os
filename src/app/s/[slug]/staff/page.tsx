import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Avatar, Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getLimit } from "@/lib/plans/entitlements";
import { can, rolePermissions } from "@/lib/services/access";
import { listRoles } from "@/lib/services/roles";
import { listStaff, STAFF_PAGE_SIZE } from "@/lib/services/staff";
import { InviteButton, MemberActions, PendingInviteActions, type RoleOption } from "./staff-client";

export const metadata: Metadata = { title: "Staff" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

export default async function StaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["staff:view"]);
  const db = getDb();
  const status = sp.status === "active" || sp.status === "deactivated" ? sp.status : undefined;
  const [result, allRoles] = await Promise.all([
    listStaff(db, access, { q: sp.q, roleId: sp.role, status, page: Number(sp.page) || 1 }),
    listRoles(db, access),
  ]);
  const { staff, pending, seatsUsed, counts, total, page } = result;

  // Only offer roles this person could actually grant.
  const grantable: RoleOption[] = allRoles
    .filter((r) => r.kind === "staff" && rolePermissions(r).every((p) => access.permissions.has(p)))
    .map((r) => ({ id: r.id, name: r.name, description: r.description }));
  const staffRoles = allRoles.filter((r) => r.kind === "staff");

  const limit = getLimit(access.plan, "staff");
  const canInvite = can(access, "staff:invite");
  const atLimit = limit !== null && seatsUsed >= limit;
  const filtered = Boolean(sp.q || sp.role || status);
  const exportQs = new URLSearchParams(Object.entries({ q: sp.q, role: sp.role, status }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <Topbar
        title="Staff"
        context={access.school.name}
        actions={
          canInvite ? (
            <InviteButton slug={slug} roles={grantable} disabledReason={atLimit ? `Your ${access.plan.name} plan allows ${limit} staff. Upgrade to add more.` : undefined} />
          ) : null
        }
      />
      <PageBody>
        <StatGrid>
          <StatCard label="Total staff" value={counts.total} icon="users" tone="blue" caption={`Across ${counts.rolesInUse} ${counts.rolesInUse === 1 ? "role" : "roles"}`} />
          <StatCard
            label="Active"
            value={counts.active}
            sub={counts.total ? `(${Math.round((counts.active / counts.total) * 100)}%)` : undefined}
            icon="userCheck"
            tone="success"
            progress={{ value: counts.total ? (counts.active / counts.total) * 100 : 0, tone: "success" }}
            caption={counts.deactivated ? `${counts.deactivated} deactivated` : "Everyone can sign in"}
          />
          <StatCard label="Pending invitations" value={pending.length} icon="mail" tone="warning" caption={pending.length ? "Waiting to be accepted" : "None right now"} />
          <StatCard
            label="Staff places"
            value={limit === null ? seatsUsed : `${seatsUsed} / ${limit}`}
            icon="layers"
            tone="brand"
            progress={limit === null ? undefined : { value: (seatsUsed / limit) * 100, tone: atLimit ? "danger" : "brand" }}
            caption={limit === null ? `Unlimited on ${access.plan.name}` : `${access.plan.name} plan limit, includes pending`}
          />
        </StatGrid>

        <TableCard
          title="All staff"
          toolbar={
            <>
              <SearchInput placeholder="Search name, email or title…" />
              <FilterSelect label="Role" param="role" options={staffRoles.map((r) => ({ value: r.id, label: r.name }))} />
              <FilterSelect
                label="Status"
                param="status"
                options={[
                  { value: "active", label: "Active" },
                  { value: "deactivated", label: "Deactivated" },
                ]}
              />
              <ToolbarLink href={`/s/${slug}/staff/export${exportQs ? `?${exportQs}` : ""}`} icon="download">
                Export CSV
              </ToolbarLink>
            </>
          }
          footer={<Pagination page={page} pageSize={STAFF_PAGE_SIZE} total={total} noun="staff" />}
        >
          {staff.length === 0 ? (
            <EmptyState icon="users" title={filtered ? "No staff match these filters" : "No staff yet"}>
              {filtered ? "Try a different search or clear the filters." : "Invite your teachers and admin staff. Each person only sees what their role allows."}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Roles</Th>
                  <Th>Job title</Th>
                  <Th>Status</Th>
                  <Th>Joined</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => {
                  const isSelf = m.membershipId === access.membershipId;
                  return (
                    <tr key={m.membershipId} className="transition-colors hover:bg-paper">
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={m.name} size={36} />
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {m.name} {isSelf ? <span className="font-normal text-muted">(you)</span> : null}
                            </p>
                            <p className="truncate fs-13 text-muted">{m.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {m.roles
                            .filter((r) => r.kind === "staff")
                            .map((r) => (
                              <Badge key={r.roleId} tone={r.key === "owner" ? "brand" : "neutral"}>
                                {r.name}
                              </Badge>
                            ))}
                        </div>
                      </Td>
                      <Td className="text-body">{m.jobTitle ?? "—"}</Td>
                      <Td>
                        {m.status === "active" ? (
                          <Badge tone="success" dot>
                            Active
                          </Badge>
                        ) : (
                          <Badge tone="danger" dot>
                            Deactivated
                          </Badge>
                        )}
                      </Td>
                      <Td className="tabular whitespace-nowrap text-body">{dateFmt.format(m.joinedAt)}</Td>
                      <Td className="text-right">
                        {!isSelf ? (
                          <MemberActions
                            slug={slug}
                            member={{ membershipId: m.membershipId, name: m.name, status: m.status, roleIds: m.roles.map((r) => r.roleId) }}
                            roles={grantable}
                            canAssign={can(access, "staff:assign_roles")}
                            canDeactivate={can(access, "staff:deactivate")}
                          />
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </TableCard>

        {canInvite && pending.length > 0 ? (
          <TableCard title="Pending invitations">
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Sent</Th>
                  <Th>Status</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((inv) => {
                  const expired = inv.expiresAt < new Date();
                  return (
                    <tr key={inv.id} className="hover:bg-paper">
                      <Td>
                        <p className="font-medium">{inv.name}</p>
                        <p className="fs-13 text-muted">{inv.email}</p>
                      </Td>
                      <Td className="tabular text-body">{dateFmt.format(inv.createdAt)}</Td>
                      <Td>
                        {expired ? (
                          <Badge tone="warning" dot>
                            Expired
                          </Badge>
                        ) : (
                          <Badge tone="blue" dot>
                            Expires {dateFmt.format(inv.expiresAt)}
                          </Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        <PendingInviteActions slug={slug} invitationId={inv.id} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableCard>
        ) : null}
      </PageBody>
    </>
  );
}
