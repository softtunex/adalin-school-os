import { and, asc, count, desc, eq, ilike, inArray, isNull, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "../db/client";
import { classes, libraryBooks, libraryLoans, membershipRoles, memberships, roles, schools, students, users, type LibrarySettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira } from "../money";
import { hasFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { requireStudent } from "./student-portal";

/*
 * The school library: a catalogue with copies per title, loans to students and staff with
 * due dates and borrowing limits, and overdue fines worked out on return.
 */

export const BOOK_PAGE_SIZE = 25;
export const DEFAULT_LIBRARY: Required<LibrarySettings> = { loanDays: 14, maxLoans: 3, finePerDayKobo: 50_00 };

export function librarySettings(s: LibrarySettings): Required<LibrarySettings> {
  return { ...DEFAULT_LIBRARY, ...s };
}

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

function requireLibrary(access: Access) {
  if (!hasFeature(access.plan, "library")) throw new AppError("The library is on the Premium plan.", "upgrade");
  requirePermission(access, "operations:library");
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysLate(dueOn: string, on: string) {
  return Math.max(0, Math.round((Date.parse(on) - Date.parse(dueOn)) / 86_400_000));
}

// ---------- Settings ----------

export const librarySettingsSchema = z.object({
  loanDays: z.number().int().min(1).max(120),
  maxLoans: z.number().int().min(1).max(20),
  finePerDayKobo: z.number().int().min(0).max(100_000_00),
});

export async function saveLibrarySettings(db: DB, access: Access, input: z.infer<typeof librarySettingsSchema>, ip?: string | null) {
  requireLibrary(access);
  await db.update(schools).set({ librarySettings: input }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, actor(access, ip), { action: "library.settings", summary: `Library: ${input.loanDays}-day loans, up to ${input.maxLoans} books, ${formatNaira(input.finePerDayKobo)} a day late` }),
  );
}

// ---------- Catalogue ----------

export function cleanIsbn(raw: string) {
  const s = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  return s.length === 10 || s.length === 13 ? s : null;
}

/** Title, author and publisher for an ISBN from Open Library, or null when it isn't found. */
export async function lookupIsbn(raw: string) {
  const isbn = cleanIsbn(raw);
  if (!isbn) throw new AppError("ISBNs are 10 or 13 digits.", "invalid");
  try {
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { headers: { "User-Agent": "SchoolOS/1.0 (library lookup)" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { title?: string; subtitle?: string; authors?: { name: string }[]; publishers?: { name: string }[]; publish_date?: string; subjects?: { name: string }[] }>;
    const b = data[`ISBN:${isbn}`];
    if (!b?.title) return null;
    const year = Number(b.publish_date?.match(/\d{4}/)?.[0]);
    return {
      isbn,
      title: b.subtitle ? `${b.title}: ${b.subtitle}` : b.title,
      author: b.authors?.map((a) => a.name).join(", ") ?? "",
      publisher: b.publishers?.[0]?.name ?? "",
      year: Number.isFinite(year) ? year : null,
      category: b.subjects?.[0]?.name ?? "",
    };
  } catch {
    return null;
  }
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const bookSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Enter the title.").max(300),
  author: opt(200),
  isbn: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const c = cleanIsbn(v);
      if (!c) {
        ctx.addIssue({ code: "custom", message: "ISBNs are 10 or 13 digits." });
        return z.NEVER;
      }
      return c;
    }),
  publisher: opt(200),
  year: z.number().int().min(1450).max(2100).nullable().default(null),
  category: opt(80),
  shelf: opt(40),
  copies: z.number().int().min(1, "At least one copy.").max(500),
});

export async function saveBook(db: DB, access: Access, input: z.infer<typeof bookSchema>, ip?: string | null) {
  requireLibrary(access);
  return withTenant(db, access.school.id, async (tx) => {
    const values = { title: input.title, author: input.author, isbn: input.isbn, publisher: input.publisher, year: input.year, category: input.category, shelf: input.shelf, copies: input.copies };
    if (input.id) {
      const out = await onLoan(tx, input.id);
      if (input.copies < out) throw new AppError(`${out} cop${out === 1 ? "y is" : "ies are"} on loan, so there must be at least ${out}.`, "invalid");
      const [row] = await tx.update(libraryBooks).set(values).where(eq(libraryBooks.id, input.id)).returning();
      if (!row) throw new AppError("That book wasn't found.", "not_found");
      return row;
    }
    if (input.isbn) {
      const [dup] = await tx.select().from(libraryBooks).where(eq(libraryBooks.isbn, input.isbn));
      if (dup) throw new AppError(`"${dup.title}" is already in the catalogue. Add copies to it instead.`, "conflict");
    }
    const [row] = await tx.insert(libraryBooks).values({ ...values, schoolId: access.school.id }).returning();
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "library.book_added", summary: `Added "${row.title}" (${row.copies} cop${row.copies === 1 ? "y" : "ies"})`, entityType: "book", entityId: row.id });
    return row;
  });
}

export async function deleteBook(db: DB, access: Access, id: string, ip?: string | null) {
  requireLibrary(access);
  await withTenant(db, access.school.id, async (tx) => {
    if ((await onLoan(tx, id)) > 0) throw new AppError("Some copies are on loan. Return them first.", "conflict");
    const [b] = await tx.delete(libraryBooks).where(eq(libraryBooks.id, id)).returning();
    if (b) await recordAudit(tx, access.school.id, actor(access, ip), { action: "library.book_removed", summary: `Removed "${b.title}"` });
  });
}

async function onLoan(tx: Tx, bookId: string) {
  const [{ n }] = await tx.select({ n: count() }).from(libraryLoans).where(and(eq(libraryLoans.bookId, bookId), isNull(libraryLoans.returnedOn)));
  return n;
}

const outCount = sql<number>`(select count(*) from library_loans l where l.book_id = "library_books"."id" and l.returned_on is null)`.mapWith(Number);

export async function listBooks(db: DB, access: Access, filter: { q?: string; category?: string; available?: string; page?: number } = {}) {
  requireLibrary(access);
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [];
    if (filter.q) where.push(or(ilike(libraryBooks.title, `%${filter.q}%`), ilike(libraryBooks.author, `%${filter.q}%`), ilike(libraryBooks.isbn, `%${filter.q}%`))!);
    if (filter.category) where.push(eq(libraryBooks.category, filter.category));
    if (filter.available === "yes") where.push(sql`${libraryBooks.copies} > ${outCount}`);
    const page = Math.max(1, filter.page ?? 1);
    const today = lagosToday();
    const [[{ total }], rows, [stats], categories] = await Promise.all([
      tx.select({ total: count() }).from(libraryBooks).where(and(...where)),
      tx
        .select({ b: libraryBooks, out: outCount })
        .from(libraryBooks)
        .where(and(...where))
        .orderBy(asc(libraryBooks.title))
        .limit(BOOK_PAGE_SIZE)
        .offset((page - 1) * BOOK_PAGE_SIZE),
      tx
        .select({
          titles: sql<number>`(select count(*) from library_books)`.mapWith(Number),
          copies: sql<number>`(select coalesce(sum(copies), 0) from library_books)`.mapWith(Number),
          onLoan: sql<number>`count(*) filter (where ${libraryLoans.returnedOn} is null)`.mapWith(Number),
          overdue: sql<number>`count(*) filter (where ${libraryLoans.returnedOn} is null and ${libraryLoans.dueOn} < ${today})`.mapWith(Number),
          fines: sql<number>`coalesce(sum(${libraryLoans.fineKobo}) filter (where not ${libraryLoans.finePaid}), 0)`.mapWith(Number),
        })
        .from(libraryLoans),
      tx.selectDistinct({ category: libraryBooks.category }).from(libraryBooks).where(isNotNull(libraryBooks.category)).orderBy(asc(libraryBooks.category)),
    ]);
    return { rows, total, stats, categories: categories.map((c) => c.category!) };
  });
}

// ---------- Loans ----------

export const issueSchema = z
  .object({
    bookIds: z
      .array(z.string().uuid())
      .min(1, "Choose at least one book.")
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, "The same book is in the list twice."),
    studentId: z.string().uuid().nullable().default(null),
    membershipId: z.string().uuid().nullable().default(null),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note: z.string().trim().max(200).default(""),
  })
  .refine((v) => !!v.studentId !== !!v.membershipId, { path: ["studentId"], message: "Choose who's borrowing it." });

/** Lends one or more books to one borrower, all due back the same day. All or nothing. */
export async function issueBooks(db: DB, access: Access, input: z.infer<typeof issueSchema>, ip?: string | null) {
  requireLibrary(access);
  const s = librarySettings(access.school.librarySettings);
  const today = lagosToday();
  const dueOn = input.dueOn ?? addDays(today, s.loanDays);
  if (dueOn < today) throw new AppError("The due date can't be in the past.", "invalid");
  return withTenant(db, access.school.id, async (tx) => {
    const books = [];
    for (const id of input.bookIds) {
      const [book] = await tx.select().from(libraryBooks).where(eq(libraryBooks.id, id));
      if (!book) throw new AppError("That book wasn't found.", "not_found");
      if ((await onLoan(tx, book.id)) >= book.copies) throw new AppError(`Every copy of "${book.title}" is out.`, "conflict");
      books.push(book);
    }
    const borrower = input.studentId ? eq(libraryLoans.studentId, input.studentId) : eq(libraryLoans.membershipId, input.membershipId!);
    const [{ n }] = await tx.select({ n: count() }).from(libraryLoans).where(and(borrower, isNull(libraryLoans.returnedOn)));
    if (n + books.length > s.maxLoans) {
      const room = Math.max(0, s.maxLoans - n);
      throw new AppError(
        n ? `They already have ${n} book${n === 1 ? "" : "s"} out, so they can take ${room ? `only ${room} more` : "no more"} (the limit is ${s.maxLoans}).` : `That's more than the limit of ${s.maxLoans} books each.`,
        "conflict",
      );
    }
    const [already] = await tx
      .select({ title: libraryBooks.title })
      .from(libraryLoans)
      .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
      .where(and(borrower, isNull(libraryLoans.returnedOn), inArray(libraryLoans.bookId, input.bookIds)));
    if (already) throw new AppError(`They already have a copy of "${already.title}".`, "conflict");
    const [overdue] = await tx.select({ id: libraryLoans.id }).from(libraryLoans).where(and(borrower, isNull(libraryLoans.returnedOn), lt(libraryLoans.dueOn, today)));
    if (overdue) throw new AppError("They have an overdue book. It needs to come back first.", "conflict");
    let who = "";
    if (input.studentId) {
      const [st] = await tx.select().from(students).where(eq(students.id, input.studentId));
      if (!st || st.status !== "active") throw new AppError("That student wasn't found.", "not_found");
      who = `${st.firstName} ${st.lastName}`;
    } else {
      const [m] = await tx.select({ name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.id, input.membershipId!), eq(memberships.status, "active")));
      if (!m) throw new AppError("That staff member wasn't found.", "not_found");
      who = m.name;
    }
    const loans = await tx
      .insert(libraryLoans)
      .values(books.map((book) => ({ schoolId: access.school.id, bookId: book.id, studentId: input.studentId, membershipId: input.membershipId, issuedOn: today, dueOn, issuedBy: access.membershipId, note: input.note || null })))
      .returning();
    for (const book of books) {
      await recordAudit(tx, access.school.id, actor(access, ip), { action: "library.issued", summary: `Lent "${book.title}" to ${who}, due ${dueOn}`, entityType: "book", entityId: book.id });
    }
    return { loans, dueOn, who };
  });
}

/** Takes a book back and works out any fine for days late. */
export async function returnBook(db: DB, access: Access, loanId: string, opts: { waiveFine?: boolean } = {}, ip?: string | null) {
  requireLibrary(access);
  const s = librarySettings(access.school.librarySettings);
  const today = lagosToday();
  return withTenant(db, access.school.id, async (tx) => {
    const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId));
    if (!loan) throw new AppError("That loan wasn't found.", "not_found");
    if (loan.returnedOn) throw new AppError("Already returned.", "conflict");
    const late = daysLate(loan.dueOn, today);
    const fine = opts.waiveFine ? 0 : late * s.finePerDayKobo;
    await tx.update(libraryLoans).set({ returnedOn: today, fineKobo: fine, finePaid: fine === 0 }).where(eq(libraryLoans.id, loanId));
    await recordAudit(tx, access.school.id, actor(access, ip), {
      action: "library.returned",
      summary: `Book returned${late ? `, ${late} day${late === 1 ? "" : "s"} late${fine ? ` (fine ${formatNaira(fine)})` : " (fine waived)"}` : ""}`,
      entityType: "book",
      entityId: loan.bookId,
    });
    return { late, fine };
  });
}

export async function markFinePaid(db: DB, access: Access, loanId: string, ip?: string | null) {
  requireLibrary(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [loan] = await tx.select().from(libraryLoans).where(eq(libraryLoans.id, loanId));
    if (!loan || !loan.fineKobo) throw new AppError("There's no fine on that loan.", "not_found");
    await tx.update(libraryLoans).set({ finePaid: true }).where(eq(libraryLoans.id, loanId));
    await recordAudit(tx, access.school.id, actor(access, ip), { action: "library.fine_paid", summary: `Library fine of ${formatNaira(loan.fineKobo)} paid`, entityType: "book", entityId: loan.bookId });
  });
}

export async function listLoans(db: DB, access: Access, filter: { view?: string; q?: string } = {}) {
  requireLibrary(access);
  const today = lagosToday();
  return withTenant(db, access.school.id, async (tx) => {
    const where: SQL[] = [];
    if (filter.view === "overdue") where.push(isNull(libraryLoans.returnedOn), lt(libraryLoans.dueOn, today));
    else if (filter.view === "fines") where.push(sql`${libraryLoans.fineKobo} > 0`, eq(libraryLoans.finePaid, false));
    else if (filter.view === "returned") where.push(isNotNull(libraryLoans.returnedOn));
    else where.push(isNull(libraryLoans.returnedOn));
    if (filter.q) where.push(or(ilike(libraryBooks.title, `%${filter.q}%`), ilike(students.firstName, `%${filter.q}%`), ilike(students.lastName, `%${filter.q}%`), ilike(users.name, `%${filter.q}%`))!);
    const rows = await tx
      .select({ loan: libraryLoans, title: libraryBooks.title, author: libraryBooks.author, studentName: sql<string | null>`${students.firstName} || ' ' || ${students.lastName}`, className: classes.name, staffName: users.name })
      .from(libraryLoans)
      .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
      .leftJoin(students, eq(students.id, libraryLoans.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(memberships, eq(memberships.id, libraryLoans.membershipId))
      .leftJoin(users, eq(users.id, memberships.userId))
      .where(and(...where))
      .orderBy(filter.view === "returned" ? desc(libraryLoans.returnedOn) : asc(libraryLoans.dueOn))
      .limit(200);
    const s = librarySettings(access.school.librarySettings);
    return { rows: rows.map((r) => ({ ...r, late: r.loan.returnedOn ? 0 : daysLate(r.loan.dueOn, today), fineSoFar: r.loan.returnedOn ? r.loan.fineKobo : daysLate(r.loan.dueOn, today) * s.finePerDayKobo })), today };
  });
}

/** Who can borrow: active students and staff, for the issue form. */
export async function borrowers(db: DB, access: Access) {
  requireLibrary(access);
  return withTenant(db, access.school.id, async (tx) => {
    const [kids, staff, books] = await Promise.all([
      tx
        .select({ id: students.id, name: sql<string>`${students.firstName} || ' ' || ${students.lastName}`, detail: sql<string>`coalesce(${classes.name}, '') || ' · ' || ${students.admissionNo}` })
        .from(students)
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(eq(students.status, "active"))
        .orderBy(asc(students.firstName)),
      tx
        .selectDistinct({ id: memberships.id, name: users.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff"))),
      tx.select({ id: libraryBooks.id, title: libraryBooks.title, author: libraryBooks.author, copies: libraryBooks.copies, out: outCount }).from(libraryBooks).orderBy(asc(libraryBooks.title)),
    ]);
    return { students: kids, staff: staff.sort((a, b) => a.name.localeCompare(b.name)), books: books.filter((b) => b.out < b.copies) };
  });
}

// ---------- Students ----------

/** A student's own loans and a search of the catalogue. */
export async function getStudentLibrary(db: DB, userId: string, q?: string) {
  const me = await requireStudent(db, userId);
  if (!me.school.features.includes("library")) return null;
  const today = lagosToday();
  return withTenant(db, me.schoolId, async (tx) => {
    const [loans, results] = await Promise.all([
      tx
        .select({ loan: libraryLoans, title: libraryBooks.title, author: libraryBooks.author })
        .from(libraryLoans)
        .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
        .where(eq(libraryLoans.studentId, me.studentId))
        .orderBy(desc(libraryLoans.issuedOn))
        .limit(30),
      q && q.trim().length >= 2
        ? tx
            .select({ b: libraryBooks, out: outCount })
            .from(libraryBooks)
            .where(or(ilike(libraryBooks.title, `%${q.trim()}%`), ilike(libraryBooks.author, `%${q.trim()}%`)))
            .orderBy(asc(libraryBooks.title))
            .limit(30)
        : Promise.resolve([]),
    ]);
    return { me, today, current: loans.filter((l) => !l.loan.returnedOn).map((l) => ({ ...l, late: daysLate(l.loan.dueOn, today) })), past: loans.filter((l) => l.loan.returnedOn), results };
  });
}
