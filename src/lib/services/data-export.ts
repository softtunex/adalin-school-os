import { and, eq, inArray, sql } from "drizzle-orm";
import { Zip, ZipDeflate } from "fflate";
import { toCsv } from "../csv";
import type { DB } from "../db/client";
import { auditLogs, memberships, schools, students, TENANT_TABLES, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";

/*
 * NDPA data portability: a school can take all of its data away, and can answer a
 * person's request for the data held about them. Exports are CSV files in a ZIP,
 * streamed so a large school doesn't hit response size limits. Secrets (password and
 * PIN hashes, payment and verification tokens) are never exported.
 */

type File = { name: string; data: Uint8Array };
type Actor = { userId: string; name: string; ip?: string | null };

const enc = new TextEncoder();
const SECRET = /(_hash$|token|secret)/;
const csvFile = (name: string, headers: string[], rows: unknown[][]): File => ({ name, data: enc.encode(`﻿${toCsv(headers, rows.map((r) => r.map(cellValue)))}`) });

function cellValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return v as string | number;
}

/** Columns of each school table, minus secrets and the school_id every row shares. */
async function tableColumns(db: DB) {
  const rows = await db.execute(
    sql`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in (${sql.join(
      TENANT_TABLES.map((t) => sql`${t}`),
      sql`, `,
    )}) order by table_name, ordinal_position`,
  );
  const out = new Map<string, string[]>();
  for (const r of rowsOf<{ table_name: string; column_name: string }>(rows)) {
    if (r.column_name === "school_id" || SECRET.test(r.column_name)) continue;
    out.set(r.table_name, [...(out.get(r.table_name) ?? []), r.column_name]);
  }
  return out;
}

function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

async function selectRows(db: DB, schoolId: string, table: string, columns: string[], where?: { column: string; ids: string[] }) {
  const cols = sql.join(
    columns.map((c) => sql.identifier(c)),
    sql`, `,
  );
  const filter = where ? sql` where ${sql.identifier(where.column)} in (${sql.join(where.ids.map((id) => sql`${id}`), sql`, `)})` : sql``;
  const result = await withTenant(db, schoolId, (tx) => tx.execute(sql`select ${cols} from ${sql.identifier(table)}${filter}`));
  return rowsOf<Record<string, unknown>>(result).map((r) => columns.map((c) => r[c]));
}

/** Streams files into a ZIP as they're produced. */
export function zipStream(files: AsyncIterable<File>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        for await (const f of files) {
          const entry = new ZipDeflate(f.name, { level: 6 });
          zip.add(entry);
          entry.push(f.data, true);
        }
        zip.end();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

const README = (school: string, what: string) =>
  `${what}\r\nFrom ${school}, exported from Adalin SchoolHub on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.\r\n\r\nEach .csv file is one kind of record and opens in Excel or Google Sheets. Records link to each other by their id columns (for example student_id in scores.csv is the id in students.csv). Amounts ending in _kobo are in kobo: divide by 100 for naira. Times are in UTC.\r\n\r\nPasswords, PINs and payment links are never exported.\r\n\r\nKeep this file safe: it contains personal data protected by the Nigeria Data Protection Act.\r\n`;

/** Everything the school holds, one CSV per kind of record. Only the proprietor can take it. */
export async function exportSchool(db: DB, access: Access, ip?: string | null) {
  requirePermission(access, "school:export");
  const schoolId = access.school.id;
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  const columns = await tableColumns(db);
  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, username: users.username, createdAt: users.createdAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.schoolId, schoolId), sql`${memberships.supportUntil} is null`));
  await withTenant(db, schoolId, (tx) =>
    recordAudit(tx, schoolId, { userId: access.user.id, name: access.user.name, ip }, { action: "data.exported", summary: "Downloaded all of the school's data" }),
  );
  // Adalin's private notes and overrides stay out.
  const profile = Object.fromEntries(Object.entries(school).filter(([k]) => !["adminNote", "adminGrants", "adminBlocks"].includes(k)));
  async function* files(): AsyncGenerator<File> {
    yield { name: "README.txt", data: enc.encode(README(school.name, "All of your school's data.")) };
    yield csvFile("school.csv", Object.keys(profile), [Object.values(profile)]);
    yield csvFile("people.csv", ["id", "name", "email", "phone", "username", "created_at"], people.map((p) => [p.id, p.name, p.email, p.phone, p.username, p.createdAt]));
    for (const table of TENANT_TABLES) {
      const cols = columns.get(table);
      if (!cols?.length) continue;
      yield csvFile(`${table}.csv`, cols, await selectRows(db, schoolId, table, cols));
    }
  }
  return { filename: `${school.slug}-all-data-${lagosToday()}.zip`, stream: zipStream(files()) };
}

/** Columns that make a record about a staff member (not just something they did). */
const STAFF_COLUMNS = ["membership_id", "teacher_id", "class_teacher_id", "warden_id"];

/**
 * A person's own data, for a subject access request: every record about one student (with
 * their parents' contact details), or one member of staff.
 */
export async function exportPerson(db: DB, access: Access, subject: { studentId?: string; membershipId?: string }, actor: Actor) {
  requirePermission(access, "school:export");
  const schoolId = access.school.id;
  const columns = await tableColumns(db);
  let label: string;
  let match: { column: string; ids: string[] }[];
  let extra: File[] = [];
  if (subject.studentId) {
    const [s] = await withTenant(db, schoolId, (tx) => tx.select().from(students).where(eq(students.id, subject.studentId!)));
    if (!s) throw new AppError("That student wasn't found.", "not_found");
    label = `${s.firstName} ${s.lastName}`;
    match = [{ column: "student_id", ids: [s.id] }];
    const links = await selectRows(db, schoolId, "student_guardians", ["guardian_id"], { column: "student_id", ids: [s.id] });
    const guardianIds = links.map((r) => r[0] as string);
    if (guardianIds.length) {
      const cols = columns.get("guardians")!;
      extra = [csvFile("guardians.csv", cols, await selectRows(db, schoolId, "guardians", cols, { column: "id", ids: guardianIds }))];
    }
    const cols = columns.get("students")!;
    extra.unshift(csvFile("students.csv", cols, await selectRows(db, schoolId, "students", cols, { column: "id", ids: [s.id] })));
    if (s.userId) {
      const [u] = await db.select({ id: users.id, name: users.name, username: users.username, createdAt: users.createdAt }).from(users).where(eq(users.id, s.userId));
      if (u) extra.push(csvFile("login.csv", ["id", "name", "username", "created_at"], [[u.id, u.name, u.username, u.createdAt]]));
    }
  } else if (subject.membershipId) {
    const [m] = await withTenant(db, schoolId, (tx) => tx.select().from(memberships).where(eq(memberships.id, subject.membershipId!)));
    if (!m) throw new AppError("That staff member wasn't found.", "not_found");
    const [u] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, createdAt: users.createdAt }).from(users).where(eq(users.id, m.userId));
    label = u.name;
    match = STAFF_COLUMNS.map((column) => ({ column, ids: [m.id] }));
    extra = [csvFile("person.csv", ["id", "name", "email", "phone", "created_at"], [[u.id, u.name, u.email, u.phone, u.createdAt]])];
  } else throw new AppError("Choose a person.", "invalid");

  const files: File[] = [{ name: "README.txt", data: enc.encode(README(access.school.name, `The data ${access.school.name} holds about ${label}.`)) }, ...extra];
  for (const table of TENANT_TABLES) {
    const cols = columns.get(table);
    if (!cols || table === "students" || table === "guardians") continue;
    for (const m of match) {
      if (subject.membershipId && m.column === "membership_id" && table === "memberships") continue;
      if (!cols.includes(m.column)) continue;
      const rows = await selectRows(db, schoolId, table, cols, m);
      if (rows.length) files.push(csvFile(`${table}${match.length > 1 && m.column !== "membership_id" ? `-${m.column}` : ""}.csv`, cols, rows));
    }
  }
  if (subject.membershipId) {
    const cols = columns.get("memberships")!;
    files.splice(2, 0, csvFile("memberships.csv", cols, await selectRows(db, schoolId, "memberships", cols, { column: "id", ids: [subject.membershipId] })));
  }
  await withTenant(db, schoolId, (tx) =>
    recordAudit(tx, schoolId, actor, { action: "data.person_exported", summary: `Downloaded the data held about ${label}`, entityType: subject.studentId ? "student" : "membership", entityId: subject.studentId ?? subject.membershipId }),
  );
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { filename: `${slug}-data-${lagosToday()}.zip`, files, stream: zipStream((async function* () { yield* files; })()) };
}

/** The school's recent exports, for the Data & privacy tab. */
export async function exportHistory(db: DB, access: Access) {
  requirePermission(access, "school:export");
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({ at: auditLogs.createdAt, by: auditLogs.actorName, summary: auditLogs.summary })
      .from(auditLogs)
      .where(inArray(auditLogs.action, ["data.exported", "data.person_exported"]))
      .orderBy(sql`${auditLogs.createdAt} desc`)
      .limit(20),
  );
}
