import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { notifications, roles, schools, sickBayVisits } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import {
  allergyClash,
  healthRecordSchema,
  healthSettingsSchema,
  listHealthRecords,
  listVisits,
  recordVisit,
  saveHealthRecord,
  saveHealthSettings,
  sickBayOverview,
  studentHealthView,
  updateVisit,
  updateVisitSchema,
  visitSchema,
} from "@/lib/services/health";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let nurse: Access;
let teacher: Access;
const kids: Record<string, string> = {};

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Dr Care", email: "care@health.test", password: "Health123", schoolName: "Health College" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const gold = (await getAcademicOverview(database.db, owner)).levels[0].classes[0].id;
  nurse = await staff("nurse", "nurse@health.test");
  teacher = await staff("subject_teacher", "teach@health.test");
  for (const name of ["Ada", "Bayo"]) kids[name] = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Well", gender: "female", classId: gold }), [])).id;
});

afterAll(async () => {
  await database.close();
});

describe("sick bay", () => {
  it("matches allergies to medicines by whole words", () => {
    expect(allergyClash(["Paracetamol"], "Paracetamol 500mg")).toBe("Paracetamol");
    expect(allergyClash(["Ibuprofen tablets"], "Ibuprofen")).toBe("Ibuprofen tablets");
    expect(allergyClash(["Horse serum"], "ORS (oral rehydration salts)")).toBeUndefined();
    expect(allergyClash(["Peanuts"], "Paracetamol")).toBeUndefined();
    expect(allergyClash(["Groundnuts"], "Groundnut oil rub")).toBe("Groundnuts");
    expect(allergyClash(["Sulfa drugs"], "Antiseptic and plaster")).toBeUndefined();
  });

  it("keeps health records for the nurse only", async () => {
    await expect(saveHealthRecord(database.db, teacher, healthRecordSchema.parse({ studentId: kids.Ada, allergies: ["Ibuprofen"], conditions: [] }))).rejects.toThrow(/permission|Premium/);
    await saveHealthRecord(database.db, nurse, healthRecordSchema.parse({ studentId: kids.Ada, allergies: ["Ibuprofen", "Peanuts"], conditions: ["Asthma"], regularMedication: "Inhaler before sports" }));
    expect((await listHealthRecords(database.db, nurse)).map((r) => r.name)).toEqual(["Ada Well"]);
    expect((await listHealthRecords(database.db, nurse, "asthma")).length).toBe(1);
    await expect(studentHealthView(database.db, teacher, kids.Ada)).rejects.toThrow(/access/);
  });

  it("refuses a medicine the student is allergic to unless overridden", async () => {
    const base = { studentId: kids.Ada, complaint: "Headache", temperature: 37.9 };
    await expect(recordVisit(database.db, nurse, visitSchema.parse({ ...base, medicines: [{ medicine: "Ibuprofen", dose: "200mg" }] }))).rejects.toThrow(/allergic to Ibuprofen/);
    const { visit } = await recordVisit(database.db, nurse, visitSchema.parse({ ...base, medicines: [{ medicine: "Paracetamol", dose: "500mg" }] }));
    expect(visit).toMatchObject({ temperature: 379, outcome: null, leftAt: null });
    await expect(recordVisit(database.db, nurse, visitSchema.parse(base))).rejects.toThrow(/already in the sick bay/);
    const o = await sickBayOverview(database.db, nurse);
    expect(o.inBay.map((v) => v.name)).toEqual(["Ada Well"]);
    expect(o.inBay[0].allergies).toEqual(["Ibuprofen", "Peanuts"]);
  });

  it("closes the visit and tells the parents", async () => {
    const [open] = (await sickBayOverview(database.db, nurse)).inBay;
    const r = await updateVisit(database.db, nurse, updateVisitSchema.parse({ id: open.v.id, treatment: "Rested for 30 minutes", medicines: [{ medicine: "ORS (oral rehydration salts)", dose: "1 sachet" }], outcome: "sent_home" }));
    expect(r.visit.medicines.map((m) => m.medicine)).toEqual(["Paracetamol", "ORS (oral rehydration salts)"]);
    expect(r.visit.leftAt).not.toBeNull();
    await expect(updateVisit(database.db, nurse, updateVisitSchema.parse({ id: open.v.id, outcome: "returned" }))).rejects.toThrow(/closed/);
    const { rows, total } = await listVisits(database.db, nurse, { outcome: "sent_home" });
    expect(total).toBe(1);
    expect(rows[0].v.complaint).toBe("Headache");
    expect((await sickBayOverview(database.db, nurse)).stats).toMatchObject({ today: 1, sentHome: 1, withAllergies: 1 });
  });

  it("respects the parent notice setting", async () => {
    await saveHealthSettings(database.db, nurse, healthSettingsSchema.parse({ medicines: ["Paracetamol"], notifyParents: "none" }));
    nurse = (await loadAccess(database.db, nurse.user.id, owner.school.slug))!;
    const { visit, told } = await recordVisit(database.db, nurse, visitSchema.parse({ studentId: kids.Bayo, complaint: "Stomach ache", outcome: "returned" }));
    expect(told).toBe(0);
    const [row] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(sickBayVisits).where(eq(sickBayVisits.id, visit.id)));
    expect(row.parentsTold).toBe(false);
    expect(await database.db.select().from(notifications).where(eq(notifications.kind, "health"))).toHaveLength(0);
  });
});
