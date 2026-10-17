import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { libraryLoans, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { bookSchema, cleanIsbn, issueBook, issueSchema, listBooks, listLoans, librarySettingsSchema, markFinePaid, returnBook, saveBook, saveLibrarySettings } from "@/lib/services/library";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let librarian: Access;
let teacher: Access;
const kids: Record<string, string> = {};
const books: Record<string, string> = {};

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Books", email: "books@lib.test", password: "Library123", schoolName: "Library College" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const gold = (await getAcademicOverview(database.db, owner)).levels[0].classes[0].id;
  librarian = await staff("librarian", "lib@lib.test");
  teacher = await staff("subject_teacher", "teach@lib.test");
  for (const name of ["Ada", "Bayo"]) kids[name] = (await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Read", gender: "female", classId: gold }), [])).id;
});

afterAll(async () => {
  await database.close();
});

describe("library", () => {
  it("keeps a catalogue for the librarian", async () => {
    expect(cleanIsbn("978-0-14-303943-3")).toBe("9780143039433");
    expect(cleanIsbn("12345")).toBeNull();
    await expect(saveBook(database.db, teacher, bookSchema.parse({ title: "Things Fall Apart", copies: 1 }))).rejects.toThrow(/permission/);
    books.tfa = (await saveBook(database.db, librarian, bookSchema.parse({ title: "Things Fall Apart", author: "Chinua Achebe", isbn: "978-0-385-47454-2", category: "Literature", copies: 1 }))).id;
    books.maths = (await saveBook(database.db, librarian, bookSchema.parse({ title: "New General Mathematics JSS 1", author: "M. F. Macrae", copies: 5, category: "Textbook" }))).id;
    expect(bookSchema.safeParse({ title: "Bad ISBN", isbn: "12345", copies: 1 }).success).toBe(false);
    await expect(saveBook(database.db, librarian, bookSchema.parse({ title: "Another", isbn: "9780385474542", copies: 1 }))).rejects.toThrow(/already in the catalogue/);
    expect((await listBooks(database.db, librarian)).stats).toMatchObject({ titles: 2, copies: 6 });
  });

  it("lends within copies and limits", async () => {
    await saveLibrarySettings(database.db, owner, librarySettingsSchema.parse({ loanDays: 14, maxLoans: 2, finePerDayKobo: 5_000 }));
    librarian = (await loadAccess(database.db, librarian.user.id, owner.school.slug))!;
    await issueBook(database.db, librarian, issueSchema.parse({ bookId: books.tfa, studentId: kids.Ada }));
    await expect(issueBook(database.db, librarian, issueSchema.parse({ bookId: books.tfa, studentId: kids.Bayo }))).rejects.toThrow(/Every copy/);
    await issueBook(database.db, librarian, issueSchema.parse({ bookId: books.maths, studentId: kids.Ada }));
    await expect(issueBook(database.db, librarian, issueSchema.parse({ bookId: books.maths, studentId: kids.Ada }))).rejects.toThrow(/limit is 2/);
    await issueBook(database.db, librarian, issueSchema.parse({ bookId: books.maths, membershipId: teacher.membershipId }));
    expect(issueSchema.safeParse({ bookId: books.maths }).success).toBe(false);
    expect((await listLoans(database.db, librarian)).rows).toHaveLength(3);
    const shelf = await listBooks(database.db, librarian);
    expect(shelf.rows.find((r) => r.b.id === books.tfa)?.out).toBe(1);
    expect(shelf.rows.find((r) => r.b.id === books.maths)?.out).toBe(2);
    expect((await listBooks(database.db, librarian, { available: "yes" })).rows.map((r) => r.b.id)).toEqual([books.maths]);
  });

  it("blocks new loans while a book is overdue, and fines on return", async () => {
    const [loan] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(libraryLoans).where(eq(libraryLoans.bookId, books.tfa)));
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    await withTenant(database.db, owner.school.id, (tx) => tx.update(libraryLoans).set({ dueOn: past }).where(eq(libraryLoans.id, loan.id)));
    const overdue = (await listLoans(database.db, librarian, { view: "overdue" })).rows;
    expect(overdue).toHaveLength(1);
    expect(overdue[0].late).toBeGreaterThanOrEqual(9);
    const { late, fine } = await returnBook(database.db, librarian, loan.id);
    expect(fine).toBe(late * 5_000);
    expect((await listBooks(database.db, librarian)).stats.fines).toBe(fine);
    await markFinePaid(database.db, librarian, loan.id);
    expect((await listBooks(database.db, librarian)).stats.fines).toBe(0);
    await expect(returnBook(database.db, librarian, loan.id)).rejects.toThrow(/Already returned/);
  });
});
