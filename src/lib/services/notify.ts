import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "../db/client";
import { guardians, notifications, outboundMessages, plans, schools, studentGuardians, students, users, type CommsSettings, type NotifyPrefs } from "../db/schema";
import { enqueue, type Outgoing } from "./outbox";

export type SchoolComms = { id: string; name: string; comms: CommsSettings; smsEnabled: boolean; features: string[] };

export async function schoolComms(tx: Tx, schoolId: string): Promise<SchoolComms> {
  const [row] = await tx
    .select({ id: schools.id, name: schools.name, comms: schools.commsSettings, features: plans.features })
    .from(schools)
    .innerJoin(plans, eq(plans.key, schools.planKey))
    .where(eq(schools.id, schoolId));
  return { ...row, smsEnabled: row.features.includes("sms") };
}

export type GuardianContact = {
  studentId: string;
  studentFirstName: string;
  studentName: string;
  guardianId: string;
  name: string;
  phone: string | null;
  email: string | null;
  userId: string | null;
  prefs: NotifyPrefs;
};

export async function guardianContacts(tx: Tx, studentIds: string[]): Promise<GuardianContact[]> {
  if (!studentIds.length) return [];
  const rows = await tx
    .select({
      studentId: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      guardianId: guardians.id,
      name: guardians.name,
      phone: guardians.phone,
      email: guardians.email,
      userId: guardians.userId,
      prefs: users.notifyPrefs,
    })
    .from(studentGuardians)
    .innerJoin(students, eq(students.id, studentGuardians.studentId))
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .leftJoin(users, eq(users.id, guardians.userId))
    .where(inArray(studentGuardians.studentId, studentIds));
  return rows.map((r) => ({
    studentId: r.studentId,
    studentFirstName: r.firstName,
    studentName: `${r.firstName} ${r.lastName}`,
    guardianId: r.guardianId,
    name: r.name,
    phone: r.phone,
    email: r.email,
    userId: r.userId,
    prefs: r.prefs ?? {},
  }));
}

export type Alert = {
  kind: string;
  title: string;
  body: string;
  link?: string;
  /** Dedupe key per student, e.g. `absence:${id}:${date}`. */
  ref?: string;
  sms?: string;
  email?: { subject: string; text: string };
};

/**
 * Tells each student's guardians: in the app if they have an account, and by email and
 * SMS/WhatsApp as the school's settings and the parent's preferences allow. A ref makes
 * it safe to call twice: anyone already told is skipped.
 */
export async function notifyGuardians(
  tx: Tx,
  school: SchoolComms,
  studentIds: string[],
  build: (c: GuardianContact) => Alert | null,
  channels: { email: boolean; sms: boolean },
) {
  const contacts = await guardianContacts(tx, [...new Set(studentIds)]);
  const outgoing: Outgoing[] = [];
  let told = 0;
  const seenRefs = new Set<string>();
  for (const c of contacts) {
    const alert = build(c);
    if (!alert) continue;
    const ref = alert.ref ? `${alert.ref}:${c.guardianId}` : undefined;
    if (ref) {
      if (seenRefs.has(ref)) continue;
      seenRefs.add(ref);
      const [already] = await tx.select({ id: outboundMessages.id }).from(outboundMessages).where(eq(outboundMessages.ref, ref)).limit(1);
      if (already) continue;
    }
    if (c.userId) {
      const inserted = await tx
        .insert(notifications)
        .values({ schoolId: school.id, userId: c.userId, kind: alert.kind, title: alert.title, body: alert.body, link: alert.link ?? null, ref: ref ?? null })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      if (ref && !inserted.length) continue;
    }
    told++;
    if (channels.email && alert.email && c.email && c.prefs.email !== false) {
      outgoing.push({ channel: "email", to: c.email, subject: alert.email.subject, body: alert.email.text, kind: alert.kind, ref });
    }
    if (channels.sms && school.smsEnabled && alert.sms && c.phone && c.prefs.sms !== false) {
      outgoing.push({ channel: c.prefs.whatsapp ? "whatsapp" : "sms", to: c.phone, body: alert.sms, kind: alert.kind, ref });
    }
  }
  const sent = await enqueue(tx, school.id, outgoing);
  return { told, ...sent };
}

/** In-app notifications for staff or parents by user id. */
export async function notifyUsers(tx: Tx, schoolId: string, userIds: string[], n: Omit<Alert, "sms" | "email">) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await tx
    .insert(notifications)
    .values(unique.map((userId) => ({ schoolId, userId, kind: n.kind, title: n.title, body: n.body, link: n.link ?? null, ref: n.ref ? `${n.ref}:${userId}` : null })))
    .onConflictDoNothing();
}

export async function markNotificationsRead(tx: Tx, userId: string, ids?: string[]) {
  const where = ids?.length ? and(eq(notifications.userId, userId), inArray(notifications.id, ids)) : eq(notifications.userId, userId);
  await tx.update(notifications).set({ readAt: new Date() }).where(where);
}
