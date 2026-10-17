import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { membershipRoles, memberships, roles, schoolGroupAdmins, schoolGroups, schools } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { createSchoolForUser } from "./accounts";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";

/*
 * Multi-campus groups (Enterprise). A group links schools one proprietor runs; each campus keeps
 * its own records, staff and bill, and the group dashboard compares them side by side.
 */

export const groupNameSchema = z.string().trim().min(2, "Name the group, e.g. Adalin Schools.").max(80);

async function isGroupAdmin(db: DB, groupId: string, userId: string) {
  const [row] = await db.select().from(schoolGroupAdmins).where(and(eq(schoolGroupAdmins.groupId, groupId), eq(schoolGroupAdmins.userId, userId)));
  return Boolean(row);
}

async function requireGroupAdmin(db: DB, groupId: string, userId: string) {
  const [group] = await db.select().from(schoolGroups).where(eq(schoolGroups.id, groupId));
  if (!group || !(await isGroupAdmin(db, groupId, userId))) throw new AppError("That group wasn't found.", "not_found");
  return group;
}

/** Schools where this person is a real (not support) proprietor. */
async function ownedSchools(db: DB, userId: string) {
  return db
    .selectDistinct({ id: schools.id, name: schools.name, slug: schools.slug, groupId: schools.groupId })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(schools, eq(schools.id, memberships.schoolId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active"), isNull(memberships.supportUntil), eq(roles.key, "owner")))
    .orderBy(asc(schools.name));
}

function requireOwnerWithCampuses(access: Access) {
  requirePermission(access, "school:billing");
  requireFeature(access.plan, "multi_campus");
}

/** Turns this school into the first campus of a new group. */
export async function createGroup(db: DB, access: Access, name: string, ip?: string | null) {
  requireOwnerWithCampuses(access);
  if (access.supportUntil) throw new AppError("Only the proprietor can do that.", "forbidden");
  const groupName = groupNameSchema.parse(name);
  const [school] = await db.select({ groupId: schools.groupId }).from(schools).where(eq(schools.id, access.school.id));
  if (school.groupId) throw new AppError("This school is already in a group.", "conflict");
  const [group] = await db.insert(schoolGroups).values({ name: groupName, createdBy: access.user.id }).returning();
  await db.insert(schoolGroupAdmins).values({ groupId: group.id, userId: access.user.id });
  await db.update(schools).set({ groupId: group.id }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) => recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "group.created", summary: `Started the group ${groupName}` }));
  return group;
}

/** A brand-new campus in the group, on the same plan, with the proprietor as its owner. */
export async function addNewCampus(db: DB, access: Access, campusName: string) {
  requireOwnerWithCampuses(access);
  const groupId = access.school.groupId;
  if (!groupId) throw new AppError("Start a group first.", "conflict");
  await requireGroupAdmin(db, groupId, access.user.id);
  const name = z.string().trim().min(2, "Name the campus.").max(120).parse(campusName);
  const school = await db.transaction(async (tx) => {
    const s = await createSchoolForUser(tx, { id: access.user.id, name: access.user.name }, name);
    await tx.update(schools).set({ groupId, planKey: access.school.planKey, city: access.school.city, state: access.school.state, country: access.school.country }).where(eq(schools.id, s.id));
    return s;
  });
  return school;
}

/** Brings in a school this proprietor already runs. */
export async function linkCampus(db: DB, access: Access, schoolId: string) {
  requireOwnerWithCampuses(access);
  const groupId = access.school.groupId;
  if (!groupId) throw new AppError("Start a group first.", "conflict");
  await requireGroupAdmin(db, groupId, access.user.id);
  const mine = await ownedSchools(db, access.user.id);
  const target = mine.find((s) => s.id === schoolId);
  if (!target) throw new AppError("You can only add schools where you're the proprietor.", "forbidden");
  if (target.groupId) throw new AppError(`${target.name} is already in a group.`, "conflict");
  await db.update(schools).set({ groupId }).where(eq(schools.id, schoolId));
}

/** Takes a campus out of the group. It carries on as a school on its own. */
export async function removeCampus(db: DB, access: Access, schoolId: string) {
  requirePermission(access, "school:billing");
  const groupId = access.school.groupId;
  if (!groupId) throw new AppError("This school isn't in a group.", "conflict");
  await requireGroupAdmin(db, groupId, access.user.id);
  const campuses = await db.select({ id: schools.id }).from(schools).where(eq(schools.groupId, groupId));
  if (!campuses.some((c) => c.id === schoolId)) throw new AppError("That campus isn't in this group.", "not_found");
  await db.update(schools).set({ groupId: null }).where(eq(schools.id, schoolId));
  if (campuses.length === 1) await db.delete(schoolGroups).where(eq(schoolGroups.id, groupId));
}

/** For the Campuses tab: the group, its campuses, and schools that could join. */
export async function campusesTab(db: DB, access: Access) {
  requirePermission(access, "school:billing");
  const groupId = access.school.groupId;
  const mine = await ownedSchools(db, access.user.id);
  if (!groupId) return { group: null, campuses: [], linkable: [], isAdmin: false };
  const [group] = await db.select().from(schoolGroups).where(eq(schoolGroups.id, groupId));
  const campuses = await db.select({ id: schools.id, name: schools.name, slug: schools.slug }).from(schools).where(eq(schools.groupId, groupId)).orderBy(asc(schools.name));
  return { group, campuses, linkable: mine.filter((s) => !s.groupId), isAdmin: await isGroupAdmin(db, groupId, access.user.id) };
}

export async function listUserGroups(db: DB, userId: string) {
  return db
    .select({ id: schoolGroups.id, name: schoolGroups.name, campuses: sql<number>`(select count(*) from schools s where s.group_id = "school_groups"."id")`.mapWith(Number) })
    .from(schoolGroupAdmins)
    .innerJoin(schoolGroups, eq(schoolGroups.id, schoolGroupAdmins.groupId))
    .where(eq(schoolGroupAdmins.userId, userId))
    .orderBy(asc(schoolGroups.name));
}

/** Every campus side by side: roll, staff, today's attendance and this term's fees. */
export async function groupOverview(db: DB, userId: string, groupId: string) {
  const group = await requireGroupAdmin(db, groupId, userId);
  const today = lagosToday();
  const rows = await db
    .select({
      id: schools.id,
      name: schools.name,
      slug: schools.slug,
      plan: schools.planKey,
      status: schools.status,
      students: sql<number>`(select count(*) from students x where x.school_id = "schools"."id" and x.status = 'active')`.mapWith(Number),
      staff: sql<number>`(select count(*) from memberships m where m.school_id = "schools"."id" and m.status = 'active' and m.support_until is null)`.mapWith(Number),
      marked: sql<number>`(select count(*) from attendance_records r join attendance_days d on d.id = r.day_id where d.school_id = "schools"."id" and d.date = ${today})`.mapWith(Number),
      present: sql<number>`(select count(*) from attendance_records r join attendance_days d on d.id = r.day_id where d.school_id = "schools"."id" and d.date = ${today} and r.status in ('present', 'late'))`.mapWith(Number),
      term: sql<string | null>`(select t.name from terms t where t.school_id = "schools"."id" and t.is_current limit 1)`,
      billed: sql<number>`(select coalesce(sum(i.charges_kobo - i.discount_kobo), 0) from invoices i join terms t on t.id = i.term_id where i.school_id = "schools"."id" and t.is_current and i.status <> 'void')`.mapWith(Number),
      collected: sql<number>`(select coalesce(sum(i.paid_kobo), 0) from invoices i join terms t on t.id = i.term_id where i.school_id = "schools"."id" and t.is_current and i.status <> 'void')`.mapWith(Number),
      member: sql<boolean>`exists (select 1 from memberships m where m.school_id = "schools"."id" and m.user_id = ${userId} and m.status = 'active')`,
    })
    .from(schools)
    .where(eq(schools.groupId, groupId))
    .orderBy(asc(schools.name));
  const sum = (k: "students" | "staff" | "marked" | "present" | "billed" | "collected") => rows.reduce((t, r) => t + r[k], 0);
  return {
    group,
    today,
    campuses: rows.map((r) => ({ ...r, outstanding: Math.max(0, r.billed - r.collected), attendance: r.marked ? r.present / r.marked : null })),
    totals: { students: sum("students"), staff: sum("staff"), marked: sum("marked"), present: sum("present"), billed: sum("billed"), collected: sum("collected") },
  };
}

export async function renameGroup(db: DB, userId: string, groupId: string, name: string) {
  await requireGroupAdmin(db, groupId, userId);
  await db.update(schoolGroups).set({ name: groupNameSchema.parse(name) }).where(eq(schoolGroups.id, groupId));
}
