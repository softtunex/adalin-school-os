/*
 * The demo school's library: a librarian (Mrs Grace Okafor, librarian6@demo.schoolos.ng,
 * password Demo2026!), about twenty titles, and loans: some current, one overdue, one returned
 * late with a fine owed, and a book out to Oluwaseun Lawal. Run with the dev server stopped.
 */
import { asc, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { libraryBooks, libraryLoans, memberships, roles, students } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { lagosToday } from "../src/lib/services/attendance";
import { acceptInvitation, inviteStaff } from "../src/lib/services/staff";

const BOOKS: [string, string, string, string, number][] = [
  ["Things Fall Apart", "Chinua Achebe", "Literature", "A1", 6],
  ["Arrow of God", "Chinua Achebe", "Literature", "A1", 3],
  ["The Lion and the Jewel", "Wole Soyinka", "Literature", "A2", 4],
  ["Half of a Yellow Sun", "Chimamanda Ngozi Adichie", "Literature", "A2", 2],
  ["Purple Hibiscus", "Chimamanda Ngozi Adichie", "Literature", "A2", 3],
  ["The Concubine", "Elechi Amadi", "Literature", "A3", 2],
  ["Eze Goes to School", "Onuora Nzekwu", "Children's fiction", "C1", 5],
  ["Chike and the River", "Chinua Achebe", "Children's fiction", "C1", 4],
  ["The Drummer Boy", "Cyprian Ekwensi", "Children's fiction", "C1", 3],
  ["An African Night's Entertainment", "Cyprian Ekwensi", "Children's fiction", "C2", 2],
  ["New General Mathematics JSS 1", "M. F. Macrae et al.", "Textbook", "T1", 12],
  ["Basic Science for Junior Secondary 1", "STAN", "Textbook", "T1", 10],
  ["Intensive English for JSS 1", "Ayo Banjo", "Textbook", "T2", 10],
  ["Comprehensive Certificate Physics", "Olumuyiwa Awe", "Textbook", "T3", 4],
  ["Modern Biology for Senior Secondary Schools", "S. T. Ramalingam", "Textbook", "T3", 4],
  ["Oxford Advanced Learner's Dictionary", "A. S. Hornby", "Reference", "R1", 3],
  ["Atlas for Nigeria", "Macmillan", "Reference", "R1", 2],
  ["A History of Nigeria", "Toyin Falola", "History", "H1", 2],
  ["Long Walk to Freedom", "Nelson Mandela", "Biography", "H2", 1],
  ["The Famished Road", "Ben Okri", "Literature", "A3", 1],
];

function shift(n: number) {
  const d = new Date(`${lagosToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const existing = await withTenant(db, owner.school.id, (tx) => tx.select({ id: libraryBooks.id }).from(libraryBooks).limit(1));
  if (existing.length) {
    console.log("Library demo data already there.");
    await database.close();
    return;
  }
  let librarian = await findUserByEmail(db, "librarian6@demo.schoolos.ng");
  if (!librarian) {
    const [role] = await withTenant(db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "librarian")));
    const { token } = await inviteStaff(db, owner, { name: "Mrs Grace Okafor", email: "librarian6@demo.schoolos.ng", roleIds: [role.id] });
    await acceptInvitation(db, token, { name: "Mrs Grace Okafor", password: "Demo2026!" });
    librarian = await findUserByEmail(db, "librarian6@demo.schoolos.ng");
  }
  const n = await withTenant(db, owner.school.id, async (tx) => {
    const [lib] = await tx.select().from(memberships).where(eq(memberships.userId, librarian!.id));
    const rows = await tx
      .insert(libraryBooks)
      .values(BOOKS.map(([title, author, category, shelf, copies]) => ({ schoolId: owner.school.id, title, author, category, shelf, copies })))
      .returning();
    const byTitle = (t: string) => rows.find((r) => r.title === t)!.id;
    const kids = await tx.select().from(students).where(eq(students.status, "active")).orderBy(asc(students.admissionNo)).limit(12);
    const seun = kids.find((k) => k.admissionNo === "ADC/2026/0009");
    const base = { schoolId: owner.school.id, issuedBy: lib.id };
    const loans: (typeof libraryLoans.$inferInsert)[] = [];
    if (seun) loans.push({ ...base, bookId: byTitle("Chike and the River"), studentId: seun.id, issuedOn: shift(-5), dueOn: shift(9) });
    const titles = ["Things Fall Apart", "Eze Goes to School", "The Drummer Boy", "Purple Hibiscus", "New General Mathematics JSS 1", "The Lion and the Jewel"];
    kids
      .filter((k) => k.id !== seun?.id)
      .slice(0, 6)
      .forEach((k, i) => loans.push({ ...base, bookId: byTitle(titles[i]), studentId: k.id, issuedOn: shift(-10 - i), dueOn: shift(4 - i * 2) }));
    const late = kids[7];
    if (late) loans.push({ ...base, bookId: byTitle("Arrow of God"), studentId: late.id, issuedOn: shift(-30), dueOn: shift(-16), returnedOn: shift(-6), fineKobo: 10 * 50_00, finePaid: false });
    await tx.insert(libraryLoans).values(loans);
    return { books: rows.length, loans: loans.length };
  });
  console.log(`Library demo: ${n.books} titles, ${n.loans} loans. Librarian: librarian6@demo.schoolos.ng / Demo2026!`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
