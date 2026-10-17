import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { listUserSchools, loadAccess, type Access } from "@/lib/services/access";
import { addSchool, registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { addNewCampus, campusesTab, createGroup, groupOverview, linkCampus, listUserGroups, removeCampus } from "@/lib/services/groups";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let strangerId: string;

const enterprise = async (schoolId: string) => database.db.update(schools).set({ planKey: "enterprise" }).where(eq(schools.id, schoolId));
const reload = async () => {
  owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
};

beforeAll(async () => {
  database = await createTestDatabase();
  const a = await registerSchoolOwner(database.db, { name: "Chief Campus", email: "chief@groups.test", password: "Groups123", schoolName: "Main Campus" });
  owner = (await loadAccess(database.db, a.user.id, a.school.slug))!;
  strangerId = (await registerSchoolOwner(database.db, { name: "Stranger", email: "stranger@groups.test", password: "Groups123", schoolName: "Stranger School" })).user.id;
});

afterAll(async () => {
  await database.close();
});

describe("campus groups", () => {
  it("are an Enterprise feature for the proprietor", async () => {
    await expect(createGroup(database.db, owner, "Chief Schools")).rejects.toThrow();
  });

  it("start from one school, then grow with new and existing schools", async () => {
    await enterprise(owner.school.id);
    await reload();
    const group = await createGroup(database.db, owner, "Chief Schools");
    await reload();
    await expect(createGroup(database.db, owner, "Again")).rejects.toThrow(/already in a group/);

    const lekki = await addNewCampus(database.db, owner, "Lekki Campus");
    const [row] = await database.db.select().from(schools).where(eq(schools.id, lekki.id));
    expect(row.groupId).toBe(group.id);
    expect(row.planKey).toBe("enterprise");
    expect((await listUserSchools(database.db, owner.user.id)).map((s) => s.name)).toContain("Lekki Campus");

    const old = await addSchool(database.db, { id: owner.user.id, name: owner.user.name }, "Ikeja Annex");
    const strangers = await database.db.select().from(schools).where(eq(schools.name, "Stranger School"));
    await expect(linkCampus(database.db, owner, strangers[0].id)).rejects.toThrow(/proprietor/);
    await linkCampus(database.db, owner, old.id);
    const tab = await campusesTab(database.db, owner);
    expect(tab.campuses.map((c) => c.name)).toEqual(["Ikeja Annex", "Lekki Campus", "Main Campus"]);
    expect(await listUserGroups(database.db, owner.user.id)).toEqual([{ id: group.id, name: "Chief Schools", campuses: 3 }]);
  });

  it("compare campuses on one page, for the group's admins only", async () => {
    await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
    const classId = (await getAcademicOverview(database.db, owner)).levels[0].classes[0].id;
    await createStudent(database.db, owner, studentInputSchema.parse({ firstName: "Ada", lastName: "Main", gender: "female", classId }), []);
    const o = await groupOverview(database.db, owner.user.id, owner.school.groupId!);
    expect(o.campuses.find((c) => c.name === "Main Campus")?.students).toBe(1);
    expect(o.totals.students).toBe(1);
    expect(o.campuses.every((c) => c.member)).toBe(true);
    await expect(groupOverview(database.db, strangerId, owner.school.groupId!)).rejects.toThrow(/wasn't found/);
  });

  it("let a campus leave and carry on alone", async () => {
    const tab = await campusesTab(database.db, owner);
    const annex = tab.campuses.find((c) => c.name === "Ikeja Annex")!;
    await removeCampus(database.db, owner, annex.id);
    const [row] = await database.db.select().from(schools).where(eq(schools.id, annex.id));
    expect(row.groupId).toBeNull();
    expect((await campusesTab(database.db, owner)).linkable.map((s) => s.name)).toContain("Ikeja Annex");
  });
});
