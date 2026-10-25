import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { announcementReads, announcements, calendarEvents, classes, EVENT_KINDS, guardians, memberships, membershipRoles, roles, studentGuardians, students, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { guardianContacts, notifyUsers } from "./notify";
import { enqueue, smsCredits, smsSafe, type Outgoing } from "./outbox";

const actor = (access: Access, ip?: string | null) => ({ userId: access.user.id, name: access.user.name, ip });

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, "Give it a short title.").max(120),
    body: z.string().trim().min(3, "Write the announcement.").max(4000),
    audience: z.enum(["everyone", "staff", "parents", "students", "classes"]),
    classIds: z.array(z.string().uuid()).default([]),
    pinned: z.boolean().default(false),
    email: z.boolean().default(false),
    sms: z.boolean().default(false),
  })
  .refine((v) => v.audience !== "classes" || v.classIds.length > 0, { message: "Choose at least one class.", path: ["classIds"] });

/** Active staff user ids, plus class teachers of the given classes. */
async function staffUsers(tx: Tx, onlyClassTeachersOf?: string[]) {
  if (onlyClassTeachersOf) {
    if (!onlyClassTeachersOf.length) return [];
    const rows = await tx
      .select({ userId: memberships.userId })
      .from(classes)
      .innerJoin(memberships, eq(memberships.id, classes.classTeacherId))
      .where(and(inArray(classes.id, onlyClassTeachersOf), eq(memberships.status, "active")));
    return rows.map((r) => r.userId);
  }
  const rows = await tx
    .selectDistinct({ userId: memberships.userId, email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff")));
  return rows.map((r) => r.userId);
}

async function audienceStudents(tx: Tx, audience: string, classIds: string[]) {
  if (audience === "staff" || audience === "students") return [];
  const rows = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.status, "active"), audience === "classes" ? inArray(students.classId, classIds) : sql`true`));
  return rows.map((r) => r.id);
}

/** Who an announcement reaches, for the composer's preview. */
export async function audienceSize(db: DB, access: Access, input: { audience: string; classIds: string[] }) {
  requirePermission(access, "comms:announce");
  return withTenant(db, access.school.id, async (tx) => {
    const studentIds = await audienceStudents(tx, input.audience, input.classIds);
    const contacts = await guardianContacts(tx, studentIds);
    const families = new Set(contacts.map((c) => c.guardianId));
    const phones = new Set(contacts.filter((c) => c.phone).map((c) => c.phone));
    const emails = new Set(contacts.filter((c) => c.email).map((c) => c.email));
    const staff = input.audience === "everyone" || input.audience === "staff" ? (await staffUsers(tx)).length : 0;
    return { parents: families.size, withPhone: phones.size, withEmail: emails.size, staff };
  });
}

export async function createAnnouncement(db: DB, access: Access, input: z.infer<typeof announcementSchema>, ip?: string | null) {
  requirePermission(access, "comms:announce");
  requireFeature(access.plan, "announcements");
  if (input.sms) {
    requirePermission(access, "comms:sms");
    requireFeature(access.plan, "sms");
  }
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({
        schoolId: access.school.id,
        title: input.title,
        body: input.body,
        audience: input.audience,
        classIds: input.audience === "classes" ? input.classIds : [],
        pinned: input.pinned,
        channels: [input.email ? "email" : null, input.sms ? "sms" : null].filter((c): c is string => !!c),
        authorId: access.user.id,
        authorName: access.user.name,
      })
      .returning();

    // Parents with accounts and staff get it in the app; email and SMS copies go to every family on file.
    const studentIds = await audienceStudents(tx, input.audience, input.classIds);
    const contacts = await guardianContacts(tx, studentIds);
    const link = (forParent: boolean) => (forParent ? `/p?announcement=${row.id}` : `/s/${access.school.slug}/announcements`);
    const parentUsers = [...new Set(contacts.map((c) => c.userId).filter((u): u is string => !!u))];
    await notifyUsers(tx, access.school.id, parentUsers, { kind: "announcement", title: input.title, body: input.body.slice(0, 200), link: link(true), ref: `announcement:${row.id}` });
    const staff =
      input.audience === "everyone" || input.audience === "staff" ? await staffUsers(tx) : input.audience === "classes" ? await staffUsers(tx, input.classIds) : [];
    await notifyUsers(tx, access.school.id, staff.filter((u) => u !== access.user.id), { kind: "announcement", title: input.title, body: input.body.slice(0, 200), link: link(false), ref: `announcement:${row.id}` });

    const outgoing: Outgoing[] = [];
    const byGuardian = new Map(contacts.map((c) => [c.guardianId, c]));
    for (const c of byGuardian.values()) {
      if (input.email && c.email && c.prefs.email !== false) {
        outgoing.push({ channel: "email", to: c.email, subject: `${access.school.name}: ${input.title}`, body: `${input.title}\n\n${input.body}\n\n${access.school.name}`, kind: "announcement", ref: `announcement:${row.id}:${c.guardianId}` });
      }
      if (input.sms && c.phone && c.prefs.sms !== false) {
        outgoing.push({ channel: c.prefs.whatsapp ? "whatsapp" : "sms", to: c.phone, body: smsText(access.school.name, input.title, input.body), kind: "announcement", ref: `announcement:${row.id}:${c.guardianId}` });
      }
    }
    const sent = await enqueue(tx, access.school.id, outgoing);
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "comms.announcement",
      summary: `Posted "${input.title}" to ${describeAudience(input.audience, input.classIds.length)}${outgoing.length ? ` (${outgoing.length} emails/SMS)` : ""}`,
      entityType: "announcement",
      entityId: row.id,
    });
    return { announcement: row, families: byGuardian.size, ...sent };
  });
}

/** SMS copy of an announcement: title and as much of the body as fits two pages. */
export function smsText(school: string, title: string, body: string) {
  // Plain SMS characters throughout (see smsSafe), so the length and cost worked out here hold.
  const head = smsSafe(`${school}: ${title}. `);
  const room = 300 - head.length;
  const text = smsSafe(body.replace(/\s+/g, " ").trim());
  const full = head + (text.length > room ? `${text.slice(0, room - 3).trimEnd()}...` : text);
  return smsCredits(full) > 2 ? `${head}${text.slice(0, Math.max(0, 130 - head.length))}...` : full;
}

export function describeAudience(audience: string, classes: number) {
  return audience === "everyone" ? "everyone" : audience === "staff" ? "staff" : audience === "parents" ? "all parents" : audience === "students" ? "students" : `${classes} class${classes === 1 ? "" : "es"}`;
}

export async function listAnnouncements(db: DB, access: Access) {
  requireFeature(access.plan, "announcements");
  return withTenant(db, access.school.id, async (tx) => {
    const staffAudience = sql`${announcements.audience} in ('everyone', 'staff') or ${announcements.authorId} = ${access.user.id}`;
    const canPost = access.permissions.has("comms:announce");
    const rows = await tx
      .select({ a: announcements, reads: sql<number>`(select count(*) from ${announcementReads} r where r.announcement_id = ${announcements.id})`.mapWith(Number) })
      .from(announcements)
      .where(canPost ? undefined : staffAudience)
      .orderBy(desc(announcements.pinned), desc(announcements.publishedAt))
      .limit(100);
    const classRows = await tx.select({ id: classes.id, name: classes.name }).from(classes).orderBy(asc(classes.name));
    const [{ parents }] = await tx.select({ parents: count() }).from(guardians).where(isNotNull(guardians.userId));
    return { rows, classes: classRows, parentsOnApp: parents };
  });
}

export async function deleteAnnouncement(db: DB, access: Access, id: string, ip?: string | null) {
  requirePermission(access, "comms:announce");
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.delete(announcements).where(eq(announcements.id, id)).returning();
    if (!row) throw new AppError("That announcement wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "comms.announcement_deleted", summary: `Deleted the announcement "${row.title}"` });
  });
}

/** Families (guardians) linked to the app vs not, for the "invite parents" nudge. */
export async function parentAppReach(db: DB, access: Access) {
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ total: count(), linked: sql<number>`count(*) filter (where ${guardians.userId} is not null)`.mapWith(Number) })
      .from(guardians)
      .innerJoin(studentGuardians, eq(studentGuardians.guardianId, guardians.id));
    return row;
  });
}

// ---------- Calendar ----------

export const eventSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(2, "Name the event.").max(120),
    kind: z.enum(EVENT_KINDS),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
    endsOn: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
    details: z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), z.string().trim().max(1000).nullable().optional()),
    forParents: z.boolean().default(true),
  })
  .transform((v) => ({ ...v, endsOn: v.endsOn ?? v.startsOn }))
  .refine((v) => v.endsOn >= v.startsOn, { message: "The end date is before the start date.", path: ["endsOn"] });

export async function listEvents(db: DB, access: Access, range: { from: string; to: string }) {
  requireFeature(access.plan, "announcements");
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select()
      .from(calendarEvents)
      .where(and(lte(calendarEvents.startsOn, range.to), gte(calendarEvents.endsOn, range.from)))
      .orderBy(asc(calendarEvents.startsOn), asc(calendarEvents.title)),
  );
}

export async function saveEvent(db: DB, access: Access, input: z.output<typeof eventSchema>, ip?: string | null) {
  requirePermission(access, "comms:announce");
  requireFeature(access.plan, "announcements");
  return withTenant(db, access.school.id, async (tx) => {
    const values = { title: input.title, kind: input.kind, startsOn: input.startsOn, endsOn: input.endsOn, details: input.details ?? null, forParents: input.forParents };
    const [row] = input.id
      ? await tx.update(calendarEvents).set(values).where(eq(calendarEvents.id, input.id)).returning()
      : await tx.insert(calendarEvents).values({ schoolId: access.school.id, ...values, createdBy: access.user.id }).returning();
    if (!row) throw new AppError("That event wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: input.id ? "calendar.updated" : "calendar.created", summary: `${input.id ? "Updated" : "Added"} "${row.title}" on ${row.startsOn}` });
    return row;
  });
}

export async function deleteEvent(db: DB, access: Access, id: string, ip?: string | null) {
  requirePermission(access, "comms:announce");
  await withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning();
    if (!row) throw new AppError("That event wasn't found.", "not_found");
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "calendar.deleted", summary: `Removed "${row.title}" from the calendar` });
  });
}

