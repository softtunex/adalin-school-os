import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { getClassTimetable, getTeacherTimetable, getTimetableSetup, saveSchedule, scheduleSchema, setSlot, swapSlots } from "@/lib/services/timetable";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let teacher: Access;
let gold: string;
let diamond: string;
let maths: string;
let english: string;

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mr Eze", email: "eze@tt.test", password: "Timetable1", schoolName: "Timetable High" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold", "Diamond"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  [gold, diamond] = overview.levels[0].classes.map((c) => c.id).sort((a, b) => (overview.levels[0].classes.find((c) => c.id === a)!.name < overview.levels[0].classes.find((c) => c.id === b)!.name ? 1 : -1));
  maths = overview.subjects.find((s) => s.name === "Mathematics")!.id;
  english = overview.subjects.find((s) => s.name === "English Studies")!.id;
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "subject_teacher")));
  const { token } = await inviteStaff(database.db, owner, { name: "Mrs Ade", email: "ade@tt.test", roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: "Mrs Ade", password: "Teacher123" });
  teacher = (await loadAccess(database.db, userId, owner.school.slug))!;
});

afterAll(async () => {
  await database.close();
});

describe("timetable", () => {
  it("is on the Basic plan", async () => {
    await expect(getTimetableSetup(database.db, owner)).rejects.toThrow(/Basic plan/);
    await database.db.update(schools).set({ planKey: "basic" }).where(eq(schools.id, owner.school.id));
    owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
    teacher = (await loadAccess(database.db, teacher.user.id, owner.school.slug))!;
  });

  it("starts every school with a typical day of 8 lessons and 2 breaks", async () => {
    const setup = await getTimetableSetup(database.db, owner);
    expect(setup.schedules).toHaveLength(1);
    const kinds = setup.schedules[0].periods.map((p) => p.kind);
    expect(kinds.filter((k) => k === "lesson")).toHaveLength(8);
    expect(kinds.filter((k) => k === "break")).toHaveLength(2);
  });

  it("catches a teacher booked in two classes at once, unless overridden", async () => {
    const week = await getClassTimetable(database.db, owner, gold);
    const [p1, p2] = week.schedule.periods.filter((p) => p.kind === "lesson");
    const brk = week.schedule.periods.find((p) => p.kind === "break")!;
    const base = { termId: week.term.id, day: 1, room: null, note: null, force: false };

    expect(await setSlot(database.db, owner, { ...base, classId: gold, periodId: p1.id, subjectId: maths, teacherId: teacher.membershipId })).toMatchObject({ ok: true });
    const clash = await setSlot(database.db, owner, { ...base, classId: diamond, periodId: p1.id, subjectId: english, teacherId: teacher.membershipId });
    expect(clash.ok).toBe(false);
    expect(clash.clashes[0]).toMatch(/Mrs Ade already teaches JSS 1 Gold then/);
    expect(await setSlot(database.db, owner, { ...base, classId: diamond, periodId: p1.id, subjectId: english, teacherId: teacher.membershipId, force: true })).toMatchObject({ ok: true });

    await expect(setSlot(database.db, owner, { ...base, classId: gold, periodId: brk.id, subjectId: maths, teacherId: null })).rejects.toThrow(/is a break/);
    await expect(setSlot(database.db, teacher, { ...base, classId: gold, periodId: p2.id, subjectId: maths, teacherId: null })).rejects.toThrow(/permission/);

    // Same room, same time.
    await setSlot(database.db, owner, { ...base, classId: gold, periodId: p2.id, subjectId: maths, teacherId: null, room: "Lab 1" });
    const room = await setSlot(database.db, owner, { ...base, classId: diamond, periodId: p2.id, subjectId: english, teacherId: null, room: "lab 1" });
    expect(room.clashes[0]).toMatch(/Lab 1 is already in use by JSS 1 Gold/);
  });

  it("swaps two lessons by drag and drop and shows the teacher's week", async () => {
    const week = await getClassTimetable(database.db, owner, gold);
    const [p1, , p3] = week.schedule.periods.filter((p) => p.kind === "lesson");
    expect(await swapSlots(database.db, owner, { termId: week.term.id, classId: gold, a: { day: 1, periodId: p1.id }, b: { day: 2, periodId: p3.id } })).toMatchObject({ ok: true });
    const after = await getClassTimetable(database.db, owner, gold);
    const mathsSlot = after.slots.find((s) => s.subjectId === maths && s.teacherId === teacher.membershipId)!;
    expect(mathsSlot).toMatchObject({ day: 2, periodId: p3.id });
    expect(after.subjects.find((s) => s.id === maths)!.lessons).toBe(2);

    const mine = await getTeacherTimetable(database.db, teacher);
    expect(mine.lessons.map((l) => `${l.className}:${l.day}`).sort()).toEqual(["JSS 1 Diamond:1", "JSS 1 Gold:2"]);
  });

  it("checks bell schedules make sense, and drops lessons from a period that becomes a break", async () => {
    const setup = await getTimetableSetup(database.db, owner);
    const s = setup.schedules[0];
    const periods = s.periods.map((p) => ({ id: p.id, label: p.label, startsAt: p.startsAt, endsAt: p.endsAt, kind: p.kind }));
    expect(() => scheduleSchema.parse({ id: s.id, name: s.name, days: s.days, periods: [...periods, { label: "9", startsAt: "14:00", endsAt: "14:40", kind: "lesson" }] })).toThrow(/overlap/);
    expect(() => scheduleSchema.parse({ name: "Bad", days: [1], periods: [{ label: "1", startsAt: "09:00", endsAt: "08:00", kind: "lesson" }] })).toThrow(/end after it starts/);
    const firstLesson = periods.find((p) => p.kind === "lesson")!;
    await saveSchedule(database.db, owner, { id: s.id, name: s.name, days: s.days, periods: periods.map((p) => (p.id === firstLesson.id ? { ...p, kind: "break" as const, label: "Devotion" } : p)) });
    const diamondWeek = await getClassTimetable(database.db, owner, diamond);
    expect(diamondWeek.slots.filter((x) => x.periodId === firstLesson.id)).toHaveLength(0);
  });
});
