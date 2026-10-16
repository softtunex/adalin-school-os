import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { createSession, getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { applyPromotion, planPromotion } from "@/lib/services/promotion";
import { createStudent, getStudent, listStudents, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let classId: (name: string) => string;
let nextSessionId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Ola", email: "ola@hill.test", password: "HillTop123", schoolName: "Hilltop Academy" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["senior_secondary"], arms: ["Gold", "Silver"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  classId = (name) => overview.levels.flatMap((l) => l.classes).find((c) => c.name === name)!.id;
  const add = (first: string, cls: string) => createStudent(database.db, owner, studentInputSchema.parse({ firstName: first, lastName: "Test", gender: "male", classId: classId(cls) }), []);
  await add("Ayo", "SS 1 Silver");
  await add("Bolu", "SS 1 Silver");
  await add("Chuka", "SS 3 Gold");
  nextSessionId = (await createSession(database.db, owner, { name: "2027/2028" })).id;
});

afterAll(async () => {
  await database.close();
});

describe("end-of-session promotion", () => {
  it("proposes the same arm one level up, and graduation from the final level", async () => {
    const plan = await planPromotion(database.db, owner, nextSessionId);
    const ss1 = plan.groups.find((g) => g.className === "SS 1 Silver")!;
    expect(ss1.students.map((s) => s.targetClassId)).toEqual([classId("SS 2 Silver"), classId("SS 2 Silver")]);
    expect(ss1.students[0].action).toBe("promote");
    const ss3 = plan.groups.find((g) => g.className === "SS 3 Gold")!;
    expect(ss3.students[0]).toMatchObject({ action: "graduate", targetClassId: null });
  });

  it("applies promote, repeat and graduate in one go and switches the current session", async () => {
    const plan = await planPromotion(database.db, owner, nextSessionId);
    const decisions = plan.groups.flatMap((g) =>
      g.students.map((s) => (s.name.startsWith("Bolu") ? { studentId: s.id, action: "repeat" as const, targetClassId: null } : { studentId: s.id, action: s.action, targetClassId: s.targetClassId })),
    );
    const counts = await applyPromotion(database.db, owner, { toSessionId: nextSessionId, decisions, makeCurrent: true });
    expect(counts).toEqual({ promote: 1, repeat: 1, graduate: 1, withdraw: 0 });

    const ayo = (await listStudents(database.db, owner, { q: "Ayo" })).rows[0];
    expect(ayo.className).toBe("SS 2 Silver");
    const history = (await getStudent(database.db, owner, ayo.id))!.history;
    expect(history.map((h) => `${h.sessionName}:${h.className}:${h.outcome}`)).toEqual(["2027/2028:SS 2 Silver:current", "2026/2027:SS 1 Silver:promoted"]);

    expect((await listStudents(database.db, owner, { q: "Bolu" })).rows[0].className).toBe("SS 1 Silver");
    expect((await listStudents(database.db, owner, { q: "Chuka", status: "graduated" })).total).toBe(1);

    const overview = await getAcademicOverview(database.db, owner);
    expect(overview.currentSession?.name).toBe("2027/2028");
    expect(overview.currentTerm?.number).toBe(1);
  });

  it("never moves the same student twice into a session", async () => {
    const plan = await planPromotion(database.db, owner, nextSessionId);
    expect(plan.groups).toEqual([]);
    expect(plan.alreadyMoved).toBe(2);
  });
});
