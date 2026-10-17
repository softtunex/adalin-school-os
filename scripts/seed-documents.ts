/*
 * The demo school's documents: signed by the principal, JSS 1 Gold's ID cards, a testimonial
 * for a leaver and two award certificates, so the register and the QR check have something
 * in them. Uses the school admin (nwosu1@demo.schoolos.ng). Run with the dev server stopped.
 */
import { asc, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { classes, issuedDocuments, students } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import {
  documentSettingsSchema,
  fromTemplateSchema,
  idCardSchema,
  issueFromTemplate,
  issueIdCards,
  issueTestimonial,
  listTemplates,
  saveDocumentSettings,
  testimonialSchema,
} from "../src/lib/services/documents";

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const user = await findUserByEmail(db, "nwosu1@demo.schoolos.ng");
  if (!user) throw new Error("Run pnpm db:seed first.");
  let admin = (await loadAccess(db, user.id, "adalin-college"))!;
  const existing = await withTenant(db, admin.school.id, (tx) => tx.select({ id: issuedDocuments.id }).from(issuedDocuments).limit(1));
  if (existing.length) {
    console.log("Documents demo data already there.");
    await database.close();
    return;
  }
  await saveDocumentSettings(db, admin, documentSettingsSchema.parse({
      signatories: [
        { name: "Dr Adebayo Ogunleye", title: "Principal" },
        { name: "Olatunji Buari", title: "Proprietor" },
      ],
      cardNote: "This card belongs to Adalin College. If found, please return it to the school office." }));
  admin = (await loadAccess(db, user.id, "adalin-college"))!;
  const [gold] = await withTenant(db, admin.school.id, (tx) => tx.select().from(classes).where(eq(classes.name, "JSS 1 Gold")));
  if (gold) await issueIdCards(db, admin, idCardSchema.parse({ classId: gold.id }));
  const kids = await withTenant(db, admin.school.id, (tx) =>
    tx.select({ s: students, className: classes.name }).from(students).leftJoin(classes, eq(classes.id, students.classId)).where(eq(students.status, "active")).orderBy(asc(students.admissionNo)),
  );
  const ss3 = kids.find((k) => k.className?.startsWith("SS 3"));
  if (ss3) {
    await issueTestimonial(
      db,
      admin,
      testimonialSchema.parse({
        studentId: ss3.s.id,
        conduct: "Excellent",
        yearsFrom: "2020",
        yearsTo: "2026",
        lastClass: ss3.className,
        offices: "Senior prefect",
        activities: "Debate club, JETS club",
        remark: `${ss3.s.firstName} has been an honest, hard-working and respectful student, and a fine example to younger students.`,
      }),
    );
  }
  const templates = await listTemplates(db, admin);
  const award = templates.find((t) => t.name === "Award of excellence");
  const seun = kids.find((k) => k.s.admissionNo === "ADC/2026/0009");
  if (award && seun) await issueFromTemplate(db, admin, fromTemplateSchema.parse({ templateId: award.id, studentIds: [seun.s.id, kids[2].s.id] }));
  console.log("Documents demo: ID cards for JSS 1 Gold, a testimonial and two certificates.");
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
