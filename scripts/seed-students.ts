/*
 * A demo student login: the first JSS 1 Gold student (Oluwaseun Lawal after db:seed-comms),
 * password Student2026, and students allowed to see their own results. Dev server stopped.
 */
import { asc, eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/crypto";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { classes, schools, students, users } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { studentUsername } from "../src/lib/services/student-accounts";

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const [school] = await db.select().from(schools).where(eq(schools.slug, "greenfield-college"));
  if (!school) throw new Error("Run pnpm db:seed first.");
  const student = await withTenant(db, school.id, async (tx) => {
    const [gold] = await tx.select().from(classes).where(eq(classes.name, "JSS 1 Gold"));
    const [s] = await tx.select().from(students).where(eq(students.classId, gold.id)).orderBy(asc(students.admissionNo)).limit(1);
    return s;
  });
  const username = studentUsername(school.slug, student.admissionNo);
  const passwordHash = await hashPassword("Student2026");
  const [existing] = await db.select().from(users).where(eq(users.username, username));
  const userId = existing
    ? (await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, existing.id)).returning())[0].id
    : (await db.insert(users).values({ name: `${student.firstName} ${student.lastName}`, username, passwordHash, mustChangePassword: false }).returning())[0].id;
  await withTenant(db, school.id, (tx) => tx.update(students).set({ userId }).where(eq(students.id, student.id)));
  await db.update(schools).set({ commsSettings: { ...school.commsSettings, studentResults: true } }).where(eq(schools.id, school.id));
  console.log(`Student login: school code ${school.slug}, admission no ${student.admissionNo}, password Student2026 (${student.firstName} ${student.lastName}).`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
