import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { notifications, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import {
  clockIn,
  clockOut,
  decideLeave,
  getMonthSummary,
  getMyDay,
  getRegister,
  hrSettingsSchema,
  leaveSchema,
  markStaff,
  requestLeave,
  saveHrSettings,
  workdaysBetween,
} from "@/lib/services/hr";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let teacher: Access;
let bursar: Access;

// Wednesday 14 October 2026, Lagos is UTC+1.
const at = (hhmm: string, day = "2026-10-14") => new Date(`${day}T${hhmm}:00+01:00`);

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Hr", email: "hr@hr.test", password: "Staffing1", schoolName: "Staff College" });
  await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  teacher = await staff("subject_teacher", "tolu@hr.test");
  bursar = await staff("bursar", "musa@hr.test");
});

afterAll(async () => {
  await database.close();
});

describe("staff attendance", () => {
  it("counts working days only", () => {
    expect(workdaysBetween("2026-10-12", "2026-10-18", [1, 2, 3, 4, 5])).toBe(5);
    expect(workdaysBetween("2026-10-17", "2026-10-18", [1, 2, 3, 4, 5])).toBe(0);
  });

  it("marks staff late after the cut-off, and once only", async () => {
    expect((await clockIn(database.db, teacher, at("07:40"))).status).toBe("present");
    await expect(clockIn(database.db, teacher, at("07:50"))).rejects.toThrow(/clocked in at 07:40/);
    expect((await clockIn(database.db, bursar, at("08:05"))).status).toBe("late");
    expect((await clockOut(database.db, teacher, at("15:30"))).clockOut).toBeTruthy();
    await expect(clockOut(database.db, teacher, at("15:40"))).rejects.toThrow(/clocked out/);
  });

  it("shows managers who's in, and absent once the day closes", async () => {
    await expect(getRegister(database.db, teacher, "2026-10-14", at("12:00"))).rejects.toThrow(/permission/);
    const midday = await getRegister(database.db, owner, "2026-10-14", at("12:00"));
    expect(midday.counts).toMatchObject({ present: 1, late: 1, notIn: 1 });
    const evening = await getRegister(database.db, owner, "2026-10-14", at("17:00"));
    expect(evening.rows.find((r) => r.membershipId === owner.membershipId)?.status).toBe("absent");
    await markStaff(database.db, owner, { membershipId: owner.membershipId, date: "2026-10-14", status: "present", note: "At the ministry" });
    expect((await getRegister(database.db, owner, "2026-10-14", at("17:00"))).counts.absent).toBe(0);
  });

  it("follows the school's own hours", async () => {
    await saveHrSettings(database.db, owner, hrSettingsSchema.parse({ resumeAt: "08:00", lateAfter: "08:15", closeAt: "16:00", workDays: [1, 2, 3, 4, 5], allowances: { annual: 3, sick: 10 } }));
    owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
    bursar = (await loadAccess(database.db, bursar.user.id, owner.school.slug))!;
    expect((await clockIn(database.db, bursar, at("08:10", "2026-10-15"))).status).toBe("present");
  });
});

describe("leave", () => {
  let requestId = "";

  it("checks the balance and overlaps, and tells the approvers", async () => {
    teacher = (await loadAccess(database.db, teacher.user.id, owner.school.slug))!;
    await expect(requestLeave(database.db, teacher, leaveSchema.parse({ kind: "annual", startsOn: "2026-10-19", endsOn: "2026-10-23" }))).rejects.toThrow(/you have 3 annual leave days left/);
    const r = await requestLeave(database.db, teacher, leaveSchema.parse({ kind: "annual", startsOn: "2026-10-19", endsOn: "2026-10-21", reason: "Family wedding in Ibadan" }));
    requestId = r.id;
    expect(r.days).toBe(3);
    await expect(requestLeave(database.db, teacher, leaveSchema.parse({ kind: "sick", startsOn: "2026-10-21", endsOn: "2026-10-22" }))).rejects.toThrow(/already have leave booked/);
    const told = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(notifications).where(eq(notifications.kind, "leave")));
    expect(told.map((n) => n.userId)).toContain(owner.user.id);
    expect(told.map((n) => n.userId)).not.toContain(teacher.user.id);
  });

  it("is decided by someone with the permission, and shows on the register", async () => {
    await expect(decideLeave(database.db, bursar, { id: requestId, approve: true, note: "" })).rejects.toThrow(/permission/);
    await expect(decideLeave(database.db, owner, { id: requestId, approve: false, note: "" })).rejects.toThrow(/Tell them why/);
    await decideLeave(database.db, owner, { id: requestId, approve: true, note: "Enjoy the wedding." });
    const reg = await getRegister(database.db, owner, "2026-10-20", at("17:00", "2026-10-20"));
    expect(reg.rows.find((r) => r.membershipId === teacher.membershipId)?.status).toBe("leave");
    await expect(clockIn(database.db, teacher, at("07:30", "2026-10-20"))).rejects.toThrow(/approved leave/);
    const mine = await getMyDay(database.db, teacher, at("09:00", "2026-10-22"));
    expect(mine.balances.find((b) => b.kind === "annual")).toMatchObject({ allowance: 3, used: 3 });
  });

  it("sums a month per person", async () => {
    const m = await getMonthSummary(database.db, owner, "2026-10", at("18:00", "2026-10-22"));
    const t = m.rows.find((r) => r.membershipId === teacher.membershipId)!;
    expect(t.present).toBe(1);
    expect(t.leave).toBe(3);
    expect(t.usualArrival).toBe("07:40");
    expect(m.workdays).toBe(16);
  });
});
