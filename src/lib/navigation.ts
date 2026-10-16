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
      { href: "/attendance", label: "Attendance", icon: "calendarCheck", anyOf: ["attendance:take", "attendance:edit_past", "attendance:report"], feature: "attendance", staffOnly: true },
      { href: "/results", label: "Results", icon: "results", anyOf: ["results:enter", "results:view"], feature: "score_entry", staffOnly: true },
      { href: "/students", label: "Students", icon: "graduation", anyOf: ["students:view"], staffOnly: true },
      { href: "/timetable", label: "Timetable", icon: "clock", feature: "timetable", staffOnly: true },
      { href: "/assignments", label: "Assignments", icon: "clipboard", anyOf: ["teaching:lessons"], feature: "assignments", staffOnly: true },
      { href: "/cbt", label: "CBT exams", icon: "monitor", anyOf: ["teaching:cbt"], feature: "cbt", staffOnly: true },
      { href: "/lesson-notes", label: "Lesson notes", icon: "book", anyOf: ["teaching:lessons", "teaching:review"], feature: "assignments", staffOnly: true },
      { href: "/academics", label: "Academics", icon: "bookOpen", anyOf: ["academics:view"], staffOnly: true },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/announcements", label: "Announcements", icon: "bell", feature: "announcements", staffOnly: true },
      { href: "/calendar", label: "Calendar", icon: "calendar", feature: "announcements", staffOnly: true },
      { href: "/messages", label: "Messages", icon: "chat", anyOf: ["comms:message"], feature: "messaging", staffOnly: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/fees", label: "Fees", icon: "wallet", anyOf: ["fees:view"], feature: "fees_basic", staffOnly: true },
      { href: "/expenses", label: "Expenses", icon: "receipt", anyOf: ["expenses:view"], feature: "expenses", staffOnly: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/staff", label: "Staff", icon: "users", anyOf: ["staff:view"], staffOnly: true },
      { href: "/roles", label: "Roles & permissions", icon: "shield", anyOf: ["roles:view"], staffOnly: true },
      { href: "/audit", label: "Audit log", icon: "history", anyOf: ["audit:view"], feature: "audit_log", staffOnly: true },
      { href: "/settings", label: "Settings", icon: "settings", anyOf: ["school:update", "school:billing", "fees:manage"], staffOnly: true },
    ],
  },
];

export type ResolvedNavItem = { href: string; label: string; icon: IconName; locked: boolean; badge?: number };

export function resolveNav(
  slug: string,
  ctx: { permissions: Set<Permission>; features: Set<string>; isStaff: boolean; badges?: Record<string, number> },
): { label?: string; items: ResolvedNavItem[] }[] {
  return NAV.map((section) => ({
    label: section.label,
    items: section.items
      .filter((i) => (!i.staffOnly || ctx.isStaff) && (!i.anyOf || i.anyOf.some((p) => ctx.permissions.has(p))))
      .map((i) => ({ href: `/s/${slug}${i.href}`, label: i.label, icon: i.icon, locked: !!i.feature && !ctx.features.has(i.feature), badge: ctx.badges?.[i.href] })),
  })).filter((s) => s.items.length > 0);
}
