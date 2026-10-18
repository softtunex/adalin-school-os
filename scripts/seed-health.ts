/*
 * The demo school's sick bay: a nurse (Nurse Kemi Adebayo, nurse8@demo.adalinschoolhub.ng, password
 * Demo2026!), health records with allergies and conditions, three weeks of visits, and one
 * student resting in the bay now. Oluwaseun Lawal is allergic to groundnuts and has one visit.
 * Run with the dev server stopped.
 */
import { asc, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { memberships, roles, sickBayVisits, studentHealth, students, type MedicineGiven } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { getCurrentTerm } from "../src/lib/services/academics";
import { lagosToday } from "../src/lib/services/attendance";
import { acceptInvitation, inviteStaff } from "../src/lib/services/staff";

type Outcome = "returned" | "rested" | "sent_home" | "referred";
const VISITS: [daysAgo: number, time: string, complaint: string, temp: number | null, treatment: string, meds: [string, string][], outcome: Outcome][] = [
  [20, "09:40", "Headache", 371, "Rested for 20 minutes, water", [["Paracetamol", "500mg"]], "rested"],
  [18, "11:15", "Stomach ache", null, "Rested, warm water", [["Antacid", "10ml"]], "returned"],
  [16, "13:05", "Fever", 388, "Tepid sponging, parents called", [["Paracetamol", "500mg"]], "sent_home"],
  [15, "10:20", "Cut on knee during sports", null, "Cleaned and dressed the wound", [["Antiseptic and plaster", "1"]], "returned"],
  [12, "08:50", "Dizziness, skipped breakfast", null, "Gave biscuits and water, rested", [], "rested"],
  [10, "12:30", "Asthma attack", null, "Own inhaler, 2 puffs, monitored for 30 minutes", [], "rested"],
  [8, "14:10", "Vomiting", 376, "Rested, oral rehydration", [["ORS (oral rehydration salts)", "1 sachet"]], "sent_home"],
  [6, "10:05", "Toothache", null, "Advised dentist visit", [["Paracetamol", "500mg"]], "returned"],
  [3, "11:45", "Swollen ankle after football", null, "Cold compress, ankle strapped. Possible sprain", [], "referred"],
  [1, "09:15", "Headache", 369, "Rested for 15 minutes", [["Paracetamol", "500mg"]], "returned"],
  [0, "08:35", "Rash on arms", null, "Calamine applied", [["Calamine lotion", "thin layer"]], "returned"],
];

function at(daysAgo: number, time: string) {
  const d = new Date(`${lagosToday()}T${time}:00+01:00`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.adalinschoolhub.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const existing = await withTenant(db, owner.school.id, (tx) => tx.select({ id: sickBayVisits.id }).from(sickBayVisits).limit(1));
  if (existing.length) {
    console.log("Sick bay demo data already there.");
    await database.close();
    return;
  }
  let nurseUser = await findUserByEmail(db, "nurse8@demo.adalinschoolhub.ng");
  if (!nurseUser) {
    const [role] = await withTenant(db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "nurse")));
    const { token } = await inviteStaff(db, owner, { name: "Nurse Kemi Adebayo", email: "nurse8@demo.adalinschoolhub.ng", roleIds: [role.id] });
    await acceptInvitation(db, token, { name: "Nurse Kemi Adebayo", password: "Demo2026!" });
    nurseUser = await findUserByEmail(db, "nurse8@demo.adalinschoolhub.ng");
  }
  const n = await withTenant(db, owner.school.id, async (tx) => {
    const [nurse] = await tx.select().from(memberships).where(eq(memberships.userId, nurseUser!.id));
    const kids = await tx.select().from(students).where(eq(students.status, "active")).orderBy(asc(students.admissionNo)).limit(30);
    const seun = kids.find((k) => k.admissionNo === "ADC/2026/0009");
    const others = kids.filter((k) => k.id !== seun?.id);
    const records: { studentId: string; allergies: string[]; conditions: string[]; regularMedication?: string; emergencyNote?: string }[] = [
      ...(seun ? [{ studentId: seun.id, allergies: ["Groundnuts"], conditions: [], emergencyNote: "Keep away from groundnut snacks. Call mother first." }] : []),
      { studentId: others[0].id, allergies: ["Penicillin"], conditions: [] },
      { studentId: others[1].id, allergies: [], conditions: ["Asthma"], regularMedication: "Blue inhaler, kept in her bag. Two puffs before sports." },
      { studentId: others[2].id, allergies: ["Ibuprofen"], conditions: ["Sickle cell (SS)"], regularMedication: "Folic acid daily", emergencyNote: "Crisis signs: severe pain, fever. Keep warm, give water, call parents and Lagoon Hospital." },
      { studentId: others[3].id, allergies: ["Sulfa drugs", "Shellfish"], conditions: [] },
      { studentId: others[4].id, allergies: [], conditions: ["Epilepsy"], regularMedication: "Medication at home, morning and night", emergencyNote: "During a seizure: clear the space, time it, recovery position. Over 5 minutes, call an ambulance." },
    ];
    await tx.insert(studentHealth).values(records.map((r) => ({ ...r, schoolId: owner.school.id, updatedBy: nurse.id })));
    const current = await getCurrentTerm(tx);
    const who = (i: number) => (i === 9 && seun ? seun : others[(i * 3 + 5) % others.length]);
    const rows: (typeof sickBayVisits.$inferInsert)[] = VISITS.map(([daysAgo, time, complaint, temperature, treatment, meds, outcome], i) => {
      const arrivedAt = at(daysAgo, time);
      return {
        schoolId: owner.school.id,
        studentId: who(i).id,
        termId: current?.term.id ?? null,
        arrivedAt,
        complaint,
        temperature,
        treatment,
        medicines: meds.map(([medicine, dose]): MedicineGiven => ({ medicine, dose, at: arrivedAt.toISOString() })),
        outcome,
        leftAt: new Date(arrivedAt.getTime() + (outcome === "returned" ? 15 : 45) * 60_000),
        parentsTold: true,
        recordedBy: nurse.id,
      };
    });
    const resting = others[7];
    rows.push({
      schoolId: owner.school.id,
      studentId: resting.id,
      termId: current?.term.id ?? null,
      arrivedAt: new Date(Date.now() - 25 * 60_000),
      complaint: "Feeling feverish",
      temperature: 379,
      treatment: "Lying down, water",
      medicines: [],
      outcome: null,
      leftAt: null,
      parentsTold: false,
      recordedBy: nurse.id,
    });
    await tx.insert(sickBayVisits).values(rows);
    return { records: records.length, visits: rows.length };
  });
  console.log(`Sick bay demo: ${n.records} health records, ${n.visits} visits. Nurse: nurse8@demo.adalinschoolhub.ng / Demo2026!`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
