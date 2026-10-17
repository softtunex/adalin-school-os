import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { brandOf, brandStyle } from "@/lib/brand";
import { resolveNav } from "@/lib/navigation";
import { billingNotice } from "@/lib/services/billing";
import { staffBadges } from "@/lib/services/staff-badges";

export default async function SchoolLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireAccess(slug);
  const [badges, notice] = await Promise.all([access.isStaff ? staffBadges(getDb(), access) : {}, access.isStaff ? billingNotice(getDb(), access.school.id) : null]);

  return (
    <AppShell
      school={{ name: access.school.name, slug, planName: access.plan.name, logoUrl: access.school.logoUrl }}
      brand={brandStyle(brandOf(access.school, access.plan.features))}
      notice={notice ? { ...notice, href: `/s/${slug}/settings?tab=plan` } : null}
      user={{ name: access.user.name, email: access.user.email ?? "", roleNames: access.roles.map((r) => r.name) }}
      nav={resolveNav(slug, { permissions: access.permissions, features: new Set(access.plan.features), isStaff: access.isStaff, badges })}
    >
      {children}
    </AppShell>
  );
}
