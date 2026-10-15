import { sql } from "drizzle-orm";
import {
  boolean,
  date,
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

export const SECTIONS = ["creche", "nursery", "primary", "junior_secondary", "senior_secondary", "other"] as const;
export type Section = (typeof SECTIONS)[number];

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
] as const;
