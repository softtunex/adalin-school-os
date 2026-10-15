export const PERMISSION_GROUPS = {
  school: {
    label: "School",
    actions: { view: "View school profile", update: "Edit school profile", billing: "Manage plan and billing" },
  },
  staff: {
    label: "Staff",
    actions: {
      view: "View staff",
      invite: "Invite staff",
      update: "Edit staff",
      deactivate: "Deactivate staff",
      assign_roles: "Assign roles",
    },
  },
  roles: {
    label: "Roles",
    actions: { view: "View roles", manage: "Create and edit custom roles" },
  },
  academics: {
    label: "Academic setup",
    actions: { view: "View sessions, classes and subjects", manage: "Manage sessions, classes and subjects" },
  },
  students: {
    label: "Students",
    actions: {
      view: "View students",
      create: "Add students",
      update: "Edit students",
      deactivate: "Withdraw students",
      import: "Import students",
      export: "Export students",
      promote: "Promote students",
      view_medical: "View medical notes",
    },
  },
  attendance: {
    label: "Attendance",
    actions: { view: "View attendance", take: "Take attendance", edit_past: "Edit past attendance", report: "Attendance reports" },
  },
  results: {
    label: "Results",
    actions: {
      view: "View results",
      enter: "Enter scores",
      submit: "Submit scores",
      review: "Review results",
      approve: "Approve results",
      publish: "Publish results",
      unlock: "Unlock published results",
      comment: "Write report card comments",
      pins: "Manage result checker PINs",
    },
  },
  fees: {
    label: "Fees",
    actions: {
      view: "View fees",
      manage: "Manage fee structures",
      invoice: "Raise invoices",
      record_payment: "Record payments",
      discount: "Grant discounts",
      refund: "Refund payments",
      report: "Financial reports",
    },
  },
  expenses: {
    label: "Expenses & payroll",
    actions: { view: "View expenses", create: "Record expenses", approve: "Approve expenses", payroll: "Run payroll" },
  },
  comms: {
    label: "Communication",
    actions: { announce: "Post announcements", message: "Send messages", sms: "Send SMS and WhatsApp", credits: "Buy message credits" },
  },
  teaching: {
    label: "Teaching",
    actions: { timetable: "Manage timetable", lessons: "Lesson notes and assignments", cbt: "Create CBT exams" },
  },
  admissions: {
    label: "Admissions",
    actions: { view: "View applicants", manage: "Manage applicants", enroll: "Enroll applicants" },
  },
  operations: {
    label: "Operations",
    actions: {
      discipline: "Discipline log",
      library: "Library",
      inventory: "Inventory",
      health: "Sick bay",
      transport: "Transport",
      hostel: "Hostel",
    },
  },
  audit: {
    label: "Audit",
    actions: { view: "View audit log" },
  },
} as const;

type Groups = typeof PERMISSION_GROUPS;
export type Permission = {
  [G in keyof Groups]: `${G & string}:${keyof Groups[G]["actions"] & string}`;
}[keyof Groups];

export const ALL_PERMISSIONS: Permission[] = Object.entries(PERMISSION_GROUPS).flatMap(([group, def]) =>
  Object.keys(def.actions).map((action) => `${group}:${action}` as Permission),
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export function permissionLabel(p: Permission): string {
  const [group, action] = p.split(":") as [keyof Groups, string];
  const actions = PERMISSION_GROUPS[group].actions as Record<string, string>;
  return actions[action];
}
