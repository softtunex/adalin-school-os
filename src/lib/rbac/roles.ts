import { ALL_PERMISSIONS, type Permission } from "./permissions";

export type SystemRoleKey =
  | "owner"
  | "principal"
  | "admin"
  | "bursar"
  | "class_teacher"
  | "subject_teacher"
  | "librarian"
  | "nurse"
  | "transport_officer"
  | "hostel_warden"
  | "storekeeper"
  | "parent"
  | "student";

export type RoleKind = "staff" | "portal";

export type SystemRole = {
  key: SystemRoleKey;
  name: string;
  description: string;
  kind: RoleKind;
  permissions: readonly Permission[];
};

const ACADEMIC_VIEW: Permission[] = ["school:view", "academics:view", "students:view", "attendance:view", "results:view"];

export const SYSTEM_ROLES: readonly SystemRole[] = [
  {
    key: "owner",
    name: "Proprietor",
    description: "School owner. Full access, including plan and billing.",
    kind: "staff",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "principal",
    name: "Principal",
    description: "Runs academics and staff. Approves and publishes results.",
    kind: "staff",
    permissions: ALL_PERMISSIONS.filter(
      (p) => !["school:billing", "school:export", "school:api", "school:sso", "fees:refund", "expenses:payroll", "comms:credits", "roles:manage"].includes(p),
    ),
  },
  {
    key: "admin",
    name: "School admin",
    description: "Front office. Admissions, records, classes and timetable.",
    kind: "staff",
    permissions: [
      "school:view",
      "school:update",
      "staff:view",
      "staff:invite",
      "staff:update",
      "staff:attendance",
      "staff:leave",
      "documents:issue",
      "documents:templates",
      "roles:view",
      "academics:view",
      "academics:manage",
      "students:view",
      "students:create",
      "students:update",
      "students:deactivate",
      "students:import",
      "students:export",
      "students:promote",
      "students:view_medical",
      "attendance:view",
      "attendance:edit_past",
      "attendance:report",
      "results:view",
      "results:pins",
      "comms:announce",
      "comms:message",
      "comms:sms",
      "teaching:timetable",
      "admissions:view",
      "admissions:manage",
      "admissions:enroll",
      "operations:discipline",
    ],
  },
  {
    key: "bursar",
    name: "Bursar",
    description: "Fees, payments, expenses and payroll. No access to results.",
    kind: "staff",
    permissions: [
      "school:view",
      "students:view",
      "students:export",
      "fees:view",
      "fees:manage",
      "fees:invoice",
      "fees:record_payment",
      "fees:discount",
      "fees:refund",
      "fees:report",
      "expenses:view",
      "expenses:create",
      "expenses:payroll",
      "operations:inventory",
      "comms:message",
    ],
  },
  {
    key: "class_teacher",
    name: "Class teacher",
    description: "Form teacher. Attendance, conduct and report card comments for their class.",
    kind: "staff",
    permissions: [
      ...ACADEMIC_VIEW,
      "attendance:take",
      "attendance:report",
      "results:enter",
      "results:submit",
      "results:review",
      "results:comment",
      "comms:message",
      "teaching:lessons",
      "teaching:cbt",
      "operations:discipline",
    ],
  },
  {
    key: "subject_teacher",
    name: "Subject teacher",
    description: "Enters scores and teaching material for the subjects they teach.",
    kind: "staff",
    permissions: [...ACADEMIC_VIEW, "results:enter", "results:submit", "comms:message", "teaching:lessons", "teaching:cbt"],
  },
  {
    key: "librarian",
    name: "Librarian",
    description: "Runs the library only.",
    kind: "staff",
    permissions: ["school:view", "students:view", "operations:library"],
  },
  {
    key: "nurse",
    name: "School nurse",
    description: "Runs the sick bay only.",
    kind: "staff",
    permissions: ["school:view", "students:view", "students:view_medical", "operations:health"],
  },
  {
    key: "transport_officer",
    name: "Transport officer",
    description: "Runs routes and buses only.",
    kind: "staff",
    permissions: ["school:view", "students:view", "operations:transport"],
  },
  {
    key: "hostel_warden",
    name: "Hostel warden",
    description: "Runs boarding only.",
    kind: "staff",
    permissions: ["school:view", "students:view", "operations:hostel"],
  },
  {
    key: "storekeeper",
    name: "Storekeeper",
    description: "Store and assets. Stock in and out, assigning items to staff and rooms.",
    kind: "staff",
    permissions: ["school:view", "operations:inventory"],
  },
  {
    key: "parent",
    name: "Parent",
    description: "Sees only their own children.",
    kind: "portal",
    permissions: ["school:view", "comms:message"],
  },
  {
    key: "student",
    name: "Student",
    description: "Sees only their own records.",
    kind: "portal",
    permissions: ["school:view"],
  },
];

const BY_KEY = new Map(SYSTEM_ROLES.map((r) => [r.key, r]));

export function getSystemRole(key: string): SystemRole | undefined {
  return BY_KEY.get(key as SystemRoleKey);
}

export const STAFF_ROLES = SYSTEM_ROLES.filter((r) => r.kind === "staff");
