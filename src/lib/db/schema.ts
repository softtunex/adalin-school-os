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
};

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
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    uniqueIndex("users_phone_uq").on(t.phone),
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
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
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
    onboarding: jsonb("onboarding").$type<Record<string, boolean>>().notNull().default({}),
    admissionPrefix: text("admission_prefix"),
    nextAdmissionSeq: integer("next_admission_seq").notNull().default(1),
    nextInvoiceSeq: integer("next_invoice_seq").notNull().default(1),
    nextReceiptSeq: integer("next_receipt_seq").notNull().default(1),
    feeSettings: jsonb("fee_settings").$type<FeeSettings>().notNull().default({}),
    paystackSubaccount: text("paystack_subaccount"),
    commsSettings: jsonb("comms_settings").$type<CommsSettings>().notNull().default({}),
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
    status: text("status", { enum: ["active", "deactivated"] })
      .notNull()
      .default("active"),
    jobTitle: text("job_title"),
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

export const AUDIENCES = ["everyone", "staff", "parents", "classes"] as const;
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
] as const;
