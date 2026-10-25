import { isPlatformAdmin } from "../auth/platform-admin";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { membershipRoles, memberships, plans, platformAudit, platformInvoices, roles, schoolAddons, schools, students, supportGrants, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira } from "../money";
import { FEATURES, type FeatureKey } from "../plans/catalog";
import { requirePermission, type Access } from "./access";
import { addonByKey, activateAddonsForBill, syncExtraFeatures } from "./addons";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { liftReadOnlyIfClear } from "./billing";
import { addDays, nextBillNumber } from "./billing-core";

/*
 * Adalin's admin console: every school, its plan and features, bills across the platform,
 * add-on orders to deliver, the plan catalogue, and support access a school has granted.
 * Everything done here is written to the platform audit log.
 */

export const SCHOOL_PAGE_SIZE = 30;
export type Admin = { id: string; name: string };

/** Only Adalin staff (see isPlatformAdmin) get past this. */
export async function requirePlatformAdmin(db: DB, userId: string): Promise<Admin> {
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email, isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId));
  if (!u || !isPlatformAdmin(u)) throw new AppError("That's for the Adalin team.", "forbidden");
  return { id: u.id, name: u.name };
}

async function log(db: DB, admin: Admin, action: string, summary: string, schoolId?: string | null) {
  await db.insert(platformAudit).values({ actorId: admin.id, actorName: admin.name, schoolId: schoolId ?? null, action, summary });
}

async function schoolOrThrow(db: DB, id: string) {
  const [s] = await db.select().from(schools).where(eq(schools.id, id));
  if (!s) throw new AppError("That school wasn't found.", "not_found");
  return s;
}

const studentCount = sql<number>`(select count(*) from students s where s.school_id = "schools"."id" and s.status = 'active')`.mapWith(Number);
const staffCount = sql<number>`(select count(*) from memberships m where m.school_id = "schools"."id" and m.status = 'active' and m.support_until is null)`.mapWith(Number);
const owedSql = sql<number>`(select coalesce(sum(i.total_kobo), 0) from platform_invoices i where i.school_id = "schools"."id" and i.status = 'open')`.mapWith(Number);

// ---------- Overview ----------

export async function platformOverview(db: DB) {
  const today = lagosToday();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [[counts], [money], [students_], trials, recent, overdue, toDeliver] = await Promise.all([
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${schools.status} = 'active')`.mapWith(Number),
        readOnly: sql<number>`count(*) filter (where ${schools.status} = 'read_only')`.mapWith(Number),
        suspended: sql<number>`count(*) filter (where ${schools.status} = 'suspended')`.mapWith(Number),
        paidPlans: sql<number>`count(*) filter (where ${schools.planKey} not in ('free'))`.mapWith(Number),
        newThisMonth: sql<number>`count(*) filter (where ${schools.createdAt} >= date_trunc('month', now()))`.mapWith(Number),
      })
      .from(schools),
    db
      .select({
        paidThisYear: sql<number>`coalesce(sum(${platformInvoices.totalKobo}) filter (where ${platformInvoices.status} = 'paid' and ${platformInvoices.paidAt} >= ${yearStart}::date), 0)`.mapWith(Number),
        outstanding: sql<number>`coalesce(sum(${platformInvoices.totalKobo}) filter (where ${platformInvoices.status} = 'open'), 0)`.mapWith(Number),
        overdue: sql<number>`coalesce(sum(${platformInvoices.totalKobo}) filter (where ${platformInvoices.status} = 'open' and ${platformInvoices.dueOn} < ${today}), 0)`.mapWith(Number),
      })
      .from(platformInvoices),
    db.select({ n: count() }).from(students).where(eq(students.status, "active")),
    db.select({ id: schools.id, name: schools.name, endsAt: schools.trialEndsAt, plan: schools.planKey }).from(schools).where(sql`${schools.trialEndsAt} is not null`).orderBy(asc(schools.trialEndsAt)).limit(10),
    db.select({ id: schools.id, name: schools.name, plan: schools.planKey, createdAt: schools.createdAt, students: studentCount }).from(schools).orderBy(desc(schools.createdAt)).limit(8),
    db
      .select({ bill: platformInvoices, school: schools.name })
      .from(platformInvoices)
      .innerJoin(schools, eq(schools.id, platformInvoices.schoolId))
      .where(and(eq(platformInvoices.status, "open"), lt(platformInvoices.dueOn, today)))
      .orderBy(asc(platformInvoices.dueOn))
      .limit(10),
    db.select({ n: count() }).from(schoolAddons).where(and(eq(schoolAddons.status, "active"), isNull(schoolAddons.deliveredAt), inArray(schoolAddons.key, ["setup_remote", "setup_onsite", "pin_cards"]))),
  ]);
  return { counts, money, students: students_.n, trials, recent, overdue, toDeliver: toDeliver[0].n };
}

// ---------- Schools ----------

export async function listSchools(db: DB, filter: { q?: string; plan?: string; status?: string; page?: number; all?: boolean } = {}) {
  const where: SQL[] = [];
  if (filter.q) where.push(or(ilike(schools.name, `%${filter.q}%`), ilike(schools.slug, `%${filter.q}%`), ilike(schools.email, `%${filter.q}%`), ilike(schools.city, `%${filter.q}%`))!);
  if (filter.plan) where.push(eq(schools.planKey, filter.plan));
  if (filter.status === "trial") where.push(sql`${schools.trialEndsAt} is not null`);
  else if (filter.status === "owing") where.push(sql`${owedSql} > 0`);
  else if (filter.status) where.push(sql`${schools.status} = ${filter.status}`);
  const page = Math.max(1, filter.page ?? 1);
  const base = db
    .select({ school: schools, students: studentCount, staff: staffCount, owed: owedSql })
    .from(schools)
    .where(and(...where))
    .orderBy(desc(schools.createdAt));
  const [[{ total }], rows] = await Promise.all([db.select({ total: count() }).from(schools).where(and(...where)), filter.all ? base.limit(5000) : base.limit(SCHOOL_PAGE_SIZE).offset((page - 1) * SCHOOL_PAGE_SIZE)]);
  return { rows, total };
}

export async function schoolDetail(db: DB, schoolId: string) {
  const school = await schoolOrThrow(db, schoolId);
  const [[stats], owners, bills, addons, grants, activity, allPlans] = await Promise.all([
    db.select({ students: studentCount, staff: staffCount, owed: owedSql }).from(schools).where(eq(schools.id, schoolId)),
    db
      .selectDistinct({ name: users.name, email: users.email, phone: users.phone })
      .from(memberships)
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.schoolId, schoolId), eq(memberships.status, "active"), eq(roles.key, "owner"), isNull(memberships.supportUntil))),
    db.select().from(platformInvoices).where(eq(platformInvoices.schoolId, schoolId)).orderBy(desc(platformInvoices.issuedOn), desc(platformInvoices.createdAt)),
    db.select().from(schoolAddons).where(eq(schoolAddons.schoolId, schoolId)).orderBy(desc(schoolAddons.createdAt)),
    db.select().from(supportGrants).where(eq(supportGrants.schoolId, schoolId)).orderBy(desc(supportGrants.createdAt)).limit(5),
    db.select().from(platformAudit).where(eq(platformAudit.schoolId, schoolId)).orderBy(desc(platformAudit.createdAt)).limit(30),
    db.select().from(plans).orderBy(asc(plans.sort)),
  ]);
  const now = new Date();
  const liveGrant = grants.find((g) => !g.revokedAt && g.expiresAt > now) ?? null;
  return { school, stats, owners, bills, addons: addons.map((a) => ({ ...a, addon: addonByKey(a.key) })), grant: liveGrant, grants, activity, plans: allPlans };
}

export async function setSchoolPlan(db: DB, admin: Admin, schoolId: string, planKey: string) {
  const school = await schoolOrThrow(db, schoolId);
  const [plan] = await db.select().from(plans).where(eq(plans.key, planKey));
  if (!plan) throw new AppError("That plan wasn't found.", "not_found");
  await db.update(schools).set({ planKey, pendingPlanKey: null, trialEndsAt: null, trialReturnPlanKey: null }).where(eq(schools.id, schoolId));
  await log(db, admin, "school.plan", `Moved ${school.name} from ${school.planKey} to ${plan.name} (no bill raised)`, schoolId);
}

const featureList = z.array(z.string().refine((f) => f in FEATURES, "Unknown feature.")).max(60);
export const overridesSchema = z.object({ grants: featureList, blocks: featureList });

/** Switch single features on or off for one school, over and above its plan. */
export async function setFeatureOverrides(db: DB, admin: Admin, schoolId: string, input: z.infer<typeof overridesSchema>) {
  const school = await schoolOrThrow(db, schoolId);
  const grants = [...new Set(input.grants)];
  const blocks = [...new Set(input.blocks)].filter((b) => !grants.includes(b));
  await db.update(schools).set({ adminGrants: grants, adminBlocks: blocks }).where(eq(schools.id, schoolId));
  await syncExtraFeatures(db, schoolId);
  const name = (f: string) => FEATURES[f as FeatureKey] ?? f;
  await log(db, admin, "school.features", `${school.name}: on ${grants.map(name).join(", ") || "nothing extra"}; off ${blocks.map(name).join(", ") || "nothing"}`, schoolId);
}

export async function extendTrial(db: DB, admin: Admin, schoolId: string, days: number) {
  const school = await schoolOrThrow(db, schoolId);
  if (!school.trialEndsAt) throw new AppError("This school isn't on a trial.", "conflict");
  if (days < 1 || days > 90) throw new AppError("Extend by 1 to 90 days.", "invalid");
  const ends = new Date(school.trialEndsAt.getTime() + days * 86_400_000);
  await db.update(schools).set({ trialEndsAt: ends }).where(eq(schools.id, schoolId));
  await log(db, admin, "school.trial", `Extended ${school.name}'s trial by ${days} days`, schoolId);
}

export async function setSchoolStatus(db: DB, admin: Admin, schoolId: string, status: "active" | "suspended" | "read_only", reason: string) {
  const school = await schoolOrThrow(db, schoolId);
  if (reason.trim().length < 3) throw new AppError("Say why.", "invalid");
  await db
    .update(schools)
    .set({ status, readOnlySince: status === "read_only" ? new Date() : null })
    .where(eq(schools.id, schoolId));
  await log(db, admin, "school.status", `${school.name}: ${school.status} → ${status} (${reason.trim()})`, schoolId);
}

export async function saveAdminNote(db: DB, admin: Admin, schoolId: string, note: string) {
  const school = await schoolOrThrow(db, schoolId);
  await db.update(schools).set({ adminNote: note.trim() || null }).where(eq(schools.id, schoolId));
  await log(db, admin, "school.note", `Updated the note on ${school.name}`, schoolId);
}

// ---------- Bills ----------

export async function listPlatformBills(db: DB, filter: { view?: string; q?: string } = {}) {
  const today = lagosToday();
  const where: SQL[] = [];
  if (filter.view === "overdue") where.push(eq(platformInvoices.status, "open"), lt(platformInvoices.dueOn, today));
  else if (filter.view === "open") where.push(eq(platformInvoices.status, "open"));
  else if (filter.view === "paid") where.push(eq(platformInvoices.status, "paid"));
  if (filter.q) where.push(or(ilike(schools.name, `%${filter.q}%`), ilike(platformInvoices.number, `%${filter.q}%`))!);
  return db
    .select({ bill: platformInvoices, school: schools.name, schoolId: schools.id })
    .from(platformInvoices)
    .innerJoin(schools, eq(schools.id, platformInvoices.schoolId))
    .where(and(...where))
    .orderBy(desc(platformInvoices.issuedOn), desc(platformInvoices.createdAt))
    .limit(500);
}

/** A bill paid by bank transfer or cash: marked by hand, with what came in. */
export async function markBillPaid(db: DB, admin: Admin, billId: string, via: string) {
  const [bill] = await db.select().from(platformInvoices).where(eq(platformInvoices.id, billId));
  if (!bill) throw new AppError("That bill wasn't found.", "not_found");
  if (bill.status !== "open") throw new AppError("Only bills waiting for payment can be marked paid.", "conflict");
  if (via.trim().length < 3) throw new AppError("Say how it was paid, e.g. the transfer reference.", "invalid");
  await db.update(platformInvoices).set({ status: "paid", paidAt: new Date(), paidVia: via.trim() }).where(eq(platformInvoices.id, billId));
  await activateAddonsForBill(db, bill.schoolId, bill.id);
  await liftReadOnlyIfClear(db, bill.schoolId);
  await log(db, admin, "bill.paid", `Marked ${bill.number} paid (${formatNaira(bill.totalKobo)}, ${via.trim()})`, bill.schoolId);
}

export async function voidBill(db: DB, admin: Admin, billId: string, reason: string) {
  const [bill] = await db.select().from(platformInvoices).where(eq(platformInvoices.id, billId));
  if (!bill) throw new AppError("That bill wasn't found.", "not_found");
  if (bill.status !== "open") throw new AppError("Only bills waiting for payment can be cancelled.", "conflict");
  if (reason.trim().length < 3) throw new AppError("Say why it's cancelled.", "invalid");
  await db.update(platformInvoices).set({ status: "void" }).where(eq(platformInvoices.id, billId));
  await withTenant(db, bill.schoolId, (tx) => tx.update(schoolAddons).set({ status: "cancelled" }).where(and(eq(schoolAddons.invoiceId, bill.id), eq(schoolAddons.status, "pending"))));
  await liftReadOnlyIfClear(db, bill.schoolId);
  await log(db, admin, "bill.void", `Cancelled ${bill.number} (${reason.trim()})`, bill.schoolId);
}

export const manualBillSchema = z.object({
  description: z.string().trim().min(3, "Describe the charge.").max(200),
  amountKobo: z.number().int().min(100, "Enter an amount.").max(1_000_000_000_00),
  dueInDays: z.number().int().min(0).max(90).default(14),
});

export async function addManualBill(db: DB, admin: Admin, schoolId: string, input: z.infer<typeof manualBillSchema>) {
  const school = await schoolOrThrow(db, schoolId);
  const today = lagosToday();
  const number = await nextBillNumber(db);
  const [bill] = await withTenant(db, schoolId, (tx) =>
    tx
      .insert(platformInvoices)
      .values({
        schoolId,
        number,
        kind: "manual",
        period: today.slice(0, 7),
        planKey: school.planKey,
        lines: [{ description: input.description, amountKobo: input.amountKobo }],
        totalKobo: input.amountKobo,
        issuedOn: today,
        dueOn: addDays(today, input.dueInDays),
      })
      .returning(),
  );
  await log(db, admin, "bill.manual", `Billed ${school.name} ${formatNaira(input.amountKobo)}: ${input.description} (${bill.number})`, schoolId);
  return bill;
}

// ---------- Add-on deliveries ----------

export async function listDeliveries(db: DB) {
  return db
    .select({ addon: schoolAddons, school: schools.name, schoolId: schools.id, phone: schools.phone, email: schools.email })
    .from(schoolAddons)
    .innerJoin(schools, eq(schools.id, schoolAddons.schoolId))
    .where(and(eq(schoolAddons.status, "active"), inArray(schoolAddons.key, ["setup_remote", "setup_onsite", "pin_cards"])))
    .orderBy(asc(schoolAddons.deliveredAt), asc(schoolAddons.createdAt))
    .limit(300);
}

export async function markDelivered(db: DB, admin: Admin, addonId: string) {
  const [row] = await db.update(schoolAddons).set({ deliveredAt: new Date() }).where(and(eq(schoolAddons.id, addonId), isNull(schoolAddons.deliveredAt))).returning();
  if (!row) throw new AppError("That order wasn't found or is already delivered.", "not_found");
  await log(db, admin, "addon.delivered", `Delivered ${addonByKey(row.key)?.name ?? row.key}${row.note ? ` (${row.note})` : ""}`, row.schoolId);
}

// ---------- Plans ----------

export const planEditSchema = z.object({
  key: z.string(),
  name: z.string().trim().min(2).max(40),
  pricePerStudentKobo: z.number().int().min(0).max(100_000_000).nullable(),
  features: featureList,
  limits: z.object({ students: z.number().int().min(1).nullable(), staff: z.number().int().min(1).nullable(), audit_days: z.number().int().min(0).nullable() }),
});

/** Prices, features and limits live in the database, so they change here without a release. */
export async function updatePlan(db: DB, admin: Admin, input: z.infer<typeof planEditSchema>) {
  const [plan] = await db.select().from(plans).where(eq(plans.key, input.key));
  if (!plan) throw new AppError("That plan wasn't found.", "not_found");
  const limits = Object.fromEntries(Object.entries(input.limits).filter(([, v]) => v !== null)) as Record<string, number>;
  await db.update(plans).set({ name: input.name, pricePerStudentKobo: input.pricePerStudentKobo, features: [...new Set(input.features)], limits }).where(eq(plans.key, input.key));
  const added = input.features.filter((f) => !plan.features.includes(f));
  const removed = plan.features.filter((f) => !input.features.includes(f));
  await log(
    db,
    admin,
    "plan.updated",
    `${input.name}: ${input.pricePerStudentKobo === null ? "custom price" : formatNaira(input.pricePerStudentKobo)} per student${added.length ? `; added ${added.join(", ")}` : ""}${removed.length ? `; removed ${removed.join(", ")}` : ""}`,
  );
}

export async function listActivity(db: DB, filter: { q?: string } = {}) {
  return db
    .select({ a: platformAudit, school: schools.name })
    .from(platformAudit)
    .leftJoin(schools, eq(schools.id, platformAudit.schoolId))
    .where(filter.q ? or(ilike(platformAudit.summary, `%${filter.q}%`), ilike(platformAudit.actorName, `%${filter.q}%`), ilike(schools.name, `%${filter.q}%`)) : undefined)
    .orderBy(desc(platformAudit.createdAt))
    .limit(300);
}

// ---------- Support access ----------

/** The school lets Adalin support in for a set time. Only the proprietor can. */
export async function grantSupport(db: DB, access: Access, input: { hours: number; reason: string }, ip?: string | null) {
  requirePermission(access, "school:billing");
  if (![24, 72].includes(input.hours)) throw new AppError("Choose 24 or 72 hours.", "invalid");
  const expiresAt = new Date(Date.now() + input.hours * 3_600_000);
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(supportGrants).set({ revokedAt: new Date() }).where(isNull(supportGrants.revokedAt));
    await tx.insert(supportGrants).values({ schoolId: access.school.id, grantedBy: access.membershipId, reason: input.reason.trim() || null, expiresAt });
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "support.granted", summary: `Let Adalin support in for ${input.hours} hours${input.reason.trim() ? ` (${input.reason.trim()})` : ""}` });
  });
  return expiresAt;
}

/** Ends support access at once, including anyone from Adalin signed in now. */
export async function revokeSupport(db: DB, access: Access, ip?: string | null) {
  requirePermission(access, "school:billing");
  const now = new Date();
  await withTenant(db, access.school.id, async (tx) => {
    await tx.update(supportGrants).set({ revokedAt: now }).where(and(isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, now)));
    await tx.update(memberships).set({ supportUntil: now }).where(gt(memberships.supportUntil, now));
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "support.revoked", summary: "Ended Adalin support access" });
  });
}

export async function supportStatus(db: DB, access: Access) {
  const now = new Date();
  const [grant] = await withTenant(db, access.school.id, (tx) =>
    tx.select().from(supportGrants).where(and(isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, now))).orderBy(desc(supportGrants.expiresAt)).limit(1),
  );
  return grant ?? null;
}

/** The bar across the top while support access is open: for support themselves, and for the school's proprietors. */
export async function supportNotice(db: DB, access: Access) {
  const until = (d: Date) => d.toLocaleString("en-NG", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
  if (access.supportUntil) return { self: true, tone: "blue" as const, text: `You're in ${access.school.name} as Adalin support until ${until(access.supportUntil)}. Everything you do is in the school's activity log.` };
  if (!access.permissions.has("school:billing")) return null;
  const grant = await supportStatus(db, access);
  return grant ? { self: false, tone: "blue" as const, text: `Adalin support can sign in to your school until ${until(grant.expiresAt)}. Close it any time.` } : null;
}

/**
 * Adalin support enters a school the school has opened up: a temporary proprietor membership
 * that ends when the school's grant does. Everything they do is in the school's audit log.
 */
export async function openAsSupport(db: DB, admin: Admin, schoolId: string) {
  const school = await schoolOrThrow(db, schoolId);
  const now = new Date();
  const [grant] = await db
    .select()
    .from(supportGrants)
    .where(and(eq(supportGrants.schoolId, schoolId), isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, now)))
    .orderBy(desc(supportGrants.expiresAt))
    .limit(1);
  const [existing] = await db.select().from(memberships).where(and(eq(memberships.schoolId, schoolId), eq(memberships.userId, admin.id)));
  if (existing && !existing.supportUntil) return school.slug;
  if (!grant) throw new AppError(`${school.name} hasn't let Adalin support in. Ask the proprietor to switch it on under Settings, Plan & billing.`, "forbidden");
  await withTenant(db, schoolId, async (tx) => {
    const [owner] = await tx.select().from(roles).where(eq(roles.key, "owner"));
    let membershipId = existing?.id;
    if (existing) await tx.update(memberships).set({ status: "support", supportUntil: grant.expiresAt }).where(eq(memberships.id, existing.id));
    else [{ id: membershipId }] = await tx.insert(memberships).values({ schoolId, userId: admin.id, status: "support", supportUntil: grant.expiresAt, jobTitle: "Adalin support" }).returning({ id: memberships.id });
    await tx.insert(membershipRoles).values({ schoolId, membershipId: membershipId!, roleId: owner.id }).onConflictDoNothing();
    await recordAudit(tx, schoolId, { userId: admin.id, name: `${admin.name} (Adalin support)` }, { action: "support.entered", summary: `Adalin support signed in, until ${grant.expiresAt.toISOString().slice(0, 16).replace("T", " ")}` });
  });
  await log(db, admin, "support.entered", `Opened ${school.name} as support`, schoolId);
  return school.slug;
}

/** For a custom domain Adalin connected by hand: confirms it works so the school's branding shows there. */
export async function confirmSchoolDomain(db: DB, admin: Admin, schoolId: string) {
  const school = await schoolOrThrow(db, schoolId);
  if (!school.customDomain) throw new AppError("This school hasn't set a web address.", "conflict");
  await db.update(schools).set({ domainVerifiedAt: new Date() }).where(eq(schools.id, schoolId));
  await log(db, admin, "school.domain", `Marked ${school.customDomain} live for ${school.name}`, schoolId);
}
