import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { guardians, notifications, outboundMessages, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics, updateClass } from "@/lib/services/academics";
import { paymentAlert, resultAlerts } from "@/lib/services/alerts";
import { createAnnouncement, deleteEvent, listAnnouncements, listEvents, saveEvent } from "@/lib/services/announcements";
import { lagosToday, saveAttendance } from "@/lib/services/attendance";
import { addCredits, buyCredits, getMessaging, saveCommsSettings } from "@/lib/services/credits";
import { parentInbox, parentReply, parentStartConversation, parentThread, staffInbox, staffReply, staffThread, staffUnreadCount, withinHours } from "@/lib/services/messaging";
import { schoolComms } from "@/lib/services/notify";
import { creditBalance, drainOutbox, enqueue, smsCredits, smsSafe, type Transport } from "@/lib/services/outbox";
import { requestLoginCode, verifyLoginCode } from "@/lib/services/parent-auth";
import { getChildDetail, getParentHome, myChildren, requireChild } from "@/lib/services/parent-portal";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, guardianInputSchema, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let teacher: Access;
let classId: string;
let otherClassId: string;
const kids: Record<string, string> = {};
let adaMum: { id: string; name: string };
const codes: string[] = [];
const deliver = async (_d: unknown, code: string) => codes.push(code);

async function setPlan(plan: string) {
  await database.db.update(schools).set({ planKey: plan }).where(eq(schools.id, owner.school.id));
  owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
  teacher = (await loadAccess(database.db, teacher.user.id, owner.school.slug))!;
}

async function outbox(kind?: string) {
  const rows = await database.db.select().from(outboundMessages).where(eq(outboundMessages.schoolId, owner.school.id));
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}

async function login(phoneOrEmail: string) {
  await requestLoginCode(database.db, phoneOrEmail, `10.0.0.${Math.floor(Math.random() * 200)}`, deliver);
  return verifyLoginCode(database.db, phoneOrEmail, codes.at(-1)!);
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Ade", email: "ade@comms.test", password: "CommsSchool1", schoolName: "Comms Academy" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  classId = overview.levels[0].classes[0].id;
  otherClassId = overview.levels[1].classes[0].id;
  const parents: Record<string, { phone: string | null; email: string | null }> = {
    Ada: { phone: "08031112222", email: "ada.mum@comms.test" },
    Bayo: { phone: "08035556666", email: null },
    Chi: { phone: "08037778888", email: null },
  };
  for (const [name, contact] of Object.entries(parents)) {
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Obi", gender: "female", classId: name === "Chi" ? otherClassId : classId }), [
      guardianInputSchema.parse({ name: `${name}'s Mum`, relationship: "Mother", phone: contact.phone, email: contact.email }),
    ]);
    kids[name] = s.id;
  }
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "class_teacher")));
  const { token } = await inviteStaff(database.db, owner, { name: "Mr Form", email: "form@comms.test", roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: "Mr Form", password: "Teacher123" });
  teacher = (await loadAccess(database.db, userId, owner.school.slug))!;
  await updateClass(database.db, owner, classId, { classTeacherId: teacher.membershipId, capacity: null });
});

afterAll(async () => {
  await database.close();
});

describe("message credits and delivery", () => {
  it("counts SMS pages", () => {
    expect(smsCredits("a".repeat(160))).toBe(1);
    expect(smsCredits("a".repeat(161))).toBe(2);
    expect(smsCredits("₦".repeat(70))).toBe(1);
    expect(smsCredits("₦".repeat(71))).toBe(2);
  });

  it("charges SMS to credits, records unpaid ones as failed, and refunds failures", async () => {
    await withTenant(database.db, owner.school.id, (tx) =>
      enqueue(tx, owner.school.id, [
        { channel: "sms", to: "+2348030000001", body: "Hello", kind: "test" },
        { channel: "email", to: "x@comms.test", subject: "Hi", body: "Hello", kind: "test" },
      ]),
    );
    expect((await outbox("test")).map((r) => `${r.channel}:${r.status}`).sort()).toEqual(["email:queued", "sms:failed"]);
    await addCredits(database.db, owner.school.id, 10, "test-topup", "Test top-up");
    const r = await withTenant(database.db, owner.school.id, (tx) => enqueue(tx, owner.school.id, [{ channel: "sms", to: "+2348030000002", body: "a".repeat(200), kind: "test2" }]));
    expect(r).toMatchObject({ queued: 1, credits: 2 });
    expect(await withTenant(database.db, owner.school.id, (tx) => creditBalance(tx))).toBe(8);

    const failing: Transport = async (m) => (m.channel === "sms" ? { ok: false, error: "Network down" } : { ok: true });
    const drained = await drainOutbox(database.db, failing);
    expect(drained).toMatchObject({ sent: 1, failed: 1 });
    expect(await withTenant(database.db, owner.school.id, (tx) => creditBalance(tx))).toBe(10);
    expect(await drainOutbox(database.db, failing)).toEqual({ sent: 0, failed: 0 });
  });

  it("sends SMS in the plain alphabet, so a naira sign or curly quote doesn't triple the cost", async () => {
    const receipt = "Adalin College: received ₦50,000 for Tolu’s fees — Receipt RCT-00125. Balance ₦215,500. Thanks… “Bursar”";
    expect(smsSafe(receipt)).toBe('Adalin College: received N50,000 for Tolu\'s fees - Receipt RCT-00125. Balance N215,500. Thanks... "Bursar"');
    expect(smsCredits(receipt)).toBe(2);
    expect(smsCredits(smsSafe(receipt))).toBe(1);

    await addCredits(database.db, owner.school.id, 5, "plain-topup", "Test top-up");
    const r = await withTenant(database.db, owner.school.id, (tx) =>
      enqueue(tx, owner.school.id, [
        { channel: "sms", to: "+2348030000003", body: receipt, kind: "plain-sms" },
        { channel: "whatsapp", to: "+2348030000003", body: receipt, kind: "plain-wa" },
      ]),
    );
    expect(r.credits).toBe(1 + 2);
    const rows = await outbox("plain-sms");
    expect(rows[0].body).toContain("N50,000");
    expect((await outbox("plain-wa"))[0].body).toContain("₦50,000");
  });
});

describe("parent login by code", () => {
  it("only sends codes to contacts a school has, without saying which", async () => {
    const unknown = await requestLoginCode(database.db, "08099999999", "1.1.1.1", deliver);
    expect(unknown.sent).toBe(false);
    await expect(requestLoginCode(database.db, "not a phone", "1.1.1.1", deliver)).rejects.toThrow(/phone number or email/);
  });

  it("creates the parent's account on first login and links every matching guardian", async () => {
    await requestLoginCode(database.db, "0803 111 2222", "2.2.2.2", deliver);
    await expect(verifyLoginCode(database.db, "08031112222", "000000")).rejects.toThrow(/isn't right/);
    const { userId, linked } = await verifyLoginCode(database.db, "+2348031112222", codes.at(-1)!);
    expect(linked).toBe(1);
    await expect(verifyLoginCode(database.db, "08031112222", codes.at(-1)!)).rejects.toThrow(/expired/);
    adaMum = { id: userId, name: "Ada's Mum" };
    const [g] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(guardians).where(eq(guardians.phone, "+2348031112222")));
    expect(g.userId).toBe(userId);
    // Email works too and lands on the same person only if it's the same contact; here it's a separate login path.
    const again = await login("08031112222");
    expect(again.userId).toBe(userId);
  });

  it("accepts the fixed development code only for contacts a school has", async () => {
    expect((await verifyLoginCode(database.db, "08031112222", "123456")).userId).toBe(adaMum.id);
    await expect(verifyLoginCode(database.db, "08099999998", "123456")).rejects.toThrow(/expired/);
  });

  it("limits how many codes go to one number", async () => {
    await expect(
      (async () => {
        for (let i = 0; i < 4; i++) await requestLoginCode(database.db, "08035556666", "3.3.3.3", deliver);
      })(),
    ).rejects.toThrow(/wait 15 minutes/);
  });
});

describe("parent portal", () => {
  it("is off on Free, on from Basic", async () => {
    const free = await getParentHome(database.db, adaMum);
    expect(free.schools[0].enabled).toBe(false);
    await setPlan("standard");
    const home = await getParentHome(database.db, adaMum);
    expect(home.schools[0].enabled).toBe(true);
    expect(home.childCount).toBe(1);
  });

  it("shows a parent only their own children", async () => {
    expect((await myChildren(database.db, adaMum.id)).map((c) => c.firstName)).toEqual(["Ada"]);
    await expect(requireChild(database.db, adaMum.id, kids.Bayo)).rejects.toThrow(/couldn't find that child/);
    await expect(getChildDetail(database.db, adaMum, kids.Bayo)).rejects.toThrow(/couldn't find that child/);
  });
});

describe("automatic alerts", () => {
  it("tells parents about an absence once, in the app and by email; SMS only when switched on", async () => {
    const today = lagosToday();
    const records = [
      { studentId: kids.Ada, status: "absent" as const },
      { studentId: kids.Bayo, status: "absent" as const },
    ];
    await saveAttendance(database.db, teacher, { classId, date: today, records });
    await saveAttendance(database.db, teacher, { classId, date: today, records });
    const inApp = await database.db.select().from(notifications).where(and(eq(notifications.userId, adaMum.id), eq(notifications.kind, "absence")));
    expect(inApp).toHaveLength(1);
    expect(inApp[0].title).toBe("Ada was marked absent today");
    expect((await outbox("absence")).map((r) => `${r.channel}:${r.to}`)).toEqual(["email:ada.mum@comms.test"]);

    await saveCommsSettings(database.db, owner, { absenceAlerts: true, resultAlerts: true, paymentAlerts: true, smsAlerts: true, parentMessaging: true, limitHours: false });
    await withTenant(database.db, owner.school.id, async (tx) => {
      const school = await schoolComms(tx, owner.school.id);
      expect(school.comms.smsAlerts).toBe(true);
    });
    await withTenant(database.db, owner.school.id, (tx) => resultAlerts(tx, owner.school.id, classId, { id: "t1", name: "First Term", session: "2026/2027" }));
    const results = await outbox("result");
    expect(results.filter((r) => r.channel === "sms").map((r) => r.to).sort()).toEqual(["+2348031112222", "+2348035556666"]);
  });

  it("sends a receipt alert for payments", async () => {
    await withTenant(database.db, owner.school.id, (tx) => paymentAlert(tx, owner.school.id, { studentId: kids.Ada, receiptNo: "RCT-00009", amountKobo: 50_000_00, balanceKobo: 0, invoiceNumber: "INV-00001", paidOn: lagosToday() }));
    const [n] = await database.db.select().from(notifications).where(and(eq(notifications.userId, adaMum.id), eq(notifications.kind, "payment")));
    expect(n.title).toBe("NGN 50,000 received for Ada");
  });
});

describe("announcements and calendar", () => {
  it("reaches the right families and shows up for parents", async () => {
    const r = await createAnnouncement(database.db, owner, { title: "Inter-house sports", body: "Sports day is on Friday. Children should wear house colours.", audience: "classes", classIds: [classId], pinned: false, email: true, sms: false });
    expect(r.families).toBe(2);
    expect((await outbox("announcement")).map((m) => m.to)).toEqual(["ada.mum@comms.test"]);
    await createAnnouncement(database.db, owner, { title: "Staff meeting", body: "Staff meet at 3pm on Monday.", audience: "staff", classIds: [], pinned: false, email: false, sms: false });
    const home = await getParentHome(database.db, adaMum);
    const school = home.schools[0];
    expect(school.enabled && school.news.map((n) => n.a.title)).toEqual(["Inter-house sports"]);
    const teacherView = await listAnnouncements(database.db, teacher);
    expect(teacherView.rows.map((a) => a.a.title)).toContain("Staff meeting");
    await expect(createAnnouncement(database.db, teacher, { title: "Hi", body: "Hello there", audience: "everyone", classIds: [], pinned: false, email: false, sms: false })).rejects.toThrow(/permission/);
  });

  it("keeps staff-only events away from parents", async () => {
    const today = lagosToday();
    await saveEvent(database.db, owner, { title: "Mid-term break", kind: "holiday", startsOn: today, endsOn: today, details: null, forParents: true });
    const inset = await saveEvent(database.db, owner, { title: "Staff training", kind: "meeting", startsOn: today, endsOn: today, details: null, forParents: false });
    expect((await listEvents(database.db, owner, { from: today, to: today })).map((e) => e.title).sort()).toEqual(["Mid-term break", "Staff training"]);
    const school = (await getParentHome(database.db, adaMum)).schools[0];
    expect(school.enabled && school.events.map((e) => e.title)).toEqual(["Mid-term break"]);
    await deleteEvent(database.db, owner, inset.id);
  });
});

describe("messaging", () => {
  let threadId: string;

  it("lets a parent write to the class teacher and keeps the thread private", async () => {
    const c = await parentStartConversation(database.db, adaMum, { studentId: kids.Ada, subject: "Ada's absence", body: "Ada had a fever today. She'll be back tomorrow." });
    threadId = c.id;
    expect(await staffUnreadCount(database.db, teacher)).toBe(1);
    const inbox = await staffInbox(database.db, teacher);
    expect(inbox[0]).toMatchObject({ unread: true, studentName: "Ada Obi" });
    const t = await staffThread(database.db, teacher, threadId);
    expect(t.messages.map((m) => m.body)).toEqual(["Ada had a fever today. She'll be back tomorrow."]);
    expect(await staffUnreadCount(database.db, teacher)).toBe(0);

    await staffReply(database.db, teacher, threadId, "Thank you for letting us know. Get well soon, Ada.");
    const mine = await parentInbox(database.db, adaMum.id);
    expect(mine[0].unread).toBe(true);
    const seen = await parentThread(database.db, adaMum.id, threadId);
    expect(seen.messages).toHaveLength(2);
    expect((await parentInbox(database.db, adaMum.id))[0].unread).toBe(false);

    const stranger = await login("08037778888");
    await expect(parentThread(database.db, stranger.userId, threadId)).rejects.toThrow(/wasn't found/);
    await expect(parentStartConversation(database.db, { id: stranger.userId, name: "x" }, { studentId: kids.Ada, subject: "Hi", body: "Hello" })).rejects.toThrow(/couldn't find that child/);
  });

  it("lets the proprietor see every thread, and respects messaging hours", async () => {
    expect((await staffInbox(database.db, owner)).length).toBe(0);
    expect((await staffInbox(database.db, owner, { all: true })).map((c) => c.c.id)).toEqual([threadId]);
    expect(withinHours({ start: "07:00", end: "18:00" }, new Date("2026-10-16T08:00:00Z"))).toBe(true);
    expect(withinHours({ start: "07:00", end: "18:00" }, new Date("2026-10-16T20:00:00Z"))).toBe(false);
    await saveCommsSettings(database.db, owner, { absenceAlerts: true, resultAlerts: true, paymentAlerts: true, smsAlerts: true, parentMessaging: false, limitHours: false });
    await expect(parentReply(database.db, adaMum, threadId, "One more thing")).rejects.toThrow(/isn't taking messages/);
  });
});

describe("credits", () => {
  it("buys credits in test mode", async () => {
    const before = (await getMessaging(database.db, owner)).balance;
    const { url } = await buyCredits(database.db, owner, "starter", "https://app.test");
    expect(url).toContain("bought=500");
    expect((await getMessaging(database.db, owner)).balance).toBe(before + 500);
    await expect(buyCredits(database.db, teacher, "starter", "https://app.test")).rejects.toThrow(/permission/);
  });
});
