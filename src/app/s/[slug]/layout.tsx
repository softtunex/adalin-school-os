import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveNav } from "@/lib/navigation";
import { listUserSchools } from "@/lib/services/access";
import { getTheme } from "@/lib/theme";

export default async function SchoolLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireAccess(slug);
  const [schools, theme] = await Promise.all([listUserSchools(getDb(), access.user.id), getTheme()]);

  return (
    <AppShell
      school={{ name: access.school.name, slug, planName: access.plan.name }}
      user={{ name: access.user.name, roleNames: access.roles.map((r) => r.name) }}
      nav={resolveNav(slug, { permissions: access.permissions, features: new Set(access.plan.features), isStaff: access.isStaff })}
      hasOtherSchools={schools.length > 1}
      theme={theme}
    >
      {children}
    </AppShell>
  );
}
