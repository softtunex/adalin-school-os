import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { attendanceDays, attendanceRecords, roles, schools, scores, terms } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { assignSubjectTeacher, getAcademicOverview, setCurrentTerm, setupAcademics } from "@/lib/services/academics";
import { getAcademicAnalytics, getAnalyticsOverview, getAtRisk, getTeacherAnalytics } from "@/lib/services/analytics";
import { loadAssessmentConfig } from "@/lib/services/assessment";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let teacher: Access;
const kids: Record<string, string> = {};

// Percentages per term for Maths and English.
const MARKS: Record<string, [number, number][]> = {
  Ada: [
    [80, 75],
    [82, 78],
  ],
  Bayo: [
    [70, 70],
    [50, 45],
  ],
  Chi: [
    [50, 50],
    [30, 35],
  ],
};

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Ade", email: "ade@stats.test", password: "Analytics1", schoolName: "Stats Academy" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  const gold = overview.levels[0].classes[0].id;
  const maths = overview.subjects.find((s) => s.name === "Mathematics")!.id;
  const english = overview.subjects.find((s) => s.name === "English Studies")!.id;
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "subject_teacher")));
  const { token } = await inviteStaff(database.db, owner, { name: "Mr Sum", email: "sum@stats.test", roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: "Mr Sum", password: "Teacher123" });
  teacher = (await loadAccess(database.db, userId, school.slug))!;
  await assignSubjectTeacher(database.db, owner, { classId: gold, subjectId: maths, membershipId: teacher.membershipId });
  for (const name of Object.keys(MARKS)) kids[name] = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Oke", gender: "female", classId: gold }), [])).id;

  const [t1, t2] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(terms).orderBy(asc(terms.number)));
  await setCurrentTerm(database.db, owner, t2.id);
  await withTenant(database.db, owner.school.id, async (tx) => {
    const { components } = await loadAssessmentConfig(tx, owner.school.id);
    const total = components.reduce((t, c) => t + c.maxScore, 0);
    for (const [name, byTerm] of Object.entries(MARKS)) {
      for (const [ti, termId] of [t1.id, t2.id].entries()) {
        for (const [si, subjectId] of [maths, english].entries()) {
          const target = byTerm[ti][si] / 100;
          for (const c of components) {
            await tx.insert(scores).values({ schoolId: owner.school.id, termId, classId: gold, subjectId, studentId: kids[name], componentId: c.id, score: Math.round(c.maxScore * target * 100) / 100 });
          }
        }
      }
    }
    expect(total).toBeGreaterThan(0);
    // Ten school days this term: Chi misses four.
    for (let d = 1; d <= 10; d++) {
      const [day] = await tx.insert(attendanceDays).values({ schoolId: owner.school.id, classId: gold, termId: t2.id, date: `2026-10-${String(d).padStart(2, "0")}` }).returning();
      for (const name of Object.keys(MARKS)) {
        await tx.insert(attendanceRecords).values({ schoolId: owner.school.id, dayId: day.id, studentId: kids[name], status: name === "Chi" && d <= 4 ? "absent" : "present" });
      }
    }
  });
});

afterAll(async () => {
  await database.close();
});

describe("analytics", () => {
  it("is for the proprietor and principal only", async () => {
    await expect(getAnalyticsOverview(database.db, teacher)).rejects.toThrow(/permission/);
  });

  it("compares this term with last term", async () => {
    const o = await getAnalyticsOverview(database.db, owner);
    expect(o.average.now).toBeCloseTo((82 + 78 + 50 + 45 + 30 + 35) / 6, 0);
    expect(o.average.before).toBeCloseTo((80 + 75 + 70 + 70 + 50 + 50) / 6, 0);
    expect(o.trend.map((t) => t.average !== null)).toEqual([true, true]);
    expect(o.attendance.now).toBeCloseTo((26 / 30) * 100, 0);
    expect(o.atRisk.count).toBe(2);
  });

  it("ranks subjects from weakest and shows the class heatmap", async () => {
    const a = await getAcademicAnalytics(database.db, owner);
    expect(a.bySubject.map((s) => s.name)).toEqual(["English Studies", "Mathematics"]);
    expect(a.bySubject[0].change).toBeLessThan(0);
    expect(a.heat).toHaveLength(1);
    expect(a.bands.reduce((t, b) => t + b.n, 0)).toBe(6);
  });

  it("flags students who are failing, dropping or missing school, with reasons", async () => {
    const r = await getAtRisk(database.db, owner);
    const chi = r.rows.find((s) => s.id === kids.Chi)!;
    const bayo = r.rows.find((s) => s.id === kids.Bayo)!;
    expect(chi.reasons.map((x) => x.kind).sort()).toEqual(["attendance", "dropping", "failing"]);
    expect(bayo.reasons.map((x) => x.kind)).toEqual(["dropping"]);
    expect(r.rows.some((s) => s.id === kids.Ada)).toBe(false);
    expect(r.rows[0].id).toBe(kids.Chi);
    expect((await getAtRisk(database.db, owner, { kind: "attendance" })).rows.map((s) => s.id)).toEqual([kids.Chi]);
  });

  it("shows how far each teacher has got with their score sheets", async () => {
    const t = await getTeacherAnalytics(database.db, owner);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ name: "Mr Sum", sheets: 1, submitted: 0, scoresEntered: 100 });
  });
});
