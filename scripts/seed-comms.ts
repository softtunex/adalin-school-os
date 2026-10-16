/*
 * Fills the demo school's communication: a parent account linked to a JSS 1 Gold child,
 * announcements, calendar dates, a parent–teacher conversation, SMS credits, and
 * published JSS 1 Gold results. Run with the dev server stopped, after db:seed,
 * db:seed-results and db:seed-fees.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { announcements, classes, guardians, studentGuardians, students, users } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { drainOutbox } from "../src/lib/services/outbox";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { createAnnouncement, saveEvent } from "../src/lib/services/announcements";
import { lagosToday } from "../src/lib/services/attendance";
import { addCredits, saveCommsSettings } from "../src/lib/services/credits";
import { parentStartConversation, staffReply } from "../src/lib/services/messaging";
import { setClassResultStatus } from "../src/lib/services/results";

function plusDays(n: number) {
  const d = new Date(`${lagosToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "greenfield-college"))!;
  const teacherUser = await findUserByEmail(db, "adeyemi3@demo.schoolos.ng");
  const teacher = teacherUser ? await loadAccess(db, teacherUser.id, "greenfield-college") : null;

  const existing = await withTenant(db, owner.school.id, (tx) => tx.select({ id: announcements.id }).from(announcements).limit(1));
  if (existing.length) {
    console.log("Communication already seeded.");
    await database.close();
    return;
  }

  // A parent of the first JSS 1 Gold student signs in with their phone.
  const child = await withTenant(db, owner.school.id, async (tx) => {
    const [gold] = await tx.select().from(classes).where(eq(classes.name, "JSS 1 Gold"));
    const [s] = await tx.select().from(students).where(eq(students.classId, gold.id)).orderBy(asc(students.admissionNo)).limit(1);
    const [g] = await tx
      .select({ guardian: guardians })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(eq(studentGuardians.studentId, s.id))
      .limit(1);
    return { student: s, guardian: g.guardian, classId: gold.id };
  });
  let parentId = child.guardian.userId;
  if (!parentId) {
    const [byPhone] = child.guardian.phone ? await db.select().from(users).where(eq(users.phone, child.guardian.phone)) : [];
    const [u] = byPhone ? [byPhone] : await db.insert(users).values({ name: child.guardian.name, phone: child.guardian.phone, email: child.guardian.email }).returning();
    parentId = u.id;
    await db.update(guardians).set({ userId: parentId }).where(and(eq(guardians.phone, child.guardian.phone!), isNull(guardians.userId)));
  }
  const parent = { id: parentId, name: child.guardian.name };

  await saveCommsSettings(db, owner, { absenceAlerts: true, resultAlerts: true, paymentAlerts: true, smsAlerts: true, parentMessaging: true, limitHours: false });
  await addCredits(db, owner.school.id, 1_500, "demo-credits", "Demo credits");

  await saveEvent(db, owner, { title: "Mid-term break", kind: "holiday", startsOn: plusDays(10), endsOn: plusDays(12), details: "School resumes the following Monday.", forParents: true });
  await saveEvent(db, owner, { title: "PTA meeting", kind: "meeting", startsOn: plusDays(5), endsOn: plusDays(5), details: "School hall, 10am.", forParents: true });
  await saveEvent(db, owner, { title: "Inter-house sports", kind: "sports", startsOn: plusDays(18), endsOn: plusDays(18), details: null, forParents: true });
  await saveEvent(db, owner, { title: "First term examinations", kind: "exam", startsOn: plusDays(30), endsOn: plusDays(39), details: null, forParents: true });
  await saveEvent(db, owner, { title: "Staff training day", kind: "meeting", startsOn: plusDays(3), endsOn: plusDays(3), details: "No lessons for JSS 1.", forParents: false });

  await createAnnouncement(db, owner, {
    title: "Mid-term break",
    body: "Mid-term break runs from Wednesday to Friday next week. School resumes on Monday. Please make sure all fees for the term are settled before the break.",
    audience: "everyone",
    classIds: [],
    pinned: true,
    email: false,
    sms: false,
  });
  await createAnnouncement(db, owner, {
    title: "PTA meeting this Saturday",
    body: "All parents are invited to the PTA meeting in the school hall at 10am. We'll discuss the new school bus routes and the end-of-term party.",
    audience: "parents",
    classIds: [],
    pinned: false,
    email: false,
    sms: false,
  });
  await createAnnouncement(db, owner, {
    title: "JSS 1 Gold excursion",
    body: "JSS 1 Gold will visit the National Museum, Onikan, next Thursday. Children should wear their sports wear and bring a packed lunch.",
    audience: "classes",
    classIds: [child.classId],
    pinned: false,
    email: false,
    sms: false,
  });

  const c = await parentStartConversation(db, parent, {
    studentId: child.student.id,
    subject: `${child.student.firstName}'s maths homework`,
    body: `Good afternoon. ${child.student.firstName} says the maths homework is due tomorrow but the textbook is out of stock at the bookshop. What should we do?`,
  });
  if (teacher) await staffReply(db, teacher, c.id, `Good afternoon. Thank you for letting me know. ${child.student.firstName} can use the photocopied pages I'll give out in class tomorrow, and hand in the homework on Friday instead.`);

  // Publish JSS 1 Gold results so the parent has a report card.
  try {
    for (const status of ["reviewed", "approved", "published"] as const) await setClassResultStatus(db, owner, { classId: child.classId, status, nextTermBegins: plusDays(60) });
  } catch (error) {
    console.warn("Results not published:", (error as Error).message);
  }

  console.log(`Done. Parent login: ${child.guardian.phone} (${child.guardian.name}, parent of ${child.student.firstName} ${child.student.lastName}).`);
  await drainOutbox(db, async (m) => (console.info(`[${m.channel}] ${m.to}`), { ok: true, ref: "seed" }), 5000);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
