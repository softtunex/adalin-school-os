import ExcelJS from "exceljs";
import { count, eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { students } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { getLimit, requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";
import { markOnboarding } from "./onboarding";
import { guardianInputSchema, insertStudent, studentInputSchema, type GuardianInput, type StudentInput } from "./students";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Template columns, in order. The import also accepts common alternative headings. */
export const IMPORT_COLUMNS = [
  { key: "admissionNo", header: "Admission no", example: "", note: "Leave empty to generate" },
  { key: "firstName", header: "First name", example: "Adaeze", note: "Required" },
  { key: "middleName", header: "Middle name", example: "Chioma", note: "" },
  { key: "lastName", header: "Surname", example: "Okafor", note: "Required" },
  { key: "gender", header: "Gender", example: "Female", note: "Male or Female" },
  { key: "dateOfBirth", header: "Date of birth", example: "14/03/2014", note: "DD/MM/YYYY" },
  { key: "class", header: "Class", example: "JSS 1 A", note: "Must match a class name" },
  { key: "stateOfOrigin", header: "State of origin", example: "Anambra", note: "" },
  { key: "lga", header: "LGA", example: "Awka South", note: "" },
  { key: "religion", header: "Religion", example: "Christianity", note: "" },
  { key: "address", header: "Address", example: "12 Allen Avenue, Ikeja", note: "" },
  { key: "g1_name", header: "Parent name", example: "Mrs Ngozi Okafor", note: "Required" },
  { key: "g1_relationship", header: "Parent relationship", example: "Mother", note: "" },
  { key: "g1_phone", header: "Parent phone", example: "0803 123 4567", note: "Links siblings" },
  { key: "g1_email", header: "Parent email", example: "ngozi@example.com", note: "" },
  { key: "g2_name", header: "Second parent name", example: "", note: "" },
  { key: "g2_relationship", header: "Second parent relationship", example: "", note: "" },
  { key: "g2_phone", header: "Second parent phone", example: "", note: "" },
] as const;

/** A template column, or one column holding the whole name (split on import). */
export type ColumnKey = (typeof IMPORT_COLUMNS)[number]["key"] | "fullName";
export const COLUMN_KEYS = new Set<string>([...IMPORT_COLUMNS.map((c) => c.key), "fullName"]);

const ALIASES: Record<string, ColumnKey> = {
  name: "fullName",
  names: "fullName",
  "full name": "fullName",
  "student name": "fullName",
  "name of student": "fullName",
  "pupil name": "fullName",
  "admission number": "admissionNo",
  "adm no": "admissionNo",
  "reg no": "admissionNo",
  "registration number": "admissionNo",
  firstname: "firstName",
  "first name": "firstName",
  "other name": "middleName",
  "other names": "middleName",
  "middle name": "middleName",
  "last name": "lastName",
  lastname: "lastName",
  surname: "lastName",
  sex: "gender",
  dob: "dateOfBirth",
  "date of birth": "dateOfBirth",
  "birth date": "dateOfBirth",
  "class name": "class",
  arm: "class",
  state: "stateOfOrigin",
  "father name": "g2_name",
  "mother name": "g1_name",
  "guardian name": "g1_name",
  "parent phone number": "g1_phone",
  "guardian phone": "g1_phone",
  "phone number": "g1_phone",
  "guardian email": "g1_email",
};

function headerKey(raw: string): ColumnKey | null {
  const h = raw.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const exact = IMPORT_COLUMNS.find((c) => c.header.toLowerCase() === h);
  if (exact) return exact.key;
  return ALIASES[h] ?? null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
  }
  return String(value).trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** What a column's values look like, without the values: enough for AI to match the heading, nothing personal. */
export function columnShape(values: string[]) {
  const v = values.map((x) => x.trim()).filter(Boolean).slice(0, 20);
  if (!v.length) return "empty";
  const all = (re: RegExp) => v.every((x) => re.test(x));
  if (all(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) return "email addresses";
  if (all(/^\+?[\d\s-]{10,16}$/)) return "phone numbers";
  if (all(/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/)) return "dates";
  if (all(/^(m|f|male|female|boy|girl)$/i)) return "male/female";
  const distinct = new Set(v.map((x) => x.toLowerCase())).size;
  const words = Math.round(v.reduce((n, x) => n + x.split(/\s+/).length, 0) / v.length);
  const digits = v.some((x) => /\d/.test(x));
  return `${digits ? "text with numbers" : "text"}, about ${words} word${words === 1 ? "" : "s"}${distinct <= 6 && v.length >= 4 ? `, few different values` : ""}`;
}

/** Splits a whole name. Nigerian lists often put the SURNAME first in capitals; otherwise it's first name first. */
export function splitFullName(raw: string) {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  const capsFirst = parts[0].length > 1 && parts[0] === parts[0].toUpperCase() && parts.slice(1).some((p) => p !== p.toUpperCase());
  const [first, middle, last] = capsFirst ? [parts[1], parts.slice(2).join(" "), parts[0]] : [parts[0], parts.slice(1, -1).join(" "), parts[parts.length - 1]];
  const title = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);
  return { firstName: title(first), middleName: middle ? middle.split(" ").map(title).join(" ") : undefined, lastName: title(last) };
}

export type HeaderMapper = (columns: { header: string; shape: string }[]) => Promise<Record<string, string | null>>;

/**
 * Reads an uploaded .xlsx or .csv into header-keyed rows. Headings it doesn't know can be matched by
 * `mapping` (from an earlier preview) or by `mapHeaders` (AI); `matched` reports what those decided.
 */
export async function readSpreadsheet(
  buffer: ArrayBuffer,
  filename: string,
  opts: { mapping?: Record<string, string>; mapHeaders?: HeaderMapper } = {},
): Promise<{ rows: Record<string, string>[]; unknownHeaders: string[]; matched: Record<string, ColumnKey> }> {
  let grid: string[][];
  if (/\.csv$/i.test(filename)) {
    grid = parseCsv(new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, ""));
  } else if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw new AppError("We couldn't read that Excel file. Save it as .xlsx or .csv and try again.", "invalid");
    }
    const sheet = wb.worksheets.find((ws) => ws.name.toLowerCase() === "students") ?? wb.worksheets[0];
    if (!sheet) throw new AppError("That file has no sheets.", "invalid");
    grid = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) values.push(cellText(row.getCell(c).value));
      if (values.some((v) => v)) grid.push(values);
    });
  } else {
    throw new AppError("Upload an Excel (.xlsx) or CSV file.", "invalid");
  }

  if (grid.length < 2) throw new AppError("The file has no student rows under the heading row.", "invalid");
  const headers: (ColumnKey | null)[] = grid[0].map((h) => headerKey(h));
  const matched: Record<string, ColumnKey> = {};
  const take = (i: number, key: string | null | undefined) => {
    if (!key || !COLUMN_KEYS.has(key) || headers.includes(key as ColumnKey)) return;
    headers[i] = key as ColumnKey;
    matched[grid[0][i].trim()] = key as ColumnKey;
  };
  if (opts.mapping) grid[0].forEach((h, i) => !headers[i] && take(i, opts.mapping![h.trim()]));
  // Row counters ("S/N", "No.") aren't data: skip them rather than guess or report them.
  const counter = (h: string) => /^(s\s*\/?\s*n|no\.?|serial( no\.?| number)?|#)$/i.test(h);
  const unmatched = () => grid[0].map((h, i) => ({ i, header: h.trim() })).filter((c) => c.header && !headers[c.i] && !counter(c.header));
  if (opts.mapHeaders && !opts.mapping && unmatched().length) {
    const cols = unmatched().map((c) => ({ ...c, shape: columnShape(grid.slice(1).map((r) => r[c.i] ?? "")) }));
    const answer = await opts.mapHeaders(cols.map(({ header, shape }) => ({ header, shape })));
    for (const c of cols) take(c.i, answer[c.header]);
  }
  const hasNames = (headers.includes("firstName") && headers.includes("lastName")) || headers.includes("fullName");
  if (!hasNames) {
    throw new AppError("We couldn't find the First name and Surname columns. Use the template headings.", "invalid");
  }
  const unknownHeaders = unmatched().map((c) => c.header);
  const isExample = (r: Record<string, string>) =>
    r.firstName === "Adaeze" && r.lastName === "Okafor" && r.g1_name === "Mrs Ngozi Okafor";
  const rows = grid
    .slice(1)
    .map((cells) => {
      const out: Record<string, string> = {};
      headers.forEach((key, i) => {
        if (key && cells[i] !== undefined) out[key] = String(cells[i]).trim();
      });
      if (out.fullName && !out.firstName && !out.lastName) {
        const n = splitFullName(out.fullName);
        out.firstName = n.firstName;
        out.lastName = n.lastName;
        if (n.middleName && !out.middleName) out.middleName = n.middleName;
      }
      delete out.fullName;
      return out;
    })
    .filter((r) => !isExample(r));
  if (rows.length > MAX_IMPORT_ROWS) throw new AppError(`Import up to ${MAX_IMPORT_ROWS} students at a time. Split the file and try again.`, "invalid");
  return { rows, unknownHeaders, matched };
}

function normalizeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? (Number(y) > 50 ? `19${y}` : `20${y}`) : y;
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

function normalizeGender(raw: string | undefined) {
  const g = (raw ?? "").trim().toLowerCase();
  if (["f", "female", "girl"].includes(g)) return "female";
  if (["m", "male", "boy"].includes(g)) return "male";
  return g;
}

const compact = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export type ImportRow = { row: number; name: string; className: string | null; student: StudentInput; guardians: GuardianInput[] };
export type ImportError = { row: number; name: string; messages: string[] };

export function validateImportRows(rows: Record<string, string>[], classOptions: { id: string; name: string }[]) {
  const classByName = new Map(classOptions.map((c) => [compact(c.name), c]));
  const valid: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenAdmission = new Map<string, number>();

  rows.forEach((raw, i) => {
    const row = i + 2;
    const name = [raw.firstName, raw.lastName].filter(Boolean).join(" ") || `Row ${row}`;
    const messages: string[] = [];

    let classId: string | null = null;
    let className: string | null = null;
    if (raw.class?.trim()) {
      const cls = classByName.get(compact(raw.class));
      if (!cls) messages.push(`Class "${raw.class}" doesn't exist. Use a class name exactly as it appears in Academics.`);
      else {
        classId = cls.id;
        className = cls.name;
      }
    }

    const parsed = studentInputSchema.safeParse({
      firstName: raw.firstName ?? "",
      middleName: raw.middleName,
      lastName: raw.lastName ?? "",
      gender: normalizeGender(raw.gender),
      dateOfBirth: normalizeDate(raw.dateOfBirth),
      admissionNo: raw.admissionNo,
      classId,
      stateOfOrigin: raw.stateOfOrigin,
      lga: raw.lga,
      religion: raw.religion,
      address: raw.address,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = IMPORT_COLUMNS.find((c) => c.key === issue.path[0])?.header ?? String(issue.path[0]);
        messages.push(`${field}: ${issue.message}`);
      }
    }

    if (raw.admissionNo?.trim()) {
      const key = raw.admissionNo.trim().toLowerCase();
      if (seenAdmission.has(key)) messages.push(`Admission no ${raw.admissionNo} is also used on row ${seenAdmission.get(key)}.`);
      else seenAdmission.set(key, row);
    }

    const guardians: GuardianInput[] = [];
    for (const prefix of ["g1", "g2"] as const) {
      const gName = raw[`${prefix}_name`]?.trim();
      const gPhone = raw[`${prefix}_phone`]?.trim();
      if (!gName && !gPhone) continue;
      const g = guardianInputSchema.safeParse({
        name: gName || "Parent",
        relationship: raw[`${prefix}_relationship`]?.trim() || (prefix === "g1" ? "Parent" : "Parent"),
        phone: gPhone,
        email: prefix === "g1" ? raw.g1_email : undefined,
      });
      if (!g.success) for (const issue of g.error.issues) messages.push(`${prefix === "g1" ? "Parent" : "Second parent"} ${String(issue.path[0])}: ${issue.message}`);
      else guardians.push(g.data);
    }

    if (messages.length || !parsed.success) errors.push({ row, name, messages });
    else valid.push({ row, name, className, student: parsed.data, guardians });
  });

  return { valid, errors };
}

/** Checks the file against the database (existing admission numbers, plan limit) without writing anything. */
export async function previewImport(db: DB, access: Access, rows: Record<string, string>[], classOptions: { id: string; name: string }[]) {
  requirePermission(access, "students:import");
  requireFeature(access.plan, "bulk_import");
  const result = validateImportRows(rows, classOptions);
  return withTenant(db, access.school.id, async (tx) => {
    const admissionNos = result.valid.map((r) => r.student.admissionNo).filter((a): a is string => Boolean(a));
    const taken = admissionNos.length
      ? new Set((await tx.select({ a: students.admissionNo }).from(students).where(inArray(students.admissionNo, admissionNos))).map((r) => r.a))
      : new Set<string>();
    const valid: ImportRow[] = [];
    const errors = [...result.errors];
    for (const r of result.valid) {
      if (r.student.admissionNo && taken.has(r.student.admissionNo)) errors.push({ row: r.row, name: r.name, messages: [`Admission no ${r.student.admissionNo} already belongs to another student.`] });
      else valid.push(r);
    }
    errors.sort((a, b) => a.row - b.row);
    const [{ active }] = await tx.select({ active: count() }).from(students).where(eq(students.status, "active"));
    const limit = getLimit(access.plan, "students");
    const overLimit = limit !== null && active + valid.length > limit ? active + valid.length - limit : 0;
    return { valid, errors, overLimit, limit, active };
  });
}

/** Imports every valid row in one transaction: all of them go in, or none do. */
export async function commitImport(db: DB, access: Access, rows: ImportRow[], ip?: string | null) {
  requirePermission(access, "students:import");
  requireFeature(access.plan, "bulk_import");
  if (rows.length === 0) throw new AppError("There are no valid rows to import.", "invalid");
  return withTenant(db, access.school.id, async (tx) => {
    const [{ active }] = await tx.select({ active: count() }).from(students).where(eq(students.status, "active"));
    const limit = getLimit(access.plan, "students");
    if (limit !== null && active + rows.length > limit) {
      throw new AppError(`This import would take you to ${active + rows.length} students. Your ${access.plan.name} plan allows ${limit}.`, "limit");
    }
    for (const r of rows) {
      try {
        await insertStudent(tx, access.school.id, r.student, r.guardians);
      } catch (error) {
        if (error instanceof AppError) throw new AppError(`Row ${r.row} (${r.name}): ${error.message}`, error.code);
        throw error;
      }
    }
    await markOnboarding(tx, access.school.id, "students");
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "student.imported",
      summary: `Imported ${rows.length} students from a spreadsheet`,
      meta: { count: rows.length },
    });
    return rows.length;
  });
}

/** The downloadable template, with the school's real class names on a second sheet. */
export async function buildTemplate(classNames: string[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Adalin SchoolHub";
  const sheet = wb.addWorksheet("Students");
  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 4) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFE6007" } };
  sheet.addRow(Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.key === "class" ? (classNames[0] ?? c.example) : c.example])));
  sheet.getRow(2).font = { italic: true, color: { argb: "FF84848B" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const help = wb.addWorksheet("How to fill this in");
  help.columns = [
    { header: "Column", key: "header", width: 28 },
    { header: "Notes", key: "note", width: 50 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of IMPORT_COLUMNS) help.addRow({ header: c.header, note: c.note });
  help.addRow({});
  help.addRow({ header: "Delete the grey example row before importing." });

  const classSheet = wb.addWorksheet("Class names");
  classSheet.columns = [{ header: "Use one of these in the Class column", key: "name", width: 40 }];
  classSheet.getRow(1).font = { bold: true };
  for (const name of classNames) classSheet.addRow({ name });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
