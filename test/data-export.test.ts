import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { exportHistory, exportPerson, exportSchool } from "@/lib/services/data-export";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { getSystemRole } from "@/lib/rbac/roles";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let other: Access;
let studentId: string;

const unzip = async (stream: ReadableStream<Uint8Array>) => unzipSync(new Uint8Array(await new Response(stream).arrayBuffer()));

async function addStudent(access: Access, firstName: string) {
  await setupAcademics(database.db, access, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, access);
  return createStudent(database.db, access, studentInputSchema.parse({ firstName, lastName: "Export", gender: "female", classId: overview.levels[0].classes[0].id }), []);
}

beforeAll(async () => {
  database = await createTestDatabase();
  const a = await registerSchoolOwner(database.db, { name: "Mrs Keeper", email: "keeper@export.test", password: "Export123", schoolName: "Keeper College" });
  owner = (await loadAccess(database.db, a.user.id, a.school.slug))!;
  const b = await registerSchoolOwner(database.db, { name: "Mr Other", email: "other@export.test", password: "Export123", schoolName: "Other College" });
  other = (await loadAccess(database.db, b.user.id, b.school.slug))!;
  studentId = (await addStudent(owner, "Amaka")).id;
  await addStudent(other, "Bisi");
});

afterAll(async () => {
  await database.close();
});

describe("data export", () => {
  it("is for the proprietor only", () => {
    expect(getSystemRole("owner")?.permissions).toContain("school:export");
    expect(getSystemRole("principal")?.permissions).not.toContain("school:export");
  });

  it("gives the school all of its own records and nobody else's, without secrets", async () => {
    const { filename, stream } = await exportSchool(database.db, owner);
    expect(filename).toMatch(/^keeper-college-all-data-\d{4}-\d{2}-\d{2}\.zip$/);
    const files = await unzip(stream);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["README.txt", "school.csv", "people.csv", "students.csv", "classes.csv", "scores.csv"]));
    const studentsCsv = strFromU8(files["students.csv"]);
    expect(studentsCsv).toContain("Amaka");
    expect(studentsCsv).not.toContain("Bisi");
    expect(studentsCsv).not.toContain("school_id");
    const all = Object.values(files).map((f) => strFromU8(f)).join("\n");
    expect(all).not.toMatch(/password_hash|pin_hash|token_hash|pay_token/);
    expect(strFromU8(files["people.csv"])).toContain("keeper@export.test");
    expect(strFromU8(files["school.csv"])).toContain("brandColor");
    expect(strFromU8(files["school.csv"])).not.toMatch(/adminNote|adminGrants/);
  });

  it("answers one student's request, and records both downloads", async () => {
    const { files } = await exportPerson(database.db, owner, { studentId }, { userId: owner.user.id, name: owner.user.name });
    const names = files.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["README.txt", "students.csv", "enrollments.csv"]));
    expect(strFromU8(files.find((f) => f.name === "README.txt")!.data)).toContain("about Amaka Export");
    await expect(exportPerson(database.db, other, { studentId }, { userId: other.user.id, name: other.user.name })).rejects.toThrow(/wasn't found/);
    const history = await exportHistory(database.db, owner);
    expect(history.map((h) => h.summary)).toEqual(["Downloaded the data held about Amaka Export", "Downloaded all of the school's data"]);
  });

  it("answers a staff member's request", async () => {
    const { files } = await exportPerson(database.db, owner, { membershipId: owner.membershipId }, { userId: owner.user.id, name: owner.user.name });
    expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(["person.csv", "memberships.csv", "membership_roles.csv"]));
    expect(strFromU8(files.find((f) => f.name === "person.csv")!.data)).toContain("keeper@export.test");
  });
});
