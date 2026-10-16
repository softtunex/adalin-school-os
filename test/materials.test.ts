import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { files, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { writeLocal } from "@/lib/documents";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { assignSubjectTeacher, getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { createUpload, fileForUser } from "@/lib/services/files";
import { deleteMaterial, getStudentMaterial, getStudentMaterials, listMaterials, materialSchema, saveMaterial, youtubeId } from "@/lib/services/materials";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { authenticateStudent, issueStudentLogins } from "@/lib/services/student-accounts";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

process.env.FILES_DIR = mkdtempSync(path.join(tmpdir(), "sos-materials-"));

let database: Database;
let owner: Access;
let teacher: Access;
let jss1: string;
let jss2: string;
let maths: string;
let english: string;
const kids: Record<string, string> = {};

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Ige", email: "ige@lms.test", password: "Materials1", schoolName: "LMS Academy" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  jss1 = overview.levels[0].id;
  jss2 = overview.levels[1].id;
  const jss1Gold = overview.levels[0].classes[0].id;
  const jss2Gold = overview.levels[1].classes[0].id;
  maths = overview.subjects.find((s) => s.name === "Mathematics")!.id;
  english = overview.subjects.find((s) => s.name === "English Studies")!.id;
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "subject_teacher")));
  const { token } = await inviteStaff(database.db, owner, { name: "Mr Lawal", email: "lawal@lms.test", roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: "Mr Lawal", password: "Teacher123" });
  teacher = (await loadAccess(database.db, userId, owner.school.slug))!;
  await assignSubjectTeacher(database.db, owner, { classId: jss1Gold, subjectId: maths, membershipId: teacher.membershipId });
  for (const [name, classId] of [
    ["Ada", jss1Gold],
    ["Ben", jss2Gold],
  ] as const) {
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Uko", gender: "female", classId }), []);
    const [slip] = await issueStudentLogins(database.db, owner, { studentIds: [s.id] });
    kids[name] = (await authenticateStudent(database.db, { school: owner.school.slug, admissionNo: s.admissionNo, password: slip.password }, "3.3.3.3")).userId;
  }
});

afterAll(async () => {
  await database.close();
});

describe("learning materials", () => {
  it("recognises YouTube links for an inline player", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://example.com/video")).toBeNull();
  });

  it("lets a teacher share only for the subjects they teach", async () => {
    await saveMaterial(database.db, teacher, materialSchema.parse({ levelId: jss1, subjectId: maths, title: "Fractions video", kind: "link", url: "https://youtu.be/dQw4w9WgXcQ" }));
    await saveMaterial(database.db, teacher, materialSchema.parse({ levelId: jss1, subjectId: maths, title: "Times tables", kind: "note", body: "2 x 2 = 4" }));
    await expect(saveMaterial(database.db, teacher, materialSchema.parse({ levelId: jss1, subjectId: english, title: "Essay tips", kind: "note", body: "Plan first." }))).rejects.toThrow(/subjects you teach/);
    await expect(saveMaterial(database.db, teacher, materialSchema.parse({ levelId: jss2, subjectId: maths, title: "Algebra", kind: "note", body: "x" }))).rejects.toThrow(/subjects you teach/);
    expect(materialSchema.safeParse({ levelId: jss1, subjectId: maths, title: "Bad", kind: "link", url: "javascript:alert(1)" }).success).toBe(false);
    await expect(saveMaterial(database.db, teacher, materialSchema.parse({ levelId: jss1, subjectId: maths, title: "Empty", kind: "file" }))).rejects.toThrow(/Attach at least one file/);
    const list = await listMaterials(database.db, teacher);
    expect(list.stats).toMatchObject({ total: 2, links: 1, notes: 1 });
    expect(list.rows.find((r) => r.m.kind === "link")?.youtube).toBe("dQw4w9WgXcQ");
  });

  it("shows students only their own level's materials, files included", async () => {
    const { fileId } = await createUpload(database.db, { schoolId: owner.school.id, userId: teacher.user.id, ownerType: "material", name: "notes.pdf", size: 20 });
    const [f] = await database.db.select().from(files).where(eq(files.id, fileId));
    await writeLocal(f.storageKey, new TextEncoder().encode("%PDF-1.4\n% notes\n"));
    const m = await saveMaterial(database.db, teacher, materialSchema.parse({ levelId: jss1, subjectId: maths, title: "Fractions notes", kind: "file", fileIds: [fileId] }));

    const ada = await getStudentMaterials(database.db, kids.Ada);
    expect(ada.groups.map((g) => [g.subject, g.items.length])).toEqual([["Mathematics", 3]]);
    expect((await getStudentMaterials(database.db, kids.Ben)).groups).toHaveLength(0);
    await expect(getStudentMaterial(database.db, kids.Ben, m.id)).rejects.toThrow(/wasn't found/);
    expect(await fileForUser(database.db, kids.Ada, fileId)).not.toBeNull();
    expect(await fileForUser(database.db, kids.Ben, fileId)).toBeNull();

    await deleteMaterial(database.db, teacher, m.id);
    expect(await fileForUser(database.db, kids.Ada, fileId)).toBeNull();
  });
});
