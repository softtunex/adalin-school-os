import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { notifications, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import {
  assignBed,
  bedSchema,
  cancelExeat,
  createExeat,
  exeatSchema,
  getChildBoarding,
  hostelOverview,
  hostelSchema,
  listExeats,
  moveExeat,
  requestExeat,
  roomSchema,
  saveHostel,
  saveRoom,
} from "@/lib/services/hostel";
import { requestLoginCode, verifyLoginCode } from "@/lib/services/parent-auth";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, guardianInputSchema, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let warden: Access;
let teacher: Access;
let parentId: string;
const kids: Record<string, string> = {};
const rooms: Record<string, string> = {};
const codes: string[] = [];

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

/** "2026-10-23T15:00" a number of days from now, in Lagos time. */
function at(days: number, time: string) {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })}T${time}`;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Board", email: "board@hostel.test", password: "Hostel123", schoolName: "Boarding College" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const gold = (await getAcademicOverview(database.db, owner)).levels[0].classes[0].id;
  warden = await staff("hostel_warden", "warden@hostel.test");
  teacher = await staff("subject_teacher", "teach@hostel.test");
  kids.Ada = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: "Ada", lastName: "Board", gender: "female", classId: gold }), [guardianInputSchema.parse({ name: "Ada's Mum", relationship: "Mother", phone: "08035550001" })])).id;
  kids.Bola = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: "Bola", lastName: "Board", gender: "female", classId: gold }), [])).id;
  kids.Tayo = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: "Tayo", lastName: "Board", gender: "male", classId: gold }), [])).id;
  await requestLoginCode(database.db, "08035550001", "10.0.0.9", async (_d, code) => codes.push(code));
  parentId = (await verifyLoginCode(database.db, "08035550001", codes.at(-1)!)).userId;
});

afterAll(async () => {
  await database.close();
});

describe("hostel", () => {
  it("sets up hostels and rooms for the warden only", async () => {
    await expect(saveHostel(database.db, teacher, hostelSchema.parse({ name: "Queen Amina House", gender: "female", termFeeKobo: 0 }))).rejects.toThrow(/permission/);
    const girls = await saveHostel(database.db, warden, hostelSchema.parse({ name: "Queen Amina House", gender: "female", wardenId: warden.membershipId, termFeeKobo: 250_000_00 }));
    rooms.a1 = (await saveRoom(database.db, warden, roomSchema.parse({ hostelId: girls.id, name: "Room 1", beds: 1 }))).id;
    rooms.a2 = (await saveRoom(database.db, warden, roomSchema.parse({ hostelId: girls.id, name: "Room 2", beds: 4 }))).id;
    await expect(saveRoom(database.db, warden, roomSchema.parse({ hostelId: girls.id, name: "room 1", beds: 2 }))).rejects.toThrow(/already a room 1/);
  });

  it("gives beds by gender and space", async () => {
    await expect(assignBed(database.db, warden, bedSchema.parse({ studentId: kids.Tayo, roomId: rooms.a1 }))).rejects.toThrow(/for girls/);
    expect(await assignBed(database.db, warden, bedSchema.parse({ studentId: kids.Ada, roomId: rooms.a1 }))).toMatchObject({ bed: 1 });
    await expect(assignBed(database.db, warden, bedSchema.parse({ studentId: kids.Bola, roomId: rooms.a1 }))).rejects.toThrow(/full/);
    await expect(assignBed(database.db, warden, bedSchema.parse({ studentId: kids.Bola, roomId: rooms.a2, bed: 5 }))).rejects.toThrow(/has 4 beds/);
    expect(await assignBed(database.db, warden, bedSchema.parse({ studentId: kids.Bola, roomId: rooms.a2, bed: 3 }))).toMatchObject({ bed: 3 });
    await expect(saveRoom(database.db, warden, roomSchema.parse({ id: rooms.a2, hostelId: (await hostelOverview(database.db, warden)).hostels[0].hostel.id, name: "Room 2", beds: 2 }))).rejects.toThrow(/Bed 3 is taken/);
    const o = await hostelOverview(database.db, warden);
    expect(o.stats).toMatchObject({ boarders: 2, bedsFree: 3, fees: 500_000_00 });
  });

  it("runs an exeat from the parent's request to the student's return", async () => {
    const ask = { studentId: kids.Ada, kind: "weekend", reason: "Grandma's 80th birthday", leaveAt: at(1, "15:00"), returnBy: at(3, "17:00"), collectedBy: "Mrs Board (mother)" };
    expect(exeatSchema.safeParse({ ...ask, returnBy: ask.leaveAt }).success).toBe(false);
    await expect(requestExeat(database.db, parentId, exeatSchema.parse({ ...ask, studentId: kids.Bola }))).rejects.toThrow(/couldn't find that child/);
    const e = await requestExeat(database.db, parentId, exeatSchema.parse(ask));
    expect(e.status).toBe("pending");
    await expect(requestExeat(database.db, parentId, exeatSchema.parse(ask))).rejects.toThrow(/already has an exeat open/);
    const told = await database.db.select().from(notifications).where(eq(notifications.userId, warden.user.id));
    expect(told.map((n) => n.kind)).toContain("exeat");
    await expect(moveExeat(database.db, warden, { id: e.id, action: "out" })).rejects.toThrow(/waiting for approval/);
    await moveExeat(database.db, warden, { id: e.id, action: "approve" });
    await moveExeat(database.db, warden, { id: e.id, action: "out" });
    expect((await hostelOverview(database.db, warden)).stats).toMatchObject({ out: 1, pending: 0, late: 0 });
    expect(await listExeats(database.db, warden, { view: "out" })).toHaveLength(1);
    const back = await moveExeat(database.db, warden, { id: e.id, action: "back" });
    expect(back.late).toBe(false);
    const view = await getChildBoarding(database.db, parentId, kids.Ada);
    expect(view).toMatchObject({ room: "Room 1", canRequest: true });
    expect(view!.exeats[0].status).toBe("back");
    const parentNotes = await database.db.select().from(notifications).where(eq(notifications.userId, parentId));
    expect(parentNotes.map((n) => n.title)).toEqual(expect.arrayContaining(["Exeat approved for Ada", "Ada has signed out of school", "Ada is back in school"]));
  });

  it("lets staff record exeats and parents cancel before leaving", async () => {
    await expect(createExeat(database.db, warden, exeatSchema.parse({ studentId: kids.Tayo, kind: "day", reason: "Dentist", leaveAt: at(2, "09:00"), returnBy: at(2, "14:00") }))).rejects.toThrow(/Only boarders/);
    const e = await createExeat(database.db, warden, exeatSchema.parse({ studentId: kids.Ada, kind: "medical", reason: "Eye test", leaveAt: at(2, "09:00"), returnBy: at(2, "14:00") }));
    expect(e.status).toBe("approved");
    await cancelExeat(database.db, parentId, e.id);
    expect((await listExeats(database.db, warden, { view: "done" })).map((x) => x.e.status).sort()).toEqual(["back", "cancelled"]);
  });
});
