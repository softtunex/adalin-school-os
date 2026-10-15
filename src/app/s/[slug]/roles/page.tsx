import type { Metadata } from "next";
import { Card, Chip, PageHeader } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { UpgradeCard } from "@/components/upgrade-card";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { PERMISSION_GROUPS, permissionLabel, type Permission } from "@/lib/rbac/permissions";
import { can } from "@/lib/services/access";
import { listRoles } from "@/lib/services/roles";
import { DeleteRoleButton, RoleEditorButton } from "./roles-client";

export const metadata: Metadata = { title: "Roles" };

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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Roles"
        description="What each role can see and do. People can hold more than one role, for example a teacher who is also the bursar."
        actions={canManage && customAllowed ? <RoleEditorButton slug={slug} grantable={grantable} /> : null}
      />

      {canManage && !customAllowed ? (
        <UpgradeCard slug={slug} feature="custom_roles" text="Create roles like Exams officer or Vice principal with exactly the permissions you choose." />
      ) : null}

      {[
        { title: "Staff roles", list: staffRoles },
        { title: "Parent and student access", list: portalRoles },
      ].map((section) => (
        <section key={section.title} aria-label={section.title} className="flex flex-col gap-3">
          <h2 className="text-[18px] font-extrabold">{section.title}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {section.list.map((role) => (
              <Card key={role.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-extrabold">{role.name}</h3>
                    <p className="mt-0.5 text-[14.5px] text-muted">{role.description || "Custom role"}</p>
                  </div>
                  {role.isSystem ? <Chip>Built-in</Chip> : <Chip tone="blue">Custom</Chip>}
                </div>
                <p className="tabular mt-3 flex items-center gap-1.5 text-[13.5px] font-bold text-body">
                  <Icon name="users" size={16} /> {role.memberCount} {role.memberCount === 1 ? "person" : "people"}
                </p>
                <details className="group mt-3 rounded-chunk border-2 border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13.5px] font-bold text-blue">
                    {role.permissions.length} permissions
                    <Icon name="chevronDown" size={17} className="transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="flex flex-col gap-3 border-t-2 border-line px-3 py-3">
                    {groupPermissions(role.permissions).map(([group, labels]) => (
                      <div key={group}>
                        <p className="label-caps text-muted">{group}</p>
                        <p className="mt-0.5 text-[14px] text-body">{labels.join(" · ")}</p>
                      </div>
                    ))}
                  </div>
                </details>
                {!role.isSystem && canManage && customAllowed ? (
                  <div className="mt-4 flex gap-2">
                    <RoleEditorButton slug={slug} grantable={grantable} role={{ id: role.id, name: role.name, description: role.description, permissions: role.permissions }} />
                    <DeleteRoleButton slug={slug} roleId={role.id} />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
