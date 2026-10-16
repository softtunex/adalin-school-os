import ExcelJS from "exceljs";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { plans } from "@/lib/db/schema";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { listClassOptions, setupAcademics } from "@/lib/services/academics";
import { buildTemplate, commitImport, previewImport, readSpreadsheet, validateImportRows } from "@/lib/services/student-import";
import { getStudent, listStudents } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let classes: { id: string; name: string }[];

const csv = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mr Lawal", email: "lawal@crescent.test", password: "Crescent123", schoolName: "Crescent Schools" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["primary"], arms: ["A", "B"], sessionName: "2026/2027" });
  classes = await listClassOptions(database.db, owner);
});

afterAll(async () => {
  await database.close();
});

describe("reading spreadsheets", () => {
  it("reads CSV with alternative headings, quotes and Nigerian date format", async () => {
    const { rows, unknownHeaders } = await readSpreadsheet(
      csv('Surname,First Name,Sex,DOB,Class,Mother Name,Parent Phone Number,Favourite colour\r\nEze,"Ada, Jr",F,14/03/2016,primary 1a,Mrs Eze,0803 111 2222,Blue\r\n'),
      "register.csv",
    );
    expect(unknownHeaders).toEqual(["Favourite colour"]);
    expect(rows[0]).toMatchObject({ lastName: "Eze", firstName: "Ada, Jr", gender: "F", dateOfBirth: "14/03/2016", class: "primary 1a", g1_name: "Mrs Eze" });
  });

  it("round-trips the generated Excel template and skips the example row", async () => {
    const template = await buildTemplate(classes.map((c) => c.name));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(template as never);
    const sheet = wb.getWorksheet("Students")!;
    sheet.addRow(["", "Tunde", "", "Bakare", "Male", new Date(Date.UTC(2015, 5, 1)), "Primary 2 B", "Lagos", "", "", "", "Mr Bakare", "Father", "08099998888"]);
    const { rows } = await readSpreadsheet((await wb.xlsx.writeBuffer()) as ArrayBuffer, "filled.xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firstName: "Tunde", dateOfBirth: "2015-06-01", class: "Primary 2 B" });
  });

  it("rejects files without name columns or of the wrong type", async () => {
    await expect(readSpreadsheet(csv("Name,Class\nAda,P1\n"), "x.csv")).rejects.toThrow(/First name and Surname/);
    await expect(readSpreadsheet(csv("hello"), "x.pdf")).rejects.toThrow(/Excel/);
  });
});

describe("validating rows", () => {
  it("accepts good rows and explains every problem in bad ones", () => {
    const { valid, errors } = validateImportRows(
      [
        { firstName: "Ada", lastName: "Eze", gender: "female", dateOfBirth: "14/03/2016", class: "Primary 1 A", g1_name: "Mrs Eze", g1_phone: "08031112222" },
        { firstName: "Bayo", lastName: "", gender: "boy", class: "Primary 9 Z", g1_name: "Mr Ade", g1_phone: "12" },
        { firstName: "Chi", lastName: "Obi", gender: "x", admissionNo: "CS/1" },
        { firstName: "Dupe", lastName: "Ola", gender: "F", admissionNo: "cs/1" },
      ],
      classes,
    );
    expect(valid.map((v) => v.name)).toEqual(["Ada Eze"]);
    expect(valid[0].student.dateOfBirth).toBe("2016-03-14");
    expect(valid[0].guardians[0].phone).toBe("+2348031112222");
    const byRow = Object.fromEntries(errors.map((e) => [e.row, e.messages.join(" | ")]));
    expect(byRow[3]).toMatch(/Primary 9 Z.*doesn't exist/);
    expect(byRow[3]).toMatch(/Surname/);
    expect(byRow[3]).toMatch(/phone/);
    expect(byRow[4]).toMatch(/Gender/);
    expect(byRow[5]).toMatch(/also used on row 4/);
  });
});

describe("importing", () => {
  it("imports everything in one go, links siblings, and audits it", async () => {
    const rows = [
      { firstName: "Kemi", lastName: "Ade", gender: "F", class: "Primary 1 A", g1_name: "Mrs Ade", g1_phone: "08030000001" },
      { firstName: "Tolu", lastName: "Ade", gender: "M", class: "Primary 2 B", g1_name: "Mrs Ade", g1_phone: "0803 000 0001" },
    ];
    const preview = await previewImport(database.db, owner, rows, classes);
    expect(preview.errors).toEqual([]);
    expect(await commitImport(database.db, owner, preview.valid)).toBe(2);
    const kemi = (await listStudents(database.db, owner, { q: "Kemi" })).rows[0];
    const profile = await getStudent(database.db, owner, kemi.id);
    expect(profile?.siblings.map((s) => s.firstName)).toEqual(["Tolu"]);
  });

  it("flags admission numbers already in the school", async () => {
    const existing = (await listStudents(database.db, owner, { q: "Kemi" })).rows[0].admissionNo;
    const preview = await previewImport(database.db, owner, [{ firstName: "New", lastName: "Kid", gender: "M", admissionNo: existing }], classes);
    expect(preview.errors[0].messages[0]).toMatch(/already belongs/);
  });

  it("refuses an import that would pass the plan limit, and saves nothing", async () => {
    await database.db.update(plans).set({ limits: sql`jsonb_set(${plans.limits}, '{students}', '3')` }).where(eq(plans.key, "free"));
    const limited = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
    const rows = [
      { firstName: "One", lastName: "A", gender: "M" },
      { firstName: "Two", lastName: "B", gender: "F" },
    ];
    const preview = await previewImport(database.db, limited, rows, classes);
    expect(preview.overLimit).toBe(1);
    await expect(commitImport(database.db, limited, preview.valid)).rejects.toThrow(/allows 3/);
    expect((await listStudents(database.db, limited)).total).toBe(2);
  });
});
