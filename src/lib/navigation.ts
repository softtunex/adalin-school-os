import type { IconName } from "@/components/ui/icons";
import type { FeatureKey } from "./plans/catalog";
import type { Permission } from "./rbac/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Shown when the user holds any of these. Omit for everyone. */
  anyOf?: Permission[];
  /** Plan feature that unlocks it. Shown with a lock when missing. */
  feature?: FeatureKey;
  staffOnly?: boolean;
};

export type NavSection = { label?: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    items: [
      { href: "", label: "Overview", icon: "grid" },
      { href: "/students", label: "Students", icon: "graduation", anyOf: ["students:view"], staffOnly: true },
      { href: "/academics", label: "Academics", icon: "bookOpen", anyOf: ["academics:view"], staffOnly: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/staff", label: "Staff", icon: "users", anyOf: ["staff:view"], staffOnly: true },
      { href: "/roles", label: "Roles & permissions", icon: "shield", anyOf: ["roles:view"], staffOnly: true },
      { href: "/audit", label: "Audit log", icon: "history", anyOf: ["audit:view"], feature: "audit_log", staffOnly: true },
      { href: "/settings", label: "Settings", icon: "settings", anyOf: ["school:update", "school:billing"], staffOnly: true },
    ],
  },
];

export type ResolvedNavItem = { href: string; label: string; icon: IconName; locked: boolean };

export function resolveNav(
  slug: string,
  ctx: { permissions: Set<Permission>; features: Set<string>; isStaff: boolean },
): { label?: string; items: ResolvedNavItem[] }[] {
  return NAV.map((section) => ({
    label: section.label,
    items: section.items
      .filter((i) => (!i.staffOnly || ctx.isStaff) && (!i.anyOf || i.anyOf.some((p) => ctx.permissions.has(p))))
      .map((i) => ({ href: `/s/${slug}${i.href}`, label: i.label, icon: i.icon, locked: !!i.feature && !ctx.features.has(i.feature) })),
  })).filter((s) => s.items.length > 0);
}
