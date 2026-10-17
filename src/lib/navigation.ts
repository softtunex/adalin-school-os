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
  /** Other words people search for this page by. */
  keywords?: string;
};

export type NavGroup = { group: string; icon: IconName; items: NavItem[] };

const SETTINGS_ACCESS: Permission[] = [
  "school:update",
  "school:billing",
  "fees:manage",
  "admissions:manage",
  "staff:leave",
  "expenses:payroll",
  "operations:discipline",
  "operations:library",
  "operations:inventory",
  "operations:health",
  "operations:transport",
];

/** Top-level links, and groups that open to show their pages. */
export const NAV: (NavItem | NavGroup)[] = [
  { href: "", label: "Overview", icon: "grid", keywords: "home dashboard today analytics" },
  { href: "/students", label: "Students", icon: "graduation", anyOf: ["students:view"], staffOnly: true, keywords: "pupils learners logins promote" },
  { href: "/admissions", label: "Admissions", icon: "userPlus", anyOf: ["admissions:view"], feature: "admissions", staffOnly: true, keywords: "applicants apply entrance exam offer enrol" },
  {
    group: "Academics",
    icon: "bookOpen",
    items: [
      { href: "/attendance", label: "Attendance", icon: "calendarCheck", anyOf: ["attendance:take", "attendance:edit_past", "attendance:report"], feature: "attendance", staffOnly: true, keywords: "register roll call absent" },
      { href: "/results", label: "Results", icon: "results", anyOf: ["results:enter", "results:view"], feature: "score_entry", staffOnly: true, keywords: "scores report cards broadsheet grades pins" },
      { href: "/timetable", label: "Timetable", icon: "clock", feature: "timetable", staffOnly: true, keywords: "periods schedule" },
      { href: "/academics", label: "Classes & subjects", icon: "bookOpen", anyOf: ["academics:view"], staffOnly: true, keywords: "academics sessions terms arms" },
    ],
  },
  {
    group: "Teaching",
    icon: "clipboard",
    items: [
      { href: "/assignments", label: "Assignments", icon: "clipboard", anyOf: ["teaching:lessons"], feature: "assignments", staffOnly: true, keywords: "homework" },
      { href: "/cbt", label: "CBT exams", icon: "monitor", anyOf: ["teaching:cbt"], feature: "cbt", staffOnly: true, keywords: "computer test questions" },
      { href: "/materials", label: "Materials", icon: "layers", anyOf: ["teaching:lessons"], feature: "lms", staffOnly: true, keywords: "lms notes videos resources" },
      { href: "/lesson-notes", label: "Lesson notes", icon: "book", anyOf: ["teaching:lessons", "teaching:review"], feature: "assignments", staffOnly: true, keywords: "scheme of work plans" },
    ],
  },
  {
    group: "Student life",
    icon: "star",
    items: [
      { href: "/discipline", label: "Behaviour", icon: "star", feature: "discipline", staffOnly: true, keywords: "discipline merits incidents conduct" },
      { href: "/library", label: "Library", icon: "library", anyOf: ["operations:library"], feature: "library", staffOnly: true, keywords: "books loans isbn" },
      { href: "/transport", label: "Transport", icon: "bus", anyOf: ["operations:transport"], feature: "transport", staffOnly: true, keywords: "bus buses routes drivers pick-up" },
      { href: "/sick-bay", label: "Sick bay", icon: "health", anyOf: ["operations:health"], feature: "health", staffOnly: true, keywords: "health nurse clinic medical allergies" },
    ],
  },
  {
    group: "Communication",
    icon: "bell",
    items: [
      { href: "/announcements", label: "Announcements", icon: "bell", feature: "announcements", staffOnly: true, keywords: "news notice sms broadcast" },
      { href: "/calendar", label: "Calendar", icon: "calendar", feature: "announcements", staffOnly: true, keywords: "events holidays dates" },
      { href: "/messages", label: "Messages", icon: "chat", anyOf: ["comms:message"], feature: "messaging", staffOnly: true, keywords: "chat parents inbox" },
    ],
  },
  {
    group: "Finance",
    icon: "wallet",
    items: [
      { href: "/fees", label: "Fees", icon: "wallet", anyOf: ["fees:view"], feature: "fees_basic", staffOnly: true, keywords: "invoices payments debtors receipts" },
      { href: "/expenses", label: "Expenses", icon: "receipt", anyOf: ["expenses:view"], feature: "expenses", staffOnly: true, keywords: "spending costs" },
      { href: "/payroll", label: "Payroll", icon: "banknote", anyOf: ["expenses:payroll"], feature: "payroll", staffOnly: true, keywords: "salary salaries payslips paye pension" },
    ],
  },
  {
    group: "Administration",
    icon: "settings",
    items: [
      { href: "/staff", label: "Staff", icon: "users", anyOf: ["staff:view"], staffOnly: true, keywords: "teachers employees invite" },
      { href: "/hr", label: "Attendance & leave", icon: "userCheck", feature: "staff_attendance", staffOnly: true, keywords: "clock in leave hr my day payslips" },
      { href: "/inventory", label: "Inventory", icon: "box", anyOf: ["operations:inventory"], feature: "inventory", staffOnly: true, keywords: "store stock assets equipment" },
      { href: "/roles", label: "Roles & permissions", icon: "shield", anyOf: ["roles:view"], staffOnly: true, keywords: "access" },
      { href: "/audit", label: "Audit log", icon: "history", anyOf: ["audit:view"], feature: "audit_log", staffOnly: true, keywords: "history activity" },
      { href: "/settings", label: "Settings", icon: "settings", anyOf: SETTINGS_ACCESS, staffOnly: true, keywords: "school profile configuration" },
    ],
  },
];

export type ResolvedNavItem = { href: string; label: string; icon: IconName; locked: boolean; badge?: number; keywords?: string; group?: string };
export type ResolvedNavGroup = { group: string; icon: IconName; items: ResolvedNavItem[] };
export type ResolvedNav = (ResolvedNavItem | ResolvedNavGroup)[];

export function isGroup(e: ResolvedNavItem | ResolvedNavGroup): e is ResolvedNavGroup {
  return "group" in e && "items" in e;
}

export function resolveNav(slug: string, ctx: { permissions: Set<Permission>; features: Set<string>; isStaff: boolean; badges?: Record<string, number> }): ResolvedNav {
  const resolve = (i: NavItem, group?: string): ResolvedNavItem | null =>
    (!i.staffOnly || ctx.isStaff) && (!i.anyOf || i.anyOf.some((p) => ctx.permissions.has(p)))
      ? { href: `/s/${slug}${i.href}`, label: i.label, icon: i.icon, locked: !!i.feature && !ctx.features.has(i.feature), badge: ctx.badges?.[i.href], keywords: i.keywords, group }
      : null;
  const out: ResolvedNav = [];
  for (const entry of NAV) {
    if ("group" in entry) {
      const items = entry.items.map((i) => resolve(i, entry.group)).filter((i): i is ResolvedNavItem => i !== null);
      // A group with one page shows that page on its own.
      if (items.length === 1) out.push({ ...items[0], group: undefined });
      else if (items.length) out.push({ group: entry.group, icon: entry.icon, items });
    } else {
      const item = resolve(entry);
      if (item) out.push(item);
    }
  }
  return out;
}

/** Every page in the menu, flattened, for search. */
export function flattenNav(nav: ResolvedNav): ResolvedNavItem[] {
  return nav.flatMap((e) => (isGroup(e) ? e.items : [e]));
}
