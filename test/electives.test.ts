import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { getAssessmentConfig } from "@/lib/services/assessment";
import { getElectiveMatrix, setClassElectives } from "@/lib/services/electives";
import { getScoreSheet, listMySheets, saveScores } from "@/lib/services/results";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let classId: string;
let physics: string;
let maths: string;
const kids: Record<string, string> = {};

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Dr Ibe", email: "ibe@unity.test", password: "UnitySchool1", schoolName: "Unity Grammar School" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["senior_secondary"], arms: [], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  classId = overview.levels[0].classes[0].id;
  physics = overview.subjects.find((s) => s.name === "Physics")!.id;
  maths = overview.subjects.find((s) => s.name === "Mathematics")!.id;
  for (const name of ["Science", "Arts"]) {
    kids[name] = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Student", gender: "male", classId }), [])).id;
  }
});

afterAll(async () => {
  await database.close();
});

describe("elective subjects", () => {
  it("puts everyone on compulsory sheets and nobody on an elective until chosen", async () => {
    expect((await getScoreSheet(database.db, owner, classId, maths)).students).toHaveLength(2);
    expect((await getScoreSheet(database.db, owner, classId, physics)).students).toHaveLength(0);
    const matrix = await getElectiveMatrix(database.db, owner, classId);
    expect(matrix.electives.map((e) => e.name)).toContain("Physics");
    expect(matrix.electives.map((e) => e.name)).not.toContain("Mathematics");
  });

  it("only scores students who take the elective", async () => {
    await setClassElectives(database.db, owner, classId, [{ studentId: kids.Science, subjectId: physics }]);
    const sheet = await getScoreSheet(database.db, owner, classId, physics);
    expect(sheet.students.map((s) => s.firstName)).toEqual(["Science"]);
    const [ca1] = (await getAssessmentConfig(database.db, owner)).components;
    await saveScores(database.db, owner, { classId, subjectId: physics, entries: [{ studentId: kids.Science, componentId: ca1.id, score: 15 }] });
    await expect(saveScores(database.db, owner, { classId, subjectId: physics, entries: [{ studentId: kids.Arts, componentId: ca1.id, score: 15 }] })).rejects.toThrow(/dropped the subject/);
    const physicsSheet = (await listMySheets(database.db, owner)).sheets.find((s) => s.subjectId === physics && s.classId === classId)!;
    expect(physicsSheet.roll).toBe(1);
  });

  it("rejects choices for compulsory subjects or other classes", async () => {
    await expect(setClassElectives(database.db, owner, classId, [{ studentId: kids.Arts, subjectId: maths }])).rejects.toThrow(/changed/);
  });
});
