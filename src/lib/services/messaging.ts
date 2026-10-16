import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { classes, conversationParticipants, conversations, guardians, membershipRoles, memberships, messages, roles, schools, studentGuardians, students, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { can, requirePermission, type Access } from "./access";
import { studentScope } from "./academics";
import { notifyUsers, schoolComms } from "./notify";
import { enqueue } from "./outbox";
import { requireChild } from "./parent-portal";

/*
 * Parent ↔ staff conversations, always about one child. Staff start them with a child's
 * parents; parents start them with their child's class teacher (or the principal if the
 * class has none). Proprietors and principals can read every thread for safeguarding.
 */

export const messageBody = z.string().trim().min(1, "Write a message.").max(2000, "Keep messages under 2,000 characters.");
export const newConversationSchema = z.object({
  studentId: z.string().uuid(),
  subject: z.string().trim().min(2, "Add a subject.").max(120),
  body: messageBody,
});

function lagosTime(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

/** Parents can only send within the school's messaging hours, if it set any. */
export function withinHours(hours: { start: string; end: string } | undefined, now = new Date()) {
  if (!hours) return true;
  const t = lagosTime(now);
  return hours.start <= hours.end ? t >= hours.start && t <= hours.end : t >= hours.start || t <= hours.end;
}

async function insertMessage(tx: Tx, schoolId: string, conversationId: string, sender: { id: string; name: string }, body: string) {
  const [msg] = await tx.insert(messages).values({ schoolId, conversationId, senderId: sender.id, senderName: sender.name, body }).returning();
  await tx.update(conversations).set({ lastMessageAt: msg.createdAt }).where(eq(conversations.id, conversationId));
  await tx
    .update(conversationParticipants)
    .set({ lastReadAt: msg.createdAt })
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, sender.id)));
  return msg;
}

/** Tells everyone else in the thread: in-app for all, plus an email for parents who allow it. */
async function announceMessage(tx: Tx, schoolId: string, conversationId: string, sender: { id: string; name: string }, subject: string, body: string, slug: string) {
  const others = await tx
    .select({ userId: conversationParticipants.userId, role: conversationParticipants.role, email: users.email, prefs: users.notifyPrefs })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(and(eq(conversationParticipants.conversationId, conversationId), ne(conversationParticipants.userId, sender.id)));
  for (const role of ["staff", "parent"] as const) {
    const ids = others.filter((o) => o.role === role).map((o) => o.userId);
    await notifyUsers(tx, schoolId, ids, {
      kind: "message",
      title: `${sender.name}: ${subject}`,
      body: body.slice(0, 160),
      link: role === "staff" ? `/s/${slug}/messages/${conversationId}` : `/p/messages/${conversationId}`,
    });
  }
  const school = await schoolComms(tx, schoolId);
  await enqueue(
    tx,
    schoolId,
    others
      .filter((o) => o.role === "parent" && o.email && o.prefs?.email !== false)
      .map((o) => ({
        channel: "email" as const,
        to: o.email!,
        subject: `New message from ${sender.name} at ${school.name}`,
        body: `${sender.name} wrote about "${subject}":\n\n${body}\n\nReply in the parent app${process.env.APP_URL ? `: ${process.env.APP_URL.replace(/\/$/, "")}/p/messages/${conversationId}` : "."}\n\n${school.name}`,
        kind: "message",
      })),
  );
}

// ---------- Staff ----------

export async function staffInbox(db: DB, access: Access, opts: { all?: boolean } = {}) {
  requireFeature(access.plan, "messaging");
  requirePermission(access, "comms:message");
  const all = !!opts.all && can(access, "comms:moderate");
  return withTenant(db, access.school.id, async (tx) => {
    const mine = tx.select({ id: conversationParticipants.conversationId }).from(conversationParticipants).where(eq(conversationParticipants.userId, access.user.id));
    const rows = await tx
      .select({
        c: conversations,
        studentName: sql<string | null>`${students.firstName} || ' ' || ${students.lastName}`,
        lastReadAt: conversationParticipants.lastReadAt,
        participant: conversationParticipants.userId,
        last: sql<string | null>`(select body from ${messages} m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
        lastFrom: sql<string | null>`(select sender_name from ${messages} m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
        parents: sql<string | null>`(select string_agg(u.name, ', ') from ${conversationParticipants} p join ${users} u on u.id = p.user_id where p.conversation_id = ${conversations.id} and p.role = 'parent')`,
      })
      .from(conversations)
      .leftJoin(students, eq(students.id, conversations.studentId))
      .leftJoin(conversationParticipants, and(eq(conversationParticipants.conversationId, conversations.id), eq(conversationParticipants.userId, access.user.id)))
      .where(all ? undefined : inArray(conversations.id, mine))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(200);
    return rows.map((r) => ({
      ...r,
      mine: !!r.participant,
      unread: !!r.participant && (!r.lastReadAt || r.lastReadAt < r.c.lastMessageAt) && r.lastFrom !== access.user.name,
    }));
  });
}

export async function staffThread(db: DB, access: Access, conversationId: string) {
  requireFeature(access.plan, "messaging");
  requirePermission(access, "comms:message");
  return withTenant(db, access.school.id, async (tx) => {
    const [c] = await tx.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!c) throw new AppError("That conversation wasn't found.", "not_found");
    const people = await tx
      .select({ userId: conversationParticipants.userId, role: conversationParticipants.role, name: users.name })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(eq(conversationParticipants.conversationId, conversationId));
    const participant = people.some((p) => p.userId === access.user.id);
    if (!participant && !can(access, "comms:moderate")) throw new AppError("That conversation wasn't found.", "not_found");
    const [student] = c.studentId ? await tx.select({ id: students.id, firstName: students.firstName, lastName: students.lastName, classId: students.classId }).from(students).where(eq(students.id, c.studentId)) : [];
    const thread = await tx.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
    if (participant) await tx.update(conversationParticipants).set({ lastReadAt: new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, access.user.id)));
    return { conversation: c, people, participant, student: student ?? null, messages: thread };
  });
}

/** A teacher (or office) writes to a child's parents. Only parents on the app can receive in-app messages. */
export async function startStaffConversation(db: DB, access: Access, input: z.infer<typeof newConversationSchema>) {
  requireFeature(access.plan, "messaging");
  requirePermission(access, "comms:message");
  return withTenant(db, access.school.id, async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, input.studentId));
    if (!student) throw new AppError("That student wasn't found.", "not_found");
    const scope = await studentScope(tx, access);
    if (scope !== "all" && (!student.classId || !scope.includes(student.classId))) throw new AppError("You can only message parents of children you teach.", "forbidden");
    const parents = await tx
      .select({ userId: guardians.userId })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(and(eq(studentGuardians.studentId, student.id), sql`${guardians.userId} is not null`));
    const parentIds = [...new Set(parents.map((p) => p.userId!))].filter((id) => id !== access.user.id);
    if (!parentIds.length) throw new AppError(`None of ${student.firstName}'s parents use the parent app yet. They can sign in with the phone number or email the school has for them.`, "conflict");
    const [c] = await tx.insert(conversations).values({ schoolId: access.school.id, subject: input.subject, studentId: student.id, createdBy: access.user.id }).returning();
    await tx.insert(conversationParticipants).values([
      { schoolId: access.school.id, conversationId: c.id, userId: access.user.id, role: "staff" as const },
      ...parentIds.map((userId) => ({ schoolId: access.school.id, conversationId: c.id, userId, role: "parent" as const })),
    ]);
    await insertMessage(tx, access.school.id, c.id, { id: access.user.id, name: access.user.name }, input.body);
    await announceMessage(tx, access.school.id, c.id, { id: access.user.id, name: access.user.name }, input.subject, input.body, access.school.slug);
    return c;
  });
}

export async function staffReply(db: DB, access: Access, conversationId: string, body: string) {
  requireFeature(access.plan, "messaging");
  requirePermission(access, "comms:message");
  const text = messageBody.parse(body);
  await withTenant(db, access.school.id, async (tx) => {
    const [c] = await tx.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!c) throw new AppError("That conversation wasn't found.", "not_found");
    const [me] = await tx.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, access.user.id)));
    if (!me) {
      // A moderator joining a thread becomes a participant, visibly.
      if (!can(access, "comms:moderate")) throw new AppError("That conversation wasn't found.", "not_found");
      await tx.insert(conversationParticipants).values({ schoolId: access.school.id, conversationId, userId: access.user.id, role: "staff" });
    }
    await insertMessage(tx, access.school.id, conversationId, { id: access.user.id, name: access.user.name }, text);
    await announceMessage(tx, access.school.id, conversationId, { id: access.user.id, name: access.user.name }, c.subject, text, access.school.slug);
  });
}

// ---------- Parents ----------

/** Every conversation the parent is in, across schools (owner role, filtered to their own id). */
export async function parentInbox(db: DB, userId: string) {
  const rows = await db
    .select({
      c: conversations,
      schoolName: schools.name,
      lastReadAt: conversationParticipants.lastReadAt,
      studentName: sql<string | null>`${students.firstName} || ' ' || ${students.lastName}`,
      last: sql<string | null>`(select body from ${messages} m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
      lastFromMe: sql<boolean>`(select sender_id = ${userId} from ${messages} m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
      staff: sql<string | null>`(select string_agg(u.name, ', ') from ${conversationParticipants} p join ${users} u on u.id = p.user_id where p.conversation_id = ${conversations.id} and p.role = 'staff')`,
    })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .innerJoin(schools, eq(schools.id, conversations.schoolId))
    .leftJoin(students, eq(students.id, conversations.studentId))
    .where(eq(conversationParticipants.userId, userId))
    .orderBy(desc(conversations.lastMessageAt));
  return rows.map((r) => ({ ...r, unread: !r.lastFromMe && (!r.lastReadAt || r.lastReadAt < r.c.lastMessageAt) }));
}

async function parentConversationSchool(db: DB, userId: string, conversationId: string) {
  const [row] = await db
    .select({ schoolId: conversationParticipants.schoolId })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
  if (!row) throw new AppError("That conversation wasn't found.", "not_found");
  return row.schoolId;
}

export async function parentThread(db: DB, userId: string, conversationId: string) {
  const schoolId = await parentConversationSchool(db, userId, conversationId);
  return withTenant(db, schoolId, async (tx) => {
    const [c] = await tx.select().from(conversations).where(eq(conversations.id, conversationId));
    const [school] = await tx.select({ name: schools.name, comms: schools.commsSettings }).from(schools).where(eq(schools.id, schoolId));
    const people = await tx
      .select({ userId: conversationParticipants.userId, role: conversationParticipants.role, name: users.name })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(eq(conversationParticipants.conversationId, conversationId));
    const thread = await tx.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
    await tx.update(conversationParticipants).set({ lastReadAt: new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
    return { conversation: c, school, people, messages: thread, open: withinHours(school.comms.messagingHours), hours: school.comms.messagingHours ?? null };
  });
}

/** Staff a parent can write to about a child: the class teacher, else the principal, else the proprietor. */
async function recipientsFor(tx: Tx, classId: string | null) {
  if (classId) {
    const [teacher] = await tx
      .select({ userId: memberships.userId })
      .from(classes)
      .innerJoin(memberships, eq(memberships.id, classes.classTeacherId))
      .where(and(eq(classes.id, classId), eq(memberships.status, "active")));
    if (teacher) return [teacher.userId];
  }
  for (const key of ["principal", "owner"]) {
    const rows = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .where(and(eq(roles.key, key), eq(memberships.status, "active")));
    if (rows.length) return rows.map((r) => r.userId);
  }
  return [];
}

async function parentSendRules(tx: Tx, schoolId: string) {
  const school = await schoolComms(tx, schoolId);
  if (!school.features.includes("messaging")) throw new AppError(`${school.name} hasn't switched on messaging.`, "upgrade");
  if (school.comms.parentMessaging === false) throw new AppError(`${school.name} isn't taking messages through the app at the moment.`, "conflict");
  if (!withinHours(school.comms.messagingHours)) {
    const h = school.comms.messagingHours!;
    throw new AppError(`${school.name} takes messages between ${h.start} and ${h.end}. Please send it then.`, "conflict");
  }
  return school;
}

export async function parentStartConversation(db: DB, user: { id: string; name: string }, input: z.infer<typeof newConversationSchema>) {
  const child = await requireChild(db, user.id, input.studentId);
  return withTenant(db, child.schoolId, async (tx) => {
    await parentSendRules(tx, child.schoolId);
    const staff = (await recipientsFor(tx, child.classId)).filter((id) => id !== user.id);
    if (!staff.length) throw new AppError("There's nobody at the school to receive this yet. Please call the school.", "conflict");
    const [slug] = await tx.select({ slug: schools.slug }).from(schools).where(eq(schools.id, child.schoolId));
    const [c] = await tx.insert(conversations).values({ schoolId: child.schoolId, subject: input.subject, studentId: child.studentId, createdBy: user.id }).returning();
    await tx.insert(conversationParticipants).values([
      { schoolId: child.schoolId, conversationId: c.id, userId: user.id, role: "parent" as const },
      ...staff.map((userId) => ({ schoolId: child.schoolId, conversationId: c.id, userId, role: "staff" as const })),
    ]);
    await insertMessage(tx, child.schoolId, c.id, user, input.body);
    await announceMessage(tx, child.schoolId, c.id, user, input.subject, input.body, slug.slug);
    return c;
  });
}

export async function parentReply(db: DB, user: { id: string; name: string }, conversationId: string, body: string) {
  const text = messageBody.parse(body);
  const schoolId = await parentConversationSchool(db, user.id, conversationId);
  await withTenant(db, schoolId, async (tx) => {
    await parentSendRules(tx, schoolId);
    const [c] = await tx.select().from(conversations).where(eq(conversations.id, conversationId));
    const [slug] = await tx.select({ slug: schools.slug }).from(schools).where(eq(schools.id, schoolId));
    await insertMessage(tx, schoolId, conversationId, user, text);
    await announceMessage(tx, schoolId, conversationId, user, c.subject, text, slug.slug);
  });
}

export async function staffUnreadCount(db: DB, access: Access) {
  if (!access.plan.features.includes("messaging")) return 0;
  return withTenant(db, access.school.id, async (tx) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
      .where(
        and(
          eq(conversationParticipants.userId, access.user.id),
          or(isNull(conversationParticipants.lastReadAt), gt(conversations.lastMessageAt, conversationParticipants.lastReadAt))!,
        ),
      );
    return row.n;
  });
}

/** Children this staff member can write to the parents of, and whether any parent is on the app. */
export async function messageableStudents(db: DB, access: Access) {
  requireFeature(access.plan, "messaging");
  requirePermission(access, "comms:message");
  return withTenant(db, access.school.id, async (tx) => {
    const scope = await studentScope(tx, access);
    if (scope !== "all" && !scope.length) return [];
    const rows = await tx
      .select({
        id: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        className: classes.name,
        onApp: sql<boolean>`exists (select 1 from ${studentGuardians} sg join ${guardians} g on g.id = sg.guardian_id where sg.student_id = ${students.id} and g.user_id is not null)`,
      })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(and(eq(students.status, "active"), scope === "all" ? sql`true` : inArray(students.classId, scope)))
      .orderBy(asc(classes.name), asc(students.firstName));
    return rows;
  });
}
