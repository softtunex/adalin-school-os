import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { plans, schools } from "../db/schema";
import { withTenant } from "../db/tenant";
import { brandProblem, normalizeHex } from "../brand";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { markOnboarding } from "./onboarding";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const schoolProfileSchema = z.object({
  name: z.string().trim().min(3, "Enter the school's name.").max(160),
  motto: optional(160),
  schoolType: z.enum(["nursery", "primary", "secondary", "combined"]).nullable().optional(),
  curriculum: z.enum(["nigerian", "british", "american", "montessori", "mixed"]).nullable().optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  phone: optional(40),
  address: optional(300),
  city: optional(80),
  state: optional(80),
  country: z.string().trim().min(2).max(80).default("Nigeria"),
  admissionPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z0-9]{1,8}$/.test(v), "Use up to 8 letters or numbers, e.g. ADC.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

export type SchoolProfileInput = z.infer<typeof schoolProfileSchema>;

export async function updateSchoolProfile(db: DB, access: Access, input: SchoolProfileInput, ip?: string | null) {
  requirePermission(access, "school:update");
  await withTenant(db, access.school.id, async (tx) => {
    await tx
      .update(schools)
      .set({
        name: input.name,
        motto: input.motto ?? null,
        schoolType: input.schoolType ?? null,
        curriculum: input.curriculum ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country,
        admissionPrefix: input.admissionPrefix ?? null,
      })
      .where(eq(schools.id, access.school.id));
    if (input.address && input.phone && input.schoolType) await markOnboarding(tx, access.school.id, "profile");
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "school.updated",
      summary: "Updated the school profile",
      entityType: "school",
      entityId: access.school.id,
    });
  });
}

export async function setSchoolLogo(db: DB, access: Access, logoUrl: string | null, ip?: string | null) {
  requirePermission(access, "school:update");
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(schools).set({ logoUrl }).where(eq(schools.id, access.school.id));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "school.logo",
      summary: logoUrl ? "Uploaded a new school logo" : "Removed the school logo",
    });
  });
}

export async function listPlans(db: DB) {
  return db.select().from(plans).orderBy(asc(plans.sort));
}

/** The school's own colour (Premium). Null goes back to School OS orange. */
export async function setBrandColor(db: DB, access: Access, color: string | null, ip?: string | null) {
  requirePermission(access, "school:update");
  if (!hasFeature(access.plan, "brand_theme")) throw new AppError("School colours are on the Premium plan.", "upgrade");
  let value: string | null = null;
  if (color) {
    const problem = brandProblem(color);
    if (problem) throw new AppError(problem, "invalid");
    value = normalizeHex(color);
  }
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(schools).set({ brandColor: value }).where(eq(schools.id, access.school.id));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "school.brand_color", summary: value ? `Set the school colour to ${value}` : "Went back to the standard colour" });
  });
}
