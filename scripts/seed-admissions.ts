/*
 * Admissions for the demo school: the form open for JSS 1 and SS 1 with a ₦5,000 fee, and
 * eight applicants across the pipeline. Prints the parent status link for the one holding an
 * offer. Run with the dev server stopped, after db:seed.
 */
import { eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { applicants, classLevels } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { admissionSettingsSchema, applicationSchema, saveAdmissionSettings, submitApplication, updateApplicant } from "../src/lib/services/admissions";

const BASE = process.env.APP_URL ?? "http://localhost:3005";

const PEOPLE: { child: [string, string, "male" | "female"]; parent: string; phone: string; level: "JSS 1" | "SS 1"; path: string[]; score?: number; paid?: boolean }[] = [
  { child: ["Temiloluwa", "Adeleke", "female"], parent: "Mrs Funke Adeleke", phone: "08031110001", level: "JSS 1", path: [] },
  { child: ["Ifeanyi", "Okafor", "male"], parent: "Mr Chinedu Okafor", phone: "08031110002", level: "JSS 1", path: [], paid: true },
  { child: ["Aisha", "Bello", "female"], parent: "Alhaji Musa Bello", phone: "08031110003", level: "JSS 1", path: ["exam"], paid: true },
  { child: ["David", "Etim", "male"], parent: "Mrs Grace Etim", phone: "08031110004", level: "JSS 1", path: ["exam"], score: 81, paid: true },
  { child: ["Zainab", "Lawal", "female"], parent: "Mr Ibrahim Lawal", phone: "08031110005", level: "SS 1", path: ["interview"], paid: true },
  { child: ["Chiamaka", "Nwosu", "female"], parent: "Mrs Ngozi Nwosu", phone: "08031110006", level: "JSS 1", path: ["exam", "offered"], score: 88, paid: true },
  { child: ["Tunde", "Bakare", "male"], parent: "Mrs Kemi Bakare", phone: "08031110007", level: "JSS 1", path: ["exam", "offered", "accepted"], score: 76, paid: true },
  { child: ["Emeka", "Obi", "male"], parent: "Mr Peter Obi", phone: "08031110008", level: "JSS 1", path: ["exam", "rejected"], score: 34, paid: true },
];

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const existing = await withTenant(db, owner.school.id, (tx) => tx.select({ id: applicants.id }).from(applicants).limit(1));
  if (existing.length) {
    console.log("Admissions demo data already there.");
    await database.close();
    return;
  }
  const levels = await withTenant(db, owner.school.id, (tx) => tx.select().from(classLevels));
  const levelId = (name: string) => levels.find((l) => l.name === name)!.id;
  await saveAdmissionSettings(
    db,
    owner,
    admissionSettingsSchema.parse({
      open: true,
      levelIds: [levelId("JSS 1"), levelId("SS 1")],
      fee: "5,000",
      intro: "Admission into JSS 1 and SS 1 for the next session is open. Fill in the form below; it takes about five minutes.",
      examInfo: "Saturday at 9am in the school hall. Bring two pencils, an eraser and the application reference.",
    }),
  );
  let offerLink = "";
  for (const [i, p] of PEOPLE.entries()) {
    const { token } = await submitApplication(
      db,
      "adalin-college",
      applicationSchema.parse({
        levelId: levelId(p.level),
        firstName: p.child[0],
        lastName: p.child[1],
        gender: p.child[2],
        dateOfBirth: p.level === "JSS 1" ? `2014-0${(i % 9) + 1}-1${i}` : `2011-0${(i % 9) + 1}-1${i}`,
        previousSchool: p.level === "JSS 1" ? "Bright Stars Nursery and Primary School" : "Adalin College",
        guardianName: p.parent,
        guardianRelationship: p.parent.startsWith("Mrs") ? "Mother" : "Father",
        guardianPhone: p.phone,
        guardianEmail: `applicant${i + 1}@example.com`,
        address: "Lekki Phase 1, Lagos",
      }),
      { ip: `10.0.0.${i + 1}`, baseUrl: BASE },
    );
    const [row] = await withTenant(db, owner.school.id, (tx) => tx.select().from(applicants).where(eq(applicants.token, token)));
    if (p.paid) await updateApplicant(db, owner, { id: row.id, feePaid: true, notify: false }, { baseUrl: BASE });
    if (p.score !== undefined) await updateApplicant(db, owner, { id: row.id, examScore: p.score, notify: false }, { baseUrl: BASE });
    for (const status of p.path) await updateApplicant(db, owner, { id: row.id, status: status as "exam", notify: false }, { baseUrl: BASE });
    if (p.path.at(-1) === "offered") offerLink = `${BASE}/apply/adalin-college/status/${token}`;
  }
  console.log(`Admissions demo: ${PEOPLE.length} applicants. Form: ${BASE}/apply/adalin-college`);
  console.log(`Parent page with an open offer: ${offerLink}`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
