import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, Card, IconChip, StatCard, StatGrid } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { UpgradeCard } from "@/components/upgrade-card";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, permissionLabel, type Permission } from "@/lib/rbac/permissions";
import { can } from "@/lib/services/access";
import { listRoles } from "@/lib/services/roles";
import { DeleteRoleButton, RoleEditorButton } from "./roles-client";

export const metadata: Metadata = { title: "Roles & permissions" };

function groupPermissions(perms: Permission[]) {
  const groups = new Map<string, string[]>();
  for (const p of perms) {
    const g = p.split(":")[0] as keyof typeof PERMISSION_GROUPS;
    groups.set(PERMISSION_GROUPS[g].label, [...(groups.get(PERMISSION_GROUPS[g].label) ?? []), permissionLabel(p)]);
  }
  return [...groups.entries()];
}

export default async function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["roles:view"]);
  const roles = await listRoles(getDb(), access);
  const canManage = can(access, "roles:manage");
  const customAllowed = hasFeature(access.plan, "custom_roles");
  const grantable = [...access.permissions];

  const staffRoles = roles.filter((r) => r.kind === "staff");
  const portalRoles = roles.filter((r) => r.kind === "portal");
  const customCount = roles.filter((r) => !r.isSystem).length;
  const assigned = staffRoles.reduce((n, r) => n + r.memberCount, 0);

  return (
    <>
      <Topbar title="Roles & permissions" context={access.school.name} actions={canManage && customAllowed ? <RoleEditorButton slug={slug} grantable={grantable} /> : null} />
      <PageBody>
        <StatGrid>
          <StatCard label="Staff roles" value={staffRoles.length} icon="shield" tone="blue" caption={`${staffRoles.length - customCount} built-in, ${customCount} custom`} />
          <StatCard label="Role assignments" value={assigned} icon="users" tone="success" caption="People can hold more than one role" />
          <StatCard label="Permissions" value={ALL_PERMISSIONS.length} icon="key" tone="violet" caption={`Across ${Object.keys(PERMISSION_GROUPS).length} areas of the school`} />
          <StatCard label="Custom roles" value={customAllowed ? customCount : "—"} icon="star" tone="brand" caption={customAllowed ? "Built by your school" : "Available on Premium"} />
        </StatGrid>

        {canManage && !customAllowed ? (
          <UpgradeCard slug={slug} feature="custom_roles" text="Create roles like Exams officer or Vice principal with exactly the permissions you choose." />
        ) : null}

        {[
          { title: "Staff roles", text: "Each role only sees the parts of the school it needs.", list: staffRoles },
          { title: "Parent and student access", text: "Portal roles only ever see their own children or their own records.", list: portalRoles },
        ].map((section) => (
          <section key={section.title} aria-label={section.title} className="flex flex-col gap-3">
            <div>
              <h2 className="fs-17 font-semibold">{section.title}</h2>
              <p className="fs-14 text-muted">{section.text}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {section.list.map((role) => (
                <Card key={role.id} className="flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <IconChip icon={role.key === "owner" ? "badgeCheck" : role.kind === "portal" ? "user" : role.isSystem ? "shield" : "star"} tone={role.key === "owner" ? "brand" : role.isSystem ? "neutral" : "violet"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="fs-16 font-semibold">{role.name}</h3>
                        {role.isSystem ? null : <Badge tone="violet">Custom</Badge>}
                      </div>
                      <p className="mt-0.5 fs-14 text-muted">{role.description || "Custom role"}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-4 fs-13.5 text-body">
                    <span className="tabular inline-flex items-center gap-1.5">
                      <Icon name="users" size={16} className="text-muted" />
                      {role.memberCount} {role.memberCount === 1 ? "person" : "people"}
                    </span>
                    <span className="tabular inline-flex items-center gap-1.5">
                      <Icon name="key" size={16} className="text-muted" />
                      {role.permissions.length} permissions
                    </span>
                  </div>
                  <details className="group mt-4 rounded-chunk border border-line">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 fs-14 font-medium text-ink hover:bg-paper">
                      What this role can do
                      <Icon name="chevronDown" size={17} className="text-muted transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
                      {groupPermissions(role.permissions).map(([group, labels]) => (
                        <div key={group}>
                          <p className="fs-12.5 font-medium text-muted">{group}</p>
                          <p className="mt-0.5 fs-13.5 text-body">{labels.join(" · ")}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                  {!role.isSystem && canManage && customAllowed ? (
                    <div className="mt-4 flex gap-2">
                      <RoleEditorButton slug={slug} grantable={grantable} role={{ id: role.id, name: role.name, description: role.description, permissions: role.permissions }} />
                      <DeleteRoleButton slug={slug} roleId={role.id} roleName={role.name} />
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          </section>
        ))}
      </PageBody>
    </>
  );
}
