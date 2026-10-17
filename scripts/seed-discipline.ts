/*
 * Behaviour for the demo school: merits and incidents this term across the JSS 1 classes,
 * one serious case still open, and two merits for Oluwaseun Lawal (the demo parent's child).
 * Run with the dev server stopped, after db:seed and db:seed-comms.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { behaviourRecords, classes, students } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { getCurrentTerm } from "../src/lib/services/academics";
import { lagosToday } from "../src/lib/services/attendance";

function daysAgo(n: number) {
  const d = new Date(`${lagosToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const MERITS: [string, string, number][] = [
  ["Kindness", "Shared lunch with a classmate who forgot theirs.", 1],
  ["Leadership", "Organised the class for the inter-house quiz.", 3],
  ["Hard work", "Finished every maths assignment early and correctly.", 2],
  ["Improvement", "Big jump in English test scores since mid-term.", 2],
  ["Helpfulness", "Helped the librarian re-shelve books after school.", 1],
  ["Sports", "Won the 100m at the inter-house sports.", 3],
  ["Neatness", "Exercise books are always neat and complete.", 1],
];
const INCIDENTS: [string, "minor" | "moderate" | "serious", string, string][] = [
  ["Lateness", "minor", "Arrived after the morning assembly.", "Warning"],
  ["Uniform", "minor", "Wrong shoes, second time this week.", "Note to parent"],
  ["Noise making", "minor", "Disturbed the class during a test.", "Moved seat"],
  ["Phone use", "moderate", "Used a phone during prep.", "Phone kept by the vice principal for a week"],
  ["Disrespect", "moderate", "Rude to the French teacher when asked to stop talking.", "Apology letter"],
  ["Fighting", "serious", "Fought another student at break over a football.", "Parents invited to school"],
];
const POINTS = { minor: -1, moderate: -3, serious: -5 };

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const n = await withTenant(db, owner.school.id, async (tx) => {
    const existing = await tx.select({ id: behaviourRecords.id }).from(behaviourRecords).limit(1);
    if (existing.length) return 0;
    const current = await getCurrentTerm(tx);
    const jss1 = await tx.select().from(classes).where(inArray(classes.name, ["JSS 1 Gold", "JSS 1 Diamond"]));
    const roll = await tx
      .select()
      .from(students)
      .where(and(inArray(students.classId, jss1.map((c) => c.id)), eq(students.status, "active")))
      .orderBy(asc(students.admissionNo));
    const rows: (typeof behaviourRecords.$inferInsert)[] = [];
    const base = { schoolId: owner.school.id, termId: current?.term.id ?? null, recordedBy: owner.membershipId };
    roll.forEach((s, i) => {
      const [cat, desc, pts] = MERITS[i % MERITS.length];
      rows.push({ ...base, studentId: s.id, classId: s.classId, kind: "merit", category: cat, points: pts, description: desc, occurredOn: daysAgo(2 + (i % 20)), status: "resolved", parentNotifiedAt: new Date() });
      if (s.admissionNo === "ADC/2026/0009") {
        rows.push({ ...base, studentId: s.id, classId: s.classId, kind: "merit", category: "Hard work", points: 2, description: "Top score in the Second CA maths test.", occurredOn: daysAgo(1), status: "resolved", parentNotifiedAt: new Date() });
      }
      if (i % 4 === 2) {
        const [icat, sev, idesc, action] = INCIDENTS[Math.floor(i / 4) % INCIDENTS.length];
        rows.push({
          ...base,
          studentId: s.id,
          classId: s.classId,
          kind: "incident",
          category: icat,
          severity: sev,
          points: POINTS[sev],
          description: idesc,
          actionTaken: action,
          occurredOn: daysAgo(3 + (i % 15)),
          status: sev === "serious" ? "open" : "resolved",
          parentNotifiedAt: sev === "minor" ? null : new Date(),
        });
      }
    });
    await tx.insert(behaviourRecords).values(rows);
    return rows.length;
  });
  console.log(n ? `Behaviour demo: ${n} entries this term.` : "Behaviour demo data already there.");
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
