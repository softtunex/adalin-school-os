import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { applicants, guardians, outboundMessages, schools, studentGuardians, students } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import {
  admissionSettingsSchema,
  applicationSchema,
  confirmApplicationFee,
  enrollApplicant,
  getApplicant,
  getApplicationStatus,
  getApplyPage,
  listApplicants,
  nextStatuses,
  offerLetterData,
  respondToOffer,
  saveAdmissionSettings,
  startApplicationFee,
  submitApplication,
  updateApplicant,
} from "@/lib/services/admissions";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let slug: string;
let jss1: string;
let jss1Gold: string;
const BASE = "http://localhost:3005";

const form = (levelId: string, n = "") =>
  applicationSchema.parse({
    levelId,
    firstName: `Tolu${n}`,
    lastName: "Bakare",
    gender: "female",
    dateOfBirth: "2014-03-02",
    guardianName: "Mrs Kemi Bakare",
    guardianPhone: "0803 555 1234",
    guardianEmail: "kemi@example.com",
  });

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mr Ojo", email: "ojo@admit.test", password: "Admissions1", schoolName: "Admit College" });
  await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  slug = school.slug;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  jss1 = overview.levels[0].id;
  jss1Gold = overview.levels[0].classes[0].id;
});

afterAll(async () => {
  await database.close();
});

describe("admissions", () => {
  let token = "";
  let id = "";

  it("takes applications only while open, for the listed classes", async () => {
    expect((await getApplyPage(database.db, slug))?.open).toBe(false);
    await expect(submitApplication(database.db, slug, form(jss1), { ip: "4.4.4.1", baseUrl: BASE })).rejects.toThrow(/isn't taking applications/);
    await saveAdmissionSettings(database.db, owner, admissionSettingsSchema.parse({ open: true, levelIds: [jss1], fee: "5,000", intro: "Welcome.", examInfo: "Saturday 9am, bring a pencil." }));
    const page = (await getApplyPage(database.db, slug))!;
    expect(page).toMatchObject({ open: true, feeKobo: 500_000, payOnline: true });
    expect(page.levels.map((l) => l.id)).toEqual([jss1]);
    expect(applicationSchema.safeParse({ ...form(jss1), guardianPhone: "12" }).success).toBe(false);
  });

  it("gives each application a reference and a private status link", async () => {
    const first = await submitApplication(database.db, slug, form(jss1), { ip: "4.4.4.2", baseUrl: BASE });
    const second = await submitApplication(database.db, slug, form(jss1, "2"), { ip: "4.4.4.2", baseUrl: BASE });
    expect(first.ref).toMatch(/^APP\/\d{4}\/0001$/);
    expect(second.ref).toMatch(/0002$/);
    token = first.token;
    const s = (await getApplicationStatus(database.db, slug, token))!;
    expect(s.a).toMatchObject({ status: "applied", feePaid: false, guardianPhone: "+2348035551234" });
    id = s.a.id;
    expect(await getApplicationStatus(database.db, slug, "x".repeat(32))).toBeNull();
    const sent = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(outboundMessages).where(eq(outboundMessages.kind, "admission")));
    expect(sent.some((m) => m.channel === "email" && m.body.includes(`/apply/${slug}/status/${token}`))).toBe(true);
  });

  it("limits how many applications one connection can send", async () => {
    for (let i = 0; i < 5; i++) await submitApplication(database.db, slug, form(jss1, `x${i}`), { ip: "4.4.4.9", baseUrl: BASE });
    await expect(submitApplication(database.db, slug, form(jss1, "y"), { ip: "4.4.4.9", baseUrl: BASE })).rejects.toThrow(/Too many applications/);
  });

  it("takes the application fee, then lets staff invite, score and offer", async () => {
    await expect(updateApplicant(database.db, owner, { id, status: "offered", notify: true }, { baseUrl: BASE })).rejects.toThrow(/fee hasn't been paid/);
    const { url } = await startApplicationFee(database.db, slug, token, "kemi@example.com", BASE);
    const reference = new URL(url).searchParams.get("reference")!;
    expect(await confirmApplicationFee(database.db, reference)).toBe(false);
    expect(await confirmApplicationFee(database.db, reference, { testApproved: true })).toBe(true);
    expect((await getApplicationStatus(database.db, slug, token))!.a.feePaid).toBe(true);

    await updateApplicant(database.db, owner, { id, status: "exam", notify: true }, { baseUrl: BASE });
    await updateApplicant(database.db, owner, { id, examScore: 78, notify: true }, { baseUrl: BASE });
    await expect(updateApplicant(database.db, owner, { id, status: "accepted", notify: true }, { baseUrl: BASE })).rejects.toThrow(/can't move/);
    await updateApplicant(database.db, owner, { id, status: "offered", notify: true }, { baseUrl: BASE });
    const letter = (await offerLetterData(database.db, owner.school.id, id))!;
    expect(letter).toMatchObject({ child: "Tolu Bakare", levelName: "JSS 1" });
    const list = await listApplicants(database.db, owner);
    expect(list.pipeline.offered).toBe(1);
    expect(list.stats.fees).toBe(500_000);
  });

  it("follows the school's choice of assessment", async () => {
    const { token: t2 } = await submitApplication(database.db, slug, form(jss1, "z"), { ip: "4.4.4.20", baseUrl: BASE });
    const other = (await getApplicationStatus(database.db, slug, t2))!.a.id;
    await saveAdmissionSettings(database.db, owner, admissionSettingsSchema.parse({ open: true, levelIds: [jss1], fee: "", assessment: "none" }));
    owner = (await loadAccess(database.db, owner.user.id, slug))!;
    expect((await getApplyPage(database.db, slug))!.assessment).toBe("none");
    expect((await getApplicant(database.db, owner, other)).next).not.toContain("exam");
    await expect(updateApplicant(database.db, owner, { id: other, status: "interview", notify: false }, { baseUrl: BASE })).rejects.toThrow(/No assessment/);
    expect(nextStatuses("applied", "interview")).toEqual(["interview", "offered", "rejected", "withdrawn"]);
    await saveAdmissionSettings(database.db, owner, admissionSettingsSchema.parse({ open: true, levelIds: [jss1], fee: "5,000", assessment: "both" }));
    owner = (await loadAccess(database.db, owner.user.id, slug))!;
  });

  it("lets the parent accept, then enrols the child with their guardian", async () => {
    await respondToOffer(database.db, slug, token, true);
    await expect(respondToOffer(database.db, slug, token, true)).rejects.toThrow(/no open offer/);
    const student = await enrollApplicant(database.db, owner, { id, classId: jss1Gold });
    expect(student.admissionNo).toBeTruthy();
    const [a] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(applicants).where(eq(applicants.id, id)));
    expect(a).toMatchObject({ status: "enrolled", studentId: student.id });
    const [g] = await withTenant(database.db, owner.school.id, (tx) =>
      tx.select({ name: guardians.name, phone: guardians.phone }).from(studentGuardians).innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId)).where(eq(studentGuardians.studentId, student.id)),
    );
    expect(g).toMatchObject({ name: "Mrs Kemi Bakare", phone: "+2348035551234" });
    const [s] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(students).where(eq(students.id, student.id)));
    expect(s.classId).toBe(jss1Gold);
    await expect(enrollApplicant(database.db, owner, { id, classId: jss1Gold })).rejects.toThrow(/Already enrolled/);
  });
});
