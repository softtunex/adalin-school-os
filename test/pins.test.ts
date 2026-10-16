import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { getAssessmentConfig } from "@/lib/services/assessment";
import { checkResultWithPin, generatePins, listPinBatches } from "@/lib/services/pins";
import { saveScores, setClassResultStatus } from "@/lib/services/results";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let slug: string;
let classId: string;
const adm: Record<string, string> = {};

beforeAll(async () => {
  database = await createTestDatabase();
  const reg = await registerSchoolOwner(database.db, { name: "Mrs Ojo", email: "ojo@star.test", password: "StarSchool1", schoolName: "Morning Star School" });
  slug = reg.school.slug;
  owner = (await loadAccess(database.db, reg.user.id, slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: [], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  classId = overview.levels[0].classes[0].id;
  const maths = overview.subjects.find((s) => s.name === "Mathematics")!.id;
  const [ca1] = (await getAssessmentConfig(database.db, owner)).components;
  for (const name of ["Tola", "Uche"]) {
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Test", gender: "male", classId }), []);
    adm[name] = s.admissionNo;
    await saveScores(database.db, owner, { classId, subjectId: maths, entries: [{ studentId: s.id, componentId: ca1.id, score: 15 }] });
  }
});

afterAll(async () => {
  await database.close();
});

describe("result checker PINs", () => {
  let pins: { serial: string; pin: string }[];

  it("needs a plan with the results workflow", async () => {
    await expect(generatePins(database.db, owner, { count: 2, maxUses: 2 })).rejects.toThrow(/Basic plan/);
    await database.db.update(schools).set({ planKey: "basic" }).where(eq(schools.slug, slug));
    owner = (await loadAccess(database.db, owner.user.id, slug))!;
    const batch = await generatePins(database.db, owner, { count: 3, maxUses: 2 });
    pins = batch.pins;
    expect(pins).toHaveLength(3);
    expect(pins[0].pin).toMatch(/^\d{4}-\d{4}-\d{4}$/);
    expect(new Set(pins.map((p) => p.serial)).size).toBe(3);
    const batches = await listPinBatches(database.db, owner);
    expect(batches[0]).toMatchObject({ total: 3, used: 0 });
  });

  it("refuses results that aren't published yet", async () => {
    await expect(checkResultWithPin(database.db, { slug, admissionNo: adm.Tola, pin: pins[0].pin, ip: "9.9.9.1" })).rejects.toThrow(/haven't been published/);
  });

  it("shows published results, binds the PIN to the student and counts uses", async () => {
    await setClassResultStatus(database.db, owner, { classId, status: "reviewed" });
    await setClassResultStatus(database.db, owner, { classId, status: "approved" });
    await setClassResultStatus(database.db, owner, { classId, status: "published" });
    const first = await checkResultWithPin(database.db, { slug, admissionNo: adm.Tola.toLowerCase(), pin: pins[0].pin.replace(/-/g, " "), ip: "9.9.9.1" });
    expect(first.usesLeft).toBe(1);
    expect(first.built.students.find((s) => s.id === first.studentId)?.firstName).toBe("Tola");
    await expect(checkResultWithPin(database.db, { slug, admissionNo: adm.Uche, pin: pins[0].pin, ip: "9.9.9.1" })).rejects.toThrow(/different student/);
    await checkResultWithPin(database.db, { slug, admissionNo: adm.Tola, pin: pins[0].pin, ip: "9.9.9.1" });
    await expect(checkResultWithPin(database.db, { slug, admissionNo: adm.Tola, pin: pins[0].pin, ip: "9.9.9.1" })).rejects.toThrow(/expired/);
  });

  it("rejects wrong PINs and slows down guessing", async () => {
    await expect(checkResultWithPin(database.db, { slug, admissionNo: adm.Uche, pin: "1234-5678-9012", ip: "7.7.7.7" })).rejects.toThrow(/isn't valid/);
    await expect(checkResultWithPin(database.db, { slug: "no-such-school", admissionNo: "x", pin: pins[1].pin, ip: "7.7.7.7" })).rejects.toThrow(/couldn't find that school/);
    for (let i = 0; i < 8; i++) await checkResultWithPin(database.db, { slug, admissionNo: adm.Uche, pin: "0000-0000-0000", ip: "7.7.7.7" }).catch(() => {});
    await expect(checkResultWithPin(database.db, { slug, admissionNo: adm.Uche, pin: pins[1].pin, ip: "7.7.7.7" })).rejects.toThrow(/Too many attempts/);
    const ok = await checkResultWithPin(database.db, { slug, admissionNo: adm.Uche, pin: pins[1].pin, ip: "8.8.8.8" });
    expect(ok.usesLeft).toBe(1);
  });
});
