import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  numeric,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const schoolId = () => uuid("school_id").notNull().references(() => schools.id, { onDelete: "cascade" });

/** Money is stored in kobo as a bigint, read back as a JS number (safe to ₦90 trillion). */
const kobo = (name: string) => bigint(name, { mode: "number" });

export type FeeSettings = {
  /** Parents with an unpaid balance can't check that term's result online. */
  withholdResults?: boolean;
  /** Email debtors a reminder every `reminderEveryDays` days. */
  autoReminders?: boolean;
  reminderEveryDays?: number;
  /** Shown on invoices for bank transfers, and where Paystack settles online payments. */
  bank?: { name: string; code?: string; accountNumber: string; accountName: string };
  /** Free text printed at the bottom of invoices, e.g. "Fees are not refundable." */
  invoiceNote?: string;
};

/** How a parent wants to hear from schools. Missing keys mean the default (on). */
export type NotifyPrefs = { sms?: boolean; whatsapp?: boolean; email?: boolean };

export type CommsSettings = {
  /** Up to 11 characters, registered with Termii. Falls back to the platform sender. */
  senderId?: string;
  absenceAlerts?: boolean;
  resultAlerts?: boolean;
  paymentAlerts?: boolean;
  /** Also send alerts by SMS (uses credits), not just in-app and email. */
  smsAlerts?: boolean;
  /** Parents can start conversations with staff. */
  parentMessaging?: boolean;
  /** Parents can only send messages between these times (Lagos), e.g. "07:00" to "18:00". */
  messagingHours?: { start: string; end: string };
  /** Students can see their own published results in the student portal. */
  studentResults?: boolean;
};

export type AdmissionSettings = {
  open?: boolean;
  /** Class levels taking applications; all when empty. */
  levelIds?: string[];
  feeKobo?: number;
  intro?: string;
  /** Entrance exam date, venue and what to bring, shown to applicants. */
  examInfo?: string;
  /** How applicants are assessed: entrance exam, interview, both, or neither (straight to an offer). */
  assessment?: Assessment;
};

/** Staff day and leave rules. Times are Lagos "HH:MM". */
export type HrSettings = {
  resumeAt?: string;
  lateAfter?: string;
  closeAt?: string;
  /** ISO weekdays staff work, 1 = Monday. */
  workDays?: number[];
  /** Days a year per kind of leave. */
  allowances?: Partial<Record<LeaveKind, number>>;
};

export type PayrollSettings = {
  /** Day of the month salaries are paid. */
  payDay?: number;
  /** Defaults for new pay profiles. */
  paye?: boolean;
  pension?: boolean;
  nhf?: boolean;
  /** Record each paid run in Expenses as "Salaries and wages". */
  recordExpense?: boolean;
};

export type LibrarySettings = {
  loanDays?: number;
  maxLoans?: number;
  finePerDayKobo?: number;
};

export type Signatory = { name: string; title: string; signatureUrl?: string | null };

export type DocumentSettings = {
  /** Up to three people who sign testimonials, certificates and transcripts. Letters carry the first. */
  signatories?: Signatory[];
  /** Before several signatories: the one person who signed. Read as the first signatory. */
  signatoryName?: string;
  signatoryTitle?: string;
  /** Printed on the back line of ID cards, e.g. "If found, please return to the school." */
  cardNote?: string;
};

export type HostelSettings = {
  /** Parents can ask for an exeat in the app. */
  parentRequests?: boolean;
  /** Tell parents when their child signs out of school and back in. */
  notifyMovements?: boolean;
};

export type TransportSettings = {
  /** Tell parents when their child is marked on the bus. */
  notifyBoarding?: boolean;
};

export type HealthSettings = {
  /** Medicines the sick bay keeps, offered when recording a visit. */
  medicines?: string[];
  /** Which visits parents hear about when the student leaves the sick bay. */
  notifyParents?: "every" | "serious" | "none";
};

export type InventorySettings = {
  categories?: string[];
  /** Rooms and places items can be assigned to. */
  locations?: string[];
  /** Book stock bought with a cost as a pending expense for approval. */
  recordPurchases?: boolean;
};

export type DisciplineSettings = {
  meritCategories?: string[];
  incidentCategories?: string[];
  /** Which incidents parents hear about automatically. */
  notifyIncidents?: "serious" | "moderate" | "all" | "none";
  /** Tell parents about merits too. */
  notifyMerits?: boolean;
};

/** A named amount on a payslip: an allowance, a deduction, a bonus. */
export type PayLine = { name: string; kobo: number };

export const LEAVE_KINDS = ["annual", "sick", "casual", "maternity", "paternity", "compassionate", "study", "unpaid"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

export type Assessment = "exam" | "interview" | "both" | "none";

// ---------- Platform (no row-level security: accessed by the app's owner role) ----------

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    lastSchoolId: uuid("last_school_id"),
    notifyPrefs: jsonb("notify_prefs").$type<NotifyPrefs>().notNull().default({}),
    /** Student logins: "<school slug>/<admission no>", lower case. Staff and parents use email or phone. */
    username: text("username"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    uniqueIndex("users_phone_uq").on(t.phone),
    uniqueIndex("users_username_uq").on(t.username),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** How they signed in: password, google or microsoft. Schools can require single sign-on. */
    method: text("method").notNull().default("password"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** A Google or Microsoft account connected to a School OS login. */
export const ssoIdentities = pgTable(
  "sso_identities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["google", "microsoft"] }).notNull(),
    /** The provider's permanent id for the person. Never the email, which can change. */
    subject: text("subject").notNull(),
    email: text("email"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sso_identities_subject_uq").on(t.provider, t.subject), index("sso_identities_user_idx").on(t.userId)],
);

export const passwordResets = pgTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    key: text("key").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.createdAt)],
);

/** One-time codes for passwordless parent login, by phone or email. Only a hash is stored. */
export const loginCodes = pgTable(
  "login_codes",
  {
    id: id(),
    destination: text("destination").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("login_codes_destination_idx").on(t.destination, t.createdAt)],
);

export const plans = pgTable("plans", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  pricePerStudentKobo: integer("price_per_student_kobo"),
  features: jsonb("features").$type<string[]>().notNull(),
  limits: jsonb("limits").$type<Record<string, number>>().notNull(),
  sort: integer("sort").notNull(),
});

export const schools = pgTable(
  "schools",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    planKey: text("plan_key")
      .notNull()
      .references(() => plans.key),
    status: text("status", { enum: ["active", "suspended", "read_only"] })
      .notNull()
      .default("active"),
    schoolType: text("school_type", { enum: ["nursery", "primary", "secondary", "combined"] }),
    curriculum: text("curriculum", { enum: ["nigerian", "british", "american", "montessori", "mixed"] }),
    motto: text("motto"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull().default("Nigeria"),
    logoUrl: text("logo_url"),
    /** The school's own colour on documents and its pages (Premium). Null keeps School OS orange. */
    brandColor: text("brand_color"),
    // ---------- Our billing ----------
    /** The plan to return to when a free trial ends. Null when not on trial. */
    trialReturnPlanKey: text("trial_return_plan_key"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    /** A school gets one free trial. */
    trialUsed: boolean("trial_used").notNull().default(false),
    /** A cheaper plan chosen mid-term, which starts with the next term's bill. */
    pendingPlanKey: text("pending_plan_key"),
    /** Set by the platform when a school is read-only for an unpaid bill (cleared on payment). */
    readOnlySince: timestamp("read_only_since", { withTimezone: true }),
    /** Features on top of the plan: add-ons the school pays for, plus anything Adalin grants. Kept in step by syncExtraFeatures. */
    extraFeatures: jsonb("extra_features").$type<string[]>().notNull().default([]),
    /** Granted by Adalin in the admin console (a pilot, a favour, a custom deal). */
    adminGrants: jsonb("admin_grants").$type<string[]>().notNull().default([]),
    /** Switched off by Adalin for this school, even if the plan includes them. */
    adminBlocks: jsonb("admin_blocks").$type<string[]>().notNull().default([]),
    /** Adalin's private notes on the school (deals, contacts, history). Never shown to the school. */
    adminNote: text("admin_note"),
    onboarding: jsonb("onboarding").$type<Record<string, boolean>>().notNull().default({}),
    admissionPrefix: text("admission_prefix"),
    nextAdmissionSeq: integer("next_admission_seq").notNull().default(1),
    nextInvoiceSeq: integer("next_invoice_seq").notNull().default(1),
    nextReceiptSeq: integer("next_receipt_seq").notNull().default(1),
    feeSettings: jsonb("fee_settings").$type<FeeSettings>().notNull().default({}),
    paystackSubaccount: text("paystack_subaccount"),
    commsSettings: jsonb("comms_settings").$type<CommsSettings>().notNull().default({}),
    admissionSettings: jsonb("admission_settings").$type<AdmissionSettings>().notNull().default({}),
    hrSettings: jsonb("hr_settings").$type<HrSettings>().notNull().default({}),
    payrollSettings: jsonb("payroll_settings").$type<PayrollSettings>().notNull().default({}),
    disciplineSettings: jsonb("discipline_settings").$type<DisciplineSettings>().notNull().default({}),
    librarySettings: jsonb("library_settings").$type<LibrarySettings>().notNull().default({}),
    inventorySettings: jsonb("inventory_settings").$type<InventorySettings>().notNull().default({}),
    healthSettings: jsonb("health_settings").$type<HealthSettings>().notNull().default({}),
    transportSettings: jsonb("transport_settings").$type<TransportSettings>().notNull().default({}),
    hostelSettings: jsonb("hostel_settings").$type<HostelSettings>().notNull().default({}),
    /** Single sign-on rules for staff (Enterprise). */
    ssoSettings: jsonb("sso_settings").$type<{ required?: boolean; providers?: ("google" | "microsoft")[] }>().notNull().default({}),
    documentSettings: jsonb("document_settings").$type<DocumentSettings>().notNull().default({}),
    nextApplicantSeq: integer("next_applicant_seq").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("schools_slug_uq").on(t.slug)],
);

// ---------- Tenant tables (row-level security on school_id) ----------

export const roles = pgTable(
  "roles",
  {
    id: id(),
    schoolId: schoolId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind", { enum: ["staff", "portal"] }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("roles_school_key_uq").on(t.schoolId, t.key)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    schoolId: schoolId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "support" is Adalin support's temporary access; staff lists only ever show "active". */
    status: text("status", { enum: ["active", "deactivated", "support"] })
      .notNull()
      .default("active"),
    jobTitle: text("job_title"),
    /** Adalin support's temporary access, given by the school. Ends at this time. Null for real staff. */
    supportUntil: timestamp("support_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_school_user_uq").on(t.schoolId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    schoolId: schoolId(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.roleId] })],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    roleIds: jsonb("role_ids").$type<string[]>().notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invitations_token_uq").on(t.tokenHash), index("invitations_school_idx").on(t.schoolId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    schoolId: schoolId(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_school_time_idx").on(t.schoolId, t.createdAt)],
);

// ---------- Academic structure ----------

export const academicSessions = pgTable(
  "academic_sessions",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_school_name_uq").on(t.schoolId, t.name)],
);

export const terms = pgTable(
  "terms",
  {
    id: id(),
    schoolId: schoolId(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    number: integer("number").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("terms_session_number_uq").on(t.sessionId, t.number)],
);

import { SECTIONS, type Section } from "../academics/sections";
export { SECTIONS, type Section };

export const classLevels = pgTable(
  "class_levels",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    section: text("section", { enum: SECTIONS }).notNull(),
    sort: integer("sort").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("levels_school_name_uq").on(t.schoolId, t.name)],
);

export const classes = pgTable(
  "classes",
  {
    id: id(),
    schoolId: schoolId(),
    levelId: uuid("level_id")
      .notNull()
      .references(() => classLevels.id, { onDelete: "cascade" }),
    arm: text("arm"),
    name: text("name").notNull(),
    classTeacherId: uuid("class_teacher_id").references(() => memberships.id, { onDelete: "set null" }),
    capacity: integer("capacity"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("classes_school_name_uq").on(t.schoolId, t.name), index("classes_level_idx").on(t.levelId)],
);

export const subjects = pgTable(
  "subjects",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    code: text("code"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("subjects_school_name_uq").on(t.schoolId, t.name)],
);

export const levelSubjects = pgTable(
  "level_subjects",
  {
    schoolId: schoolId(),
    levelId: uuid("level_id")
      .notNull()
      .references(() => classLevels.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    isElective: boolean("is_elective").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.levelId, t.subjectId] })],
);

export const teacherAssignments = pgTable(
  "teacher_assignments",
  {
    id: id(),
    schoolId: schoolId(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("assignments_class_subject_uq").on(t.classId, t.subjectId), index("assignments_member_idx").on(t.membershipId)],
);

// ---------- People ----------

export const STUDENT_STATUSES = ["active", "graduated", "withdrawn", "suspended"] as const;

export const students = pgTable(
  "students",
  {
    id: id(),
    schoolId: schoolId(),
    admissionNo: text("admission_no").notNull(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    gender: text("gender", { enum: ["male", "female"] }).notNull(),
    dateOfBirth: date("date_of_birth"),
    admittedOn: date("admitted_on"),
    status: text("status", { enum: STUDENT_STATUSES }).notNull().default("active"),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    stateOfOrigin: text("state_of_origin"),
    lga: text("lga"),
    religion: text("religion"),
    bloodGroup: text("blood_group"),
    genotype: text("genotype"),
    address: text("address"),
    medicalNotes: text("medical_notes"),
    photoUrl: text("photo_url"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("students_school_admission_uq").on(t.schoolId, t.admissionNo),
    index("students_class_idx").on(t.classId),
    index("students_school_status_idx").on(t.schoolId, t.status),
  ],
);

export const guardians = pgTable(
  "guardians",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    occupation: text("occupation"),
    address: text("address"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("guardians_school_phone_uq").on(t.schoolId, t.phone)],
);

export const studentGuardians = pgTable(
  "student_guardians",
  {
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull().default("Parent"),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.guardianId] }), index("student_guardians_guardian_idx").on(t.guardianId)],
);

export const ENROLLMENT_OUTCOMES = ["current", "promoted", "repeated", "graduated", "withdrawn", "transferred"] as const;

export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    outcome: text("outcome", { enum: ENROLLMENT_OUTCOMES }).notNull().default("current"),
    createdAt: createdAt(),
  },
  (t) => [index("enrollments_student_idx").on(t.studentId), index("enrollments_session_class_idx").on(t.sessionId, t.classId)],
);

/** Elective subjects a student takes. Compulsory subjects for their level apply automatically. */
export const studentSubjects = pgTable(
  "student_subjects",
  {
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.subjectId] }), index("student_subjects_subject_idx").on(t.subjectId)],
);

// ---------- Attendance ----------

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** One row per class per day once attendance has been taken. */
export const attendanceDays = pgTable(
  "attendance_days",
  {
    id: id(),
    schoolId: schoolId(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    termId: uuid("term_id").references(() => terms.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    takenBy: uuid("taken_by").references(() => memberships.id, { onDelete: "set null" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_days_class_date_uq").on(t.classId, t.date), index("attendance_days_term_idx").on(t.termId)],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    schoolId: schoolId(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => attendanceDays.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: text("status", { enum: ATTENDANCE_STATUSES }).notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("attendance_records_day_student_uq").on(t.dayId, t.studentId), index("attendance_records_student_idx").on(t.studentId)],
);

// ---------- Assessment configuration ----------

export const assessmentComponents = pgTable(
  "assessment_components",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    maxScore: integer("max_score").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("assessment_components_school_name_uq").on(t.schoolId, t.name)],
);

export const gradeBands = pgTable(
  "grade_bands",
  {
    id: id(),
    schoolId: schoolId(),
    grade: text("grade").notNull(),
    minScore: integer("min_score").notNull(),
    remark: text("remark").notNull().default(""),
    passes: boolean("passes").notNull().default(true),
  },
  (t) => [uniqueIndex("grade_bands_school_grade_uq").on(t.schoolId, t.grade)],
);

// ---------- Scores and results ----------

export const scores = pgTable(
  "scores",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => assessmentComponents.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2, mode: "number" }).notNull(),
    updatedBy: uuid("updated_by").references(() => memberships.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("scores_unique_uq").on(t.termId, t.studentId, t.subjectId, t.componentId),
    index("scores_sheet_idx").on(t.termId, t.classId, t.subjectId),
  ],
);

export const SHEET_STATUSES = ["draft", "submitted"] as const;

/** Per class + subject + term: whether the subject teacher has submitted their scores. */
export const scoreSheets = pgTable(
  "score_sheets",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    status: text("status", { enum: SHEET_STATUSES }).notNull().default("draft"),
    submittedBy: uuid("submitted_by").references(() => memberships.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("score_sheets_uq").on(t.termId, t.classId, t.subjectId)],
);

export const RESULT_STATUSES = ["open", "reviewed", "approved", "published"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/** Per class + term: where the class's results are in the approval workflow. */
export const classResults = pgTable(
  "class_results",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    status: text("status", { enum: RESULT_STATUSES }).notNull().default("open"),
    reviewedBy: uuid("reviewed_by").references(() => memberships.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => memberships.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    nextTermBegins: date("next_term_begins"),
  },
  (t) => [uniqueIndex("class_results_uq").on(t.termId, t.classId)],
);

/** Per student + term: comments and behaviour ratings for the report card. */
export const termReports = pgTable(
  "term_reports",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classTeacherComment: text("class_teacher_comment"),
    principalComment: text("principal_comment"),
    ratings: jsonb("ratings").$type<Record<string, number>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("term_reports_uq").on(t.termId, t.studentId)],
);

/** Result checker PINs, sold or issued to parents. Only a hash of the PIN is stored. */
export const resultPins = pgTable(
  "result_pins",
  {
    id: id(),
    schoolId: schoolId(),
    serial: text("serial").notNull(),
    pinHash: text("pin_hash").notNull(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    maxUses: integer("max_uses").notNull().default(5),
    uses: integer("uses").notNull().default(0),
    batch: text("batch").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("result_pins_school_serial_uq").on(t.schoolId, t.serial), uniqueIndex("result_pins_school_hash_uq").on(t.schoolId, t.pinHash)],
);

// ---------- Finance ----------

/** The school's catalogue of fee items, e.g. Tuition, Development levy, School bus. */
export const feeItems = pgTable(
  "fee_items",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    /** Optional items (bus, boarding) aren't added to term invoices automatically. */
    isOptional: boolean("is_optional").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fee_items_school_name_uq").on(t.schoolId, t.name)],
);

/** The fee structure: what each class level pays per item, per term. */
export const feeAmounts = pgTable(
  "fee_amounts",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => classLevels.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => feeItems.id, { onDelete: "cascade" }),
    amountKobo: kobo("amount_kobo").notNull(),
  },
  (t) => [uniqueIndex("fee_amounts_uq").on(t.termId, t.levelId, t.itemId)],
);

export const DISCOUNT_KINDS = ["percent", "fixed"] as const;

/** Discounts and scholarships, e.g. "Sibling discount 10%", "Staff child 50% of tuition". */
export const discountSchemes = pgTable(
  "discount_schemes",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    kind: text("kind", { enum: DISCOUNT_KINDS }).notNull(),
    /** Whole percent for "percent", kobo for "fixed". */
    value: kobo("value").notNull(),
    /** Applies to one item, or to all compulsory charges when null. */
    itemId: uuid("item_id").references(() => feeItems.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("discount_schemes_school_name_uq").on(t.schoolId, t.name)],
);

export const studentDiscounts = pgTable(
  "student_discounts",
  {
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => discountSchemes.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.schemeId] }), index("student_discounts_scheme_idx").on(t.schemeId)],
);

export const INVOICE_STATUSES = ["unpaid", "partial", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    schoolId: schoolId(),
    number: text("number").notNull(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    /** One "term" invoice per student per term; "other" for one-off charges. */
    kind: text("kind", { enum: ["term", "other"] }).notNull().default("term"),
    title: text("title").notNull(),
    dueOn: date("due_on"),
    // Kept in step with the lines and payments by refreshInvoice().
    chargesKobo: kobo("charges_kobo").notNull().default(0),
    discountKobo: kobo("discount_kobo").notNull().default(0),
    paidKobo: kobo("paid_kobo").notNull().default(0),
    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("unpaid"),
    payToken: text("pay_token").notNull(),
    issuedBy: uuid("issued_by").references(() => memberships.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_school_number_uq").on(t.schoolId, t.number),
    uniqueIndex("invoices_pay_token_uq").on(t.payToken),
    uniqueIndex("invoices_term_student_uq").on(t.termId, t.studentId).where(sql`kind = 'term' and status <> 'void'`),
    index("invoices_school_term_status_idx").on(t.schoolId, t.termId, t.status),
    index("invoices_student_idx").on(t.studentId),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    schoolId: schoolId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["charge", "discount"] }).notNull(),
    itemId: uuid("item_id").references(() => feeItems.id, { onDelete: "set null" }),
    schemeId: uuid("scheme_id").references(() => discountSchemes.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    /** Always positive; discounts are subtracted. */
    amountKobo: kobo("amount_kobo").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

export const PAYMENT_METHODS = ["cash", "transfer", "pos", "cheque", "paystack"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const payments = pgTable(
  "payments",
  {
    id: id(),
    schoolId: schoolId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    amountKobo: kobo("amount_kobo").notNull(),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    reference: text("reference"),
    receiptNo: text("receipt_no").notNull(),
    paidOn: date("paid_on").notNull(),
    status: text("status", { enum: ["succeeded", "reversed"] }).notNull().default("succeeded"),
    note: text("note"),
    payerName: text("payer_name"),
    recordedBy: uuid("recorded_by").references(() => memberships.id, { onDelete: "set null" }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: uuid("reversed_by").references(() => memberships.id, { onDelete: "set null" }),
    reversalReason: text("reversal_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_school_receipt_uq").on(t.schoolId, t.receiptNo),
    uniqueIndex("payments_online_reference_uq").on(t.schoolId, t.reference).where(sql`method = 'paystack'`),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_school_paid_on_idx").on(t.schoolId, t.paidOn),
  ],
);

/** An online payment started on the pay page, settled by the Paystack webhook or callback. */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: id(),
    schoolId: schoolId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    amountKobo: kobo("amount_kobo").notNull(),
    email: text("email").notNull(),
    status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull().default("pending"),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("payment_intents_reference_uq").on(t.reference)],
);

export const EXPENSE_CATEGORIES = [
  "Salaries and wages",
  "Utilities",
  "Diesel and fuel",
  "Repairs and maintenance",
  "Teaching materials",
  "Stationery and printing",
  "Transport",
  "Feeding",
  "Cleaning and sanitation",
  "Security",
  "Rent",
  "Taxes and levies",
  "Bank charges",
  "Events",
  "Other",
] as const;

export const EXPENSE_METHODS = ["cash", "transfer", "pos", "cheque"] as const;

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    schoolId: schoolId(),
    spentOn: date("spent_on").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amountKobo: kobo("amount_kobo").notNull(),
    method: text("method", { enum: EXPENSE_METHODS }).notNull(),
    vendor: text("vendor"),
    reference: text("reference"),
    receiptUrl: text("receipt_url"),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    recordedBy: uuid("recorded_by").references(() => memberships.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => memberships.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_school_spent_idx").on(t.schoolId, t.spentOn), index("expenses_school_status_idx").on(t.schoolId, t.status)],
);

// ---------- Communication ----------

export const AUDIENCES = ["everyone", "staff", "parents", "students", "classes"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const announcements = pgTable(
  "announcements",
  {
    id: id(),
    schoolId: schoolId(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    audience: text("audience", { enum: AUDIENCES }).notNull(),
    /** For audience "classes": parents of students in these classes, plus their class teachers. */
    classIds: jsonb("class_ids").$type<string[]>().notNull().default([]),
    pinned: boolean("pinned").notNull().default(false),
    /** Channels it was also pushed through, e.g. ["email", "sms"]. */
    channels: jsonb("channels").$type<string[]>().notNull().default([]),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("announcements_school_time_idx").on(t.schoolId, t.publishedAt)],
);

export const announcementReads = pgTable(
  "announcement_reads",
  {
    schoolId: schoolId(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.announcementId, t.userId] })],
);

export const EVENT_KINDS = ["event", "holiday", "exam", "meeting", "sports", "other"] as const;

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: id(),
    schoolId: schoolId(),
    title: text("title").notNull(),
    kind: text("kind", { enum: EVENT_KINDS }).notNull().default("event"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    details: text("details"),
    /** Hidden from parents when false (staff-only events such as INSET days). */
    forParents: boolean("for_parents").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("calendar_events_school_start_idx").on(t.schoolId, t.startsOn)],
);

/** A thread between a parent and staff, or between staff. Usually about one student. */
export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    schoolId: schoolId(),
    subject: text("subject").notNull(),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("conversations_school_last_idx").on(t.schoolId, t.lastMessageAt)],
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    schoolId: schoolId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["staff", "parent"] }).notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_participants_user_idx").on(t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    schoolId: schoolId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    senderName: text("sender_name").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_time_idx").on(t.conversationId, t.createdAt)],
);

/** The in-app notification centre. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    schoolId: schoolId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    /** Dedupe key, e.g. "absence:<student>:<date>", so re-saving never alerts twice. */
    ref: text("ref"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_time_idx").on(t.userId, t.createdAt), uniqueIndex("notifications_user_ref_uq").on(t.userId, t.ref)],
);

export const OUTBOUND_CHANNELS = ["sms", "whatsapp", "email"] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

/** Every SMS, WhatsApp and email the school sends, queued then delivered. */
export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: id(),
    schoolId: schoolId(),
    channel: text("channel", { enum: OUTBOUND_CHANNELS }).notNull(),
    to: text("to").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    kind: text("kind").notNull(),
    /** SMS pages charged against the school's credits. */
    credits: integer("credits").notNull().default(0),
    status: text("status", { enum: ["queued", "sent", "failed"] }).notNull().default("queued"),
    error: text("error"),
    providerRef: text("provider_ref"),
    ref: text("ref"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("outbound_school_time_idx").on(t.schoolId, t.createdAt), index("outbound_status_idx").on(t.status, t.createdAt)],
);

/** Messaging credits: purchases add, SMS sends subtract. The balance is the sum. */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id(),
    schoolId: schoolId(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    reference: text("reference"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("credit_ledger_school_idx").on(t.schoolId, t.createdAt), uniqueIndex("credit_ledger_reference_uq").on(t.schoolId, t.reference)],
);

// ---------- Files ----------

/** Private documents: homework, materials, admission papers. Served only through an access-checked route. */
export const files = pgTable(
  "files",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    ownerType: text("owner_type", { enum: ["assignment", "submission", "material", "lesson_note", "applicant"] }).notNull(),
    ownerId: uuid("owner_id"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("files_owner_idx").on(t.ownerType, t.ownerId)],
);

// ---------- Timetable ----------

export const bellSchedules = pgTable(
  "bell_schedules",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    /** ISO weekdays the schedule runs, 1 = Monday. */
    days: jsonb("days").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("bell_schedules_school_name_uq").on(t.schoolId, t.name)],
);

export const PERIOD_KINDS = ["lesson", "break", "assembly", "other"] as const;

export const bellPeriods = pgTable(
  "bell_periods",
  {
    id: id(),
    schoolId: schoolId(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => bellSchedules.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    kind: text("kind", { enum: PERIOD_KINDS }).notNull().default("lesson"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("bell_periods_schedule_idx").on(t.scheduleId)],
);

/** Which bell schedule a class level follows (nursery often runs a shorter day). Default schedule when absent. */
export const levelSchedules = pgTable(
  "level_schedules",
  {
    schoolId: schoolId(),
    levelId: uuid("level_id")
      .notNull()
      .references(() => classLevels.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => bellSchedules.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.levelId] })],
);

export const timetableSlots = pgTable(
  "timetable_slots",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => bellPeriods.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    teacherId: uuid("teacher_id").references(() => memberships.id, { onDelete: "set null" }),
    room: text("room"),
    note: text("note"),
  },
  (t) => [uniqueIndex("timetable_slot_uq").on(t.termId, t.classId, t.day, t.periodId), index("timetable_teacher_idx").on(t.termId, t.teacherId)],
);

// ---------- Assignments and lesson notes ----------

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructions: text("instructions").notNull().default(""),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    maxScore: integer("max_score"),
    /** CA column the grades are copied into, scaled to its maximum. */
    componentId: uuid("component_id").references(() => assessmentComponents.id, { onDelete: "set null" }),
    allowLate: boolean("allow_late").notNull().default(true),
    status: text("status", { enum: ["draft", "published", "closed"] }).notNull().default("published"),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("assignments_class_idx").on(t.classId, t.dueAt)],
);

export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: id(),
    schoolId: schoolId(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    late: boolean("late").notNull().default(false),
    score: numeric("score", { precision: 6, scale: 2, mode: "number" }),
    feedback: text("feedback"),
    gradedBy: uuid("graded_by").references(() => memberships.id, { onDelete: "set null" }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("assignment_submissions_uq").on(t.assignmentId, t.studentId)],
);

/** Scheme of work: the planned topic for each week of a term, per level and subject. */
export const schemeItems = pgTable(
  "scheme_items",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => classLevels.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    topic: text("topic").notNull(),
  },
  (t) => [uniqueIndex("scheme_items_uq").on(t.termId, t.levelId, t.subjectId, t.week)],
);

export const LESSON_NOTE_STATUSES = ["draft", "submitted", "approved", "returned"] as const;

export const lessonNotes = pgTable(
  "lesson_notes",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    levelId: uuid("level_id")
      .notNull()
      .references(() => classLevels.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    topic: text("topic").notNull(),
    objectives: text("objectives").notNull().default(""),
    content: text("content").notNull().default(""),
    status: text("status", { enum: LESSON_NOTE_STATUSES }).notNull().default("draft"),
    reviewComment: text("review_comment"),
    authorId: uuid("author_id").references(() => memberships.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => memberships.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lesson_notes_status_idx").on(t.schoolId, t.status), index("lesson_notes_author_idx").on(t.authorId)],
);

// ---------- CBT ----------

export const questions = pgTable(
  "questions",
  {
    id: id(),
    schoolId: schoolId(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    levelId: uuid("level_id").references(() => classLevels.id, { onDelete: "set null" }),
    topic: text("topic"),
    kind: text("kind", { enum: ["objective", "theory"] }).notNull(),
    body: text("body").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    /** Index of the correct option, for objective questions. */
    answer: integer("answer"),
    marks: numeric("marks", { precision: 5, scale: 2, mode: "number" }).notNull().default(1),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("questions_subject_idx").on(t.subjectId, t.levelId)],
);

export const exams = pgTable(
  "exams",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructions: text("instructions").notNull().default(""),
    durationMins: integer("duration_mins").notNull(),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    shuffle: boolean("shuffle").notNull().default(true),
    showScore: boolean("show_score").notNull().default(true),
    componentId: uuid("component_id").references(() => assessmentComponents.id, { onDelete: "set null" }),
    status: text("status", { enum: ["draft", "published", "closed"] }).notNull().default("draft"),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("exams_term_idx").on(t.termId, t.opensAt)],
);

export const examClasses = pgTable(
  "exam_classes",
  {
    schoolId: schoolId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.examId, t.classId] })],
);

export const examQuestions = pgTable(
  "exam_questions",
  {
    schoolId: schoolId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.examId, t.questionId] })],
);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: id(),
    schoolId: schoolId(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** The question order this student sees (shuffled per student). */
    order: jsonb("order").$type<{ q: string; o: number[] }[]>().notNull(),
    answers: jsonb("answers").$type<Record<string, number | string>>().notNull().default({}),
    objectiveScore: numeric("objective_score", { precision: 6, scale: 2, mode: "number" }),
    theoryScore: numeric("theory_score", { precision: 6, scale: 2, mode: "number" }),
    /** Marks the teacher gave each theory question. */
    theoryMarks: jsonb("theory_marks").$type<Record<string, number>>().notNull().default({}),
    status: text("status", { enum: ["in_progress", "submitted", "graded"] }).notNull().default("in_progress"),
    focusLosses: integer("focus_losses").notNull().default(0),
  },
  (t) => [uniqueIndex("exam_attempts_uq").on(t.examId, t.studentId)],
);

// ---------- Learning materials ----------

export const materials = pgTable(
  "materials",
  {
    id: id(),
    schoolId: schoolId(),
    levelId: uuid("level_id").references(() => classLevels.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind", { enum: ["file", "link", "note"] }).notNull(),
    url: text("url"),
    body: text("body"),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("materials_level_idx").on(t.levelId, t.subjectId)],
);

// ---------- Admissions ----------

export const APPLICANT_STATUSES = ["applied", "exam", "interview", "offered", "accepted", "enrolled", "rejected", "withdrawn"] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export const applicants = pgTable(
  "applicants",
  {
    id: id(),
    schoolId: schoolId(),
    ref: text("ref").notNull(),
    /** Secret key for the applicant's own status page. */
    token: text("token").notNull(),
    sessionId: uuid("session_id").references(() => academicSessions.id, { onDelete: "set null" }),
    levelId: uuid("level_id").references(() => classLevels.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    gender: text("gender", { enum: ["male", "female"] }).notNull(),
    dateOfBirth: date("date_of_birth"),
    previousSchool: text("previous_school"),
    guardianName: text("guardian_name").notNull(),
    guardianPhone: text("guardian_phone").notNull(),
    guardianEmail: text("guardian_email"),
    guardianRelationship: text("guardian_relationship").notNull().default("Parent"),
    address: text("address"),
    notes: text("notes"),
    status: text("status", { enum: APPLICANT_STATUSES }).notNull().default("applied"),
    examScore: numeric("exam_score", { precision: 6, scale: 2, mode: "number" }),
    interviewNotes: text("interview_notes"),
    feeKobo: bigint("fee_kobo", { mode: "number" }).notNull().default(0),
    feePaid: boolean("fee_paid").notNull().default(false),
    payReference: text("pay_reference"),
    offeredAt: timestamp("offered_at", { withTimezone: true }),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("applicants_school_ref_uq").on(t.schoolId, t.ref), uniqueIndex("applicants_token_uq").on(t.token), index("applicants_status_idx").on(t.schoolId, t.status)],
);

// ---------- Staff attendance and leave ----------

export const STAFF_DAY_STATUSES = ["present", "late", "absent", "leave"] as const;

export const staffAttendance = pgTable(
  "staff_attendance",
  {
    id: id(),
    schoolId: schoolId(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: text("status", { enum: STAFF_DAY_STATUSES }).notNull(),
    clockIn: timestamp("clock_in", { withTimezone: true }),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    /** "self" when the staff member clocked in; otherwise marked by a manager. */
    method: text("method", { enum: ["self", "manager"] }).notNull().default("self"),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => memberships.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("staff_attendance_member_date_uq").on(t.membershipId, t.date), index("staff_attendance_school_date_idx").on(t.schoolId, t.date)],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: id(),
    schoolId: schoolId(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: LEAVE_KINDS }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    /** Working days covered, counted on the school's workdays. */
    days: integer("days").notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => memberships.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
  },
  (t) => [index("leave_requests_member_idx").on(t.membershipId, t.startsOn), index("leave_requests_status_idx").on(t.schoolId, t.status)],
);

// ---------- Payroll ----------

export const staffPay = pgTable(
  "staff_pay",
  {
    id: id(),
    schoolId: schoolId(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    basicKobo: kobo("basic_kobo").notNull().default(0),
    /** Monthly allowances, e.g. housing, transport. */
    allowances: jsonb("allowances").$type<PayLine[]>().notNull().default([]),
    /** Monthly standing deductions, e.g. loan repayment, co-operative. */
    deductions: jsonb("deductions").$type<PayLine[]>().notNull().default([]),
    pension: boolean("pension").notNull().default(true),
    nhf: boolean("nhf").notNull().default(false),
    paye: boolean("paye").notNull().default(true),
    /** Yearly rent, for the rent relief in PAYE. */
    annualRentKobo: kobo("annual_rent_kobo").notNull().default(0),
    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    accountName: text("account_name"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("staff_pay_member_uq").on(t.membershipId)],
);

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: id(),
    schoolId: schoolId(),
    /** "YYYY-MM". */
    month: text("month").notNull(),
    status: text("status", { enum: ["draft", "approved", "paid"] }).notNull().default("draft"),
    grossKobo: kobo("gross_kobo").notNull().default(0),
    netKobo: kobo("net_kobo").notNull().default(0),
    payeKobo: kobo("paye_kobo").notNull().default(0),
    pensionKobo: kobo("pension_kobo").notNull().default(0),
    employerPensionKobo: kobo("employer_pension_kobo").notNull().default(0),
    nhfKobo: kobo("nhf_kobo").notNull().default(0),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => memberships.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payroll_runs_month_uq").on(t.schoolId, t.month)],
);

export const payslips = pgTable(
  "payslips",
  {
    id: id(),
    schoolId: schoolId(),
    runId: uuid("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    jobTitle: text("job_title"),
    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    accountName: text("account_name"),
    basicKobo: kobo("basic_kobo").notNull(),
    allowances: jsonb("allowances").$type<PayLine[]>().notNull().default([]),
    /** One-off earnings this month (bonus, overtime). */
    extras: jsonb("extras").$type<PayLine[]>().notNull().default([]),
    deductions: jsonb("deductions").$type<PayLine[]>().notNull().default([]),
    grossKobo: kobo("gross_kobo").notNull(),
    pensionKobo: kobo("pension_kobo").notNull().default(0),
    employerPensionKobo: kobo("employer_pension_kobo").notNull().default(0),
    nhfKobo: kobo("nhf_kobo").notNull().default(0),
    payeKobo: kobo("paye_kobo").notNull().default(0),
    netKobo: kobo("net_kobo").notNull(),
    settings: jsonb("settings").$type<{ pension: boolean; nhf: boolean; paye: boolean; annualRentKobo: number }>().notNull(),
  },
  (t) => [uniqueIndex("payslips_run_member_uq").on(t.runId, t.membershipId)],
);

// ---------- Discipline and behaviour ----------

export const BEHAVIOUR_SEVERITIES = ["minor", "moderate", "serious"] as const;

export const behaviourRecords = pgTable(
  "behaviour_records",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    termId: uuid("term_id").references(() => terms.id, { onDelete: "set null" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["merit", "incident"] }).notNull(),
    category: text("category").notNull(),
    severity: text("severity", { enum: BEHAVIOUR_SEVERITIES }),
    /** Positive for merits, negative for incidents. */
    points: integer("points").notNull().default(0),
    description: text("description").notNull().default(""),
    actionTaken: text("action_taken"),
    occurredOn: date("occurred_on").notNull(),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("resolved"),
    parentNotifiedAt: timestamp("parent_notified_at", { withTimezone: true }),
    recordedBy: uuid("recorded_by").references(() => memberships.id, { onDelete: "set null" }),
    resolvedBy: uuid("resolved_by").references(() => memberships.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("behaviour_student_idx").on(t.studentId, t.occurredOn), index("behaviour_school_term_idx").on(t.schoolId, t.termId, t.kind)],
);

// ---------- Library ----------

export const libraryBooks = pgTable(
  "library_books",
  {
    id: id(),
    schoolId: schoolId(),
    title: text("title").notNull(),
    author: text("author"),
    isbn: text("isbn"),
    publisher: text("publisher"),
    year: integer("year"),
    category: text("category"),
    shelf: text("shelf"),
    copies: integer("copies").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index("library_books_title_idx").on(t.schoolId, t.title), index("library_books_isbn_idx").on(t.schoolId, t.isbn)],
);

export const libraryLoans = pgTable(
  "library_loans",
  {
    id: id(),
    schoolId: schoolId(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => libraryBooks.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "cascade" }),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on").notNull(),
    returnedOn: date("returned_on"),
    fineKobo: kobo("fine_kobo").notNull().default(0),
    finePaid: boolean("fine_paid").notNull().default(false),
    issuedBy: uuid("issued_by").references(() => memberships.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("library_loans_open_idx").on(t.schoolId, t.returnedOn), index("library_loans_book_idx").on(t.bookId), index("library_loans_student_idx").on(t.studentId)],
);

// ---------- Inventory and assets ----------

export const INVENTORY_KINDS = ["consumable", "asset"] as const;
export const ASSET_CONDITIONS = ["good", "fair", "damaged", "lost"] as const;
export const STOCK_MOVES = ["in", "out", "adjust", "assign", "return"] as const;

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    kind: text("kind", { enum: INVENTORY_KINDS }).notNull(),
    category: text("category"),
    unit: text("unit").notNull().default("pieces"),
    /** How many are in the store now (not counting what is assigned out). */
    quantity: integer("quantity").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(0),
    unitCostKobo: kobo("unit_cost_kobo").notNull().default(0),
    location: text("location"),
    tag: text("tag"),
    condition: text("condition", { enum: ASSET_CONDITIONS }).notNull().default("good"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("inventory_items_name_idx").on(t.schoolId, t.name)],
);

export const inventoryAssignments = pgTable(
  "inventory_assignments",
  {
    id: id(),
    schoolId: schoolId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "set null" }),
    location: text("location"),
    assignedOn: date("assigned_on").notNull(),
    returnedOn: date("returned_on"),
    returnCondition: text("return_condition", { enum: ASSET_CONDITIONS }),
    note: text("note"),
    assignedBy: uuid("assigned_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("inventory_assignments_open_idx").on(t.schoolId, t.returnedOn), index("inventory_assignments_item_idx").on(t.itemId), index("inventory_assignments_member_idx").on(t.membershipId)],
);

export const inventoryMoves = pgTable(
  "inventory_moves",
  {
    id: id(),
    schoolId: schoolId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: STOCK_MOVES }).notNull(),
    /** Signed change to the store count: positive in, negative out. */
    change: integer("change").notNull(),
    balance: integer("balance").notNull(),
    unitCostKobo: kobo("unit_cost_kobo"),
    membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "set null" }),
    location: text("location"),
    supplier: text("supplier"),
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    note: text("note"),
    movedOn: date("moved_on").notNull(),
    recordedBy: uuid("recorded_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("inventory_moves_item_idx").on(t.itemId, t.createdAt), index("inventory_moves_school_idx").on(t.schoolId, t.movedOn)],
);

// ---------- Sick bay ----------

export const VISIT_OUTCOMES = ["returned", "rested", "sent_home", "referred"] as const;
export type MedicineGiven = { medicine: string; dose: string; at: string; allergyOverride?: boolean };

/** Standing health information per student, kept by the nurse. */
export const studentHealth = pgTable(
  "student_health",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    allergies: jsonb("allergies").$type<string[]>().notNull().default([]),
    conditions: jsonb("conditions").$type<string[]>().notNull().default([]),
    regularMedication: text("regular_medication"),
    emergencyNote: text("emergency_note"),
    doctor: text("doctor"),
    updatedBy: uuid("updated_by").references(() => memberships.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("student_health_student_uq").on(t.studentId)],
);

export const sickBayVisits = pgTable(
  "sick_bay_visits",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    termId: uuid("term_id").references(() => terms.id, { onDelete: "set null" }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }).notNull().defaultNow(),
    complaint: text("complaint").notNull(),
    /** Tenths of a degree Celsius, e.g. 378 for 37.8. */
    temperature: integer("temperature"),
    observations: text("observations"),
    treatment: text("treatment"),
    medicines: jsonb("medicines").$type<MedicineGiven[]>().notNull().default([]),
    outcome: text("outcome", { enum: VISIT_OUTCOMES }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    parentsTold: boolean("parents_told").notNull().default(false),
    recordedBy: uuid("recorded_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("sick_bay_visits_student_idx").on(t.studentId, t.arrivedAt), index("sick_bay_visits_school_idx").on(t.schoolId, t.arrivedAt)],
);

// ---------- Transport ----------

export const RIDE_DIRECTIONS = ["both", "morning", "afternoon"] as const;
export const TRIP_DIRECTIONS = ["morning", "afternoon"] as const;
export type RouteStop = { name: string; pickup: string; dropoff: string };

export const transportVehicles = pgTable("transport_vehicles", {
  id: id(),
  schoolId: schoolId(),
  name: text("name").notNull(),
  plate: text("plate"),
  capacity: integer("capacity").notNull(),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  attendantName: text("attendant_name"),
  attendantPhone: text("attendant_phone"),
  createdAt: createdAt(),
});

export const transportRoutes = pgTable("transport_routes", {
  id: id(),
  schoolId: schoolId(),
  name: text("name").notNull(),
  vehicleId: uuid("vehicle_id").references(() => transportVehicles.id, { onDelete: "set null" }),
  stops: jsonb("stops").$type<RouteStop[]>().notNull().default([]),
  termFeeKobo: kobo("term_fee_kobo").notNull().default(0),
  createdAt: createdAt(),
});

/** A student on a route. One route per student. */
export const transportRiders = pgTable(
  "transport_riders",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    routeId: uuid("route_id")
      .notNull()
      .references(() => transportRoutes.id, { onDelete: "cascade" }),
    stop: text("stop").notNull(),
    direction: text("direction", { enum: RIDE_DIRECTIONS }).notNull().default("both"),
    startedOn: date("started_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("transport_riders_student_uq").on(t.studentId), index("transport_riders_route_idx").on(t.routeId)],
);

/** The bus register for one route, one day, one direction. */
export const transportTrips = pgTable(
  "transport_trips",
  {
    id: id(),
    schoolId: schoolId(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => transportRoutes.id, { onDelete: "cascade" }),
    tripDate: date("trip_date").notNull(),
    direction: text("direction", { enum: TRIP_DIRECTIONS }).notNull(),
    boarded: jsonb("boarded").$type<string[]>().notNull().default([]),
    recordedBy: uuid("recorded_by").references(() => memberships.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("transport_trips_uq").on(t.routeId, t.tripDate, t.direction)],
);

// ---------- Hostel ----------

export const HOSTEL_GENDERS = ["male", "female", "mixed"] as const;
export const EXEAT_KINDS = ["weekend", "day", "medical", "family", "other"] as const;
export const EXEAT_STATUSES = ["pending", "approved", "declined", "out", "back", "cancelled"] as const;

export const hostels = pgTable("hostels", {
  id: id(),
  schoolId: schoolId(),
  name: text("name").notNull(),
  gender: text("gender", { enum: HOSTEL_GENDERS }).notNull(),
  wardenId: uuid("warden_id").references(() => memberships.id, { onDelete: "set null" }),
  termFeeKobo: kobo("term_fee_kobo").notNull().default(0),
  createdAt: createdAt(),
});

export const hostelRooms = pgTable(
  "hostel_rooms",
  {
    id: id(),
    schoolId: schoolId(),
    hostelId: uuid("hostel_id")
      .notNull()
      .references(() => hostels.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    beds: integer("beds").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("hostel_rooms_name_uq").on(t.hostelId, t.name)],
);

/** A boarder's bed. One bed per student, one student per bed. */
export const hostelBeds = pgTable(
  "hostel_beds",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => hostelRooms.id, { onDelete: "cascade" }),
    bed: integer("bed").notNull(),
    since: date("since").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("hostel_beds_student_uq").on(t.studentId), uniqueIndex("hostel_beds_bed_uq").on(t.roomId, t.bed)],
);

/** Permission for a boarder to leave school, and their sign-out and return. */
export const exeats = pgTable(
  "exeats",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: EXEAT_KINDS }).notNull(),
    reason: text("reason").notNull(),
    leaveAt: timestamp("leave_at", { withTimezone: true }).notNull(),
    returnBy: timestamp("return_by", { withTimezone: true }).notNull(),
    collectedBy: text("collected_by"),
    status: text("status", { enum: EXEAT_STATUSES }).notNull().default("pending"),
    requestedByUser: uuid("requested_by_user").references(() => users.id, { onDelete: "set null" }),
    requestedByStaff: boolean("requested_by_staff").notNull().default(false),
    decidedBy: uuid("decided_by").references(() => memberships.id, { onDelete: "set null" }),
    decisionNote: text("decision_note"),
    outAt: timestamp("out_at", { withTimezone: true }),
    backAt: timestamp("back_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("exeats_student_idx").on(t.studentId, t.leaveAt), index("exeats_school_status_idx").on(t.schoolId, t.status)],
);

// ---------- Documents ----------

export const DOCUMENT_KINDS = ["id_card", "testimonial", "certificate", "transcript", "letter"] as const;
export const TEMPLATE_KINDS = ["letter", "certificate"] as const;

/** Letter and certificate wording the school writes, with {{fields}} filled in per student. */
export const documentTemplates = pgTable("document_templates", {
  id: id(),
  schoolId: schoolId(),
  kind: text("kind", { enum: TEMPLATE_KINDS }).notNull(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every document the school issues, with a public token its QR code checks against. */
export const issuedDocuments = pgTable(
  "issued_documents",
  {
    id: id(),
    schoolId: schoolId(),
    kind: text("kind", { enum: DOCUMENT_KINDS }).notNull(),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").references(() => memberships.id, { onDelete: "cascade" }),
    holderName: text("holder_name").notNull(),
    title: text("title").notNull(),
    serial: text("serial").notNull(),
    token: text("token").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    /** Documents printed together share a batch, so they come out as one PDF. */
    batch: uuid("batch").notNull(),
    issuedBy: uuid("issued_by").references(() => memberships.id, { onDelete: "set null" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
  },
  (t) => [uniqueIndex("issued_documents_token_uq").on(t.token), uniqueIndex("issued_documents_serial_uq").on(t.schoolId, t.serial), index("issued_documents_holder_idx").on(t.studentId, t.kind), index("issued_documents_batch_idx").on(t.batch)],
);

// ---------- Platform billing (Adalin bills schools) ----------

export const PLATFORM_INVOICE_KINDS = ["term", "upgrade", "addon", "manual"] as const;
export const PLATFORM_INVOICE_STATUSES = ["open", "paid", "void"] as const;
export type BillLine = { description: string; amountKobo: number };

/** What a school owes Adalin: a bill per term for students on roll, upgrades and add-ons. */
export const platformInvoices = pgTable(
  "platform_invoices",
  {
    id: id(),
    schoolId: schoolId(),
    number: text("number").notNull(),
    kind: text("kind", { enum: PLATFORM_INVOICE_KINDS }).notNull(),
    termId: uuid("term_id").references(() => terms.id, { onDelete: "set null" }),
    period: text("period").notNull(),
    planKey: text("plan_key").notNull(),
    studentCount: integer("student_count").notNull().default(0),
    lines: jsonb("lines").$type<BillLine[]>().notNull().default([]),
    totalKobo: kobo("total_kobo").notNull(),
    status: text("status", { enum: PLATFORM_INVOICE_STATUSES }).notNull().default("open"),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidVia: text("paid_via"),
    reference: text("reference"),
    remindersSent: integer("reminders_sent").notNull().default(0),
    lastReminderOn: date("last_reminder_on"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("platform_invoices_number_uq").on(t.number), uniqueIndex("platform_invoices_reference_uq").on(t.reference), index("platform_invoices_school_idx").on(t.schoolId, t.status)],
);

export const ADDON_STATUSES = ["pending", "active", "cancelled"] as const;

/** Add-ons a school has bought: features billed each term alongside the plan, or one-off services. */
export const schoolAddons = pgTable(
  "school_addons",
  {
    id: id(),
    schoolId: schoolId(),
    key: text("key").notNull(),
    status: text("status", { enum: ADDON_STATUSES }).notNull().default("pending"),
    /** The bill that pays for it; it switches on when this is paid. */
    invoiceId: uuid("invoice_id").references(() => platformInvoices.id, { onDelete: "set null" }),
    /** For one-off services: when Adalin delivered it. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    note: text("note"),
    boughtBy: uuid("bought_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("school_addons_school_idx").on(t.schoolId, t.status)],
);

/** A school letting Adalin support sign in for a while. Only the school can grant it. */
export const supportGrants = pgTable(
  "support_grants",
  {
    id: id(),
    schoolId: schoolId(),
    grantedBy: uuid("granted_by").references(() => memberships.id, { onDelete: "set null" }),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("support_grants_school_idx").on(t.schoolId, t.expiresAt)],
);

/** What Adalin's team did in the admin console. Not tied to one school, so outside row-level security. */
export const platformAudit = pgTable(
  "platform_audit",
  {
    id: id(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("platform_audit_time_idx").on(t.createdAt), index("platform_audit_school_idx").on(t.schoolId)],
);

/** Keys a school's own systems use to read its data through the public API. Only a hash is kept. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    /** The first characters, shown so people can tell keys apart. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_hash_uq").on(t.keyHash), index("api_keys_school_idx").on(t.schoolId)],
);

/** Where a school wants to be told when things happen (a payment, a new student). */
export const webhooks = pgTable(
  "webhooks",
  {
    id: id(),
    schoolId: schoolId(),
    url: text("url").notNull(),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    /** Signs each delivery so the receiver knows it came from School OS. */
    signingSecret: text("signing_secret").notNull(),
    active: boolean("active").notNull().default(true),
    /** Deliveries that failed in a row; it switches off after too many. */
    failures: integer("failures").notNull().default(0),
    createdBy: uuid("created_by").references(() => memberships.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("webhooks_school_idx").on(t.schoolId)],
);

export const WEBHOOK_DELIVERY_STATUSES = ["pending", "sent", "failed"] as const;

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    schoolId: schoolId(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: WEBHOOK_DELIVERY_STATUSES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    error: text("error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt), index("webhook_deliveries_hook_idx").on(t.webhookId, t.createdAt)],
);

/** Every table with a school_id column. Row-level security is applied to each. */
export const TENANT_TABLES = [
  "roles",
  "memberships",
  "membership_roles",
  "invitations",
  "audit_logs",
  "academic_sessions",
  "terms",
  "class_levels",
  "classes",
  "subjects",
  "level_subjects",
  "teacher_assignments",
  "students",
  "guardians",
  "student_guardians",
  "enrollments",
  "attendance_days",
  "attendance_records",
  "assessment_components",
  "grade_bands",
  "scores",
  "score_sheets",
  "class_results",
  "term_reports",
  "result_pins",
  "student_subjects",
  "fee_items",
  "fee_amounts",
  "discount_schemes",
  "student_discounts",
  "invoices",
  "invoice_lines",
  "payments",
  "payment_intents",
  "expenses",
  "announcements",
  "announcement_reads",
  "calendar_events",
  "conversations",
  "conversation_participants",
  "messages",
  "notifications",
  "outbound_messages",
  "credit_ledger",
  "files",
  "bell_schedules",
  "bell_periods",
  "level_schedules",
  "timetable_slots",
  "assignments",
  "assignment_submissions",
  "scheme_items",
  "lesson_notes",
  "questions",
  "exams",
  "exam_classes",
  "exam_questions",
  "exam_attempts",
  "materials",
  "applicants",
  "staff_attendance",
  "leave_requests",
  "staff_pay",
  "payroll_runs",
  "payslips",
  "behaviour_records",
  "library_books",
  "library_loans",
  "inventory_items",
  "inventory_assignments",
  "inventory_moves",
  "student_health",
  "sick_bay_visits",
  "transport_vehicles",
  "transport_routes",
  "transport_riders",
  "transport_trips",
  "hostels",
  "hostel_rooms",
  "hostel_beds",
  "exeats",
  "document_templates",
  "issued_documents",
  "platform_invoices",
  "school_addons",
  "support_grants",
  "api_keys",
  "webhooks",
  "webhook_deliveries",
] as const;
