export const FEATURES = {
  core_records: "School setup, students and staff",
  bulk_import: "Excel import",
  custom_roles: "Custom roles",
  attendance: "Daily attendance",
  score_entry: "Score entry and grading",
  report_cards: "Report cards",
  report_cards_unbranded: "Report cards without watermark",
  result_workflow: "Result approval and checker PINs",
  timetable: "Timetable",
  assignments: "Assignments and lesson notes",
  cbt: "CBT exams",
  lms: "Learning materials",
  analytics: "Performance analytics",
  fees_basic: "Fee structures and invoices",
  fees_online: "Online fee payment",
  debtors: "Debtors and reminders",
  expenses: "Expenses and income statement",
  payroll: "Payroll",
  announcements: "Announcements and calendar",
  parent_portal: "Parent portal",
  messaging: "In-app messaging",
  sms: "SMS and WhatsApp alerts",
  admissions: "Online admissions",
  discipline: "Discipline log",
  staff_attendance: "Staff attendance and leave",
  library: "Library",
  inventory: "Inventory",
  health: "Sick bay",
  transport: "Transport",
  hostel: "Hostel",
  documents: "ID cards, certificates, transcripts",
  branding: "School branding",
  brand_theme: "School colours and theme",
  audit_log: "Audit log",
  multi_campus: "Multi-campus",
  custom_domain: "Custom domain and white-label",
  api_access: "API access",
  sso: "Single sign-on",
  ai: "AI helpers and Kola",
} as const;

export type FeatureKey = keyof typeof FEATURES;

export const LIMITS = {
  students: "Students",
  staff: "Staff accounts",
  audit_days: "Audit log history (days)",
} as const;

export type LimitKey = keyof typeof LIMITS;

export type PlanKey = "free" | "basic" | "standard" | "premium" | "enterprise";

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  pricePerStudentKobo: number | null;
  features: FeatureKey[];
  limits: Partial<Record<LimitKey, number>>;
  sort: number;
};

const FREE: FeatureKey[] = ["core_records", "bulk_import", "attendance", "score_entry", "report_cards", "announcements"];
const BASIC: FeatureKey[] = [
  ...FREE,
  "report_cards_unbranded",
  "result_workflow",
  "timetable",
  "fees_basic",
  "parent_portal",
  "discipline",
  "branding",
];
const STANDARD: FeatureKey[] = [
  ...BASIC,
  "assignments",
  "cbt",
  "fees_online",
  "debtors",
  "messaging",
  "sms",
  "admissions",
  "staff_attendance",
  "audit_log",
  "ai",
];
const PREMIUM: FeatureKey[] = [
  ...STANDARD,
  "custom_roles",
  "lms",
  "analytics",
  "expenses",
  "payroll",
  "library",
  "inventory",
  "health",
  "transport",
  "hostel",
  "documents",
  "brand_theme",
];
const ENTERPRISE: FeatureKey[] = [...PREMIUM, "multi_campus", "custom_domain", "api_access", "sso"];

export const DEFAULT_PLANS: PlanDefinition[] = [
  { key: "free", name: "Free", pricePerStudentKobo: 0, features: FREE, limits: { students: 50, staff: 5, audit_days: 0 }, sort: 0 },
  { key: "basic", name: "Basic", pricePerStudentKobo: 60_000, features: BASIC, limits: { audit_days: 0 }, sort: 1 },
  { key: "standard", name: "Standard", pricePerStudentKobo: 120_000, features: STANDARD, limits: { audit_days: 30 }, sort: 2 },
  { key: "premium", name: "Premium", pricePerStudentKobo: 180_000, features: PREMIUM, limits: { audit_days: 365 }, sort: 3 },
  { key: "enterprise", name: "Enterprise", pricePerStudentKobo: null, features: ENTERPRISE, limits: {}, sort: 4 },
];

export function cheapestPlanWith(feature: FeatureKey, plans: PlanDefinition[] = DEFAULT_PLANS): PlanDefinition | undefined {
  return [...plans].sort((a, b) => a.sort - b.sort).find((p) => p.features.includes(feature));
}
