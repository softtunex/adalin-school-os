/*
 * Fills every class's week in the demo school: English and Maths daily, the other subjects
 * spread across the rest, with the class's subject teachers where they're assigned.
 * Run with the dev server stopped, after db:seed.
 */
import { asc, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { classes, levelSubjects, subjects, teacherAssignments, timetableSlots } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { getCurrentTerm } from "../src/lib/services/academics";
import { getTimetableSetup } from "../src/lib/services/timetable";

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const user = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!user) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, user.id, "adalin-college"))!;
  const setup = await getTimetableSetup(db, owner);
  const lessonPeriods = setup.schedules[0].periods.filter((p) => p.kind === "lesson");
  const days = setup.schedules[0].days;

  const placed = await withTenant(db, owner.school.id, async (tx) => {
    const current = await getCurrentTerm(tx);
    if (!current) throw new Error("No current term");
    const existing = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(eq(timetableSlots.termId, current.term.id)).limit(1);
    if (existing.length) return 0;
    const allClasses = await tx.select().from(classes).orderBy(asc(classes.name));
    let n = 0;
    for (const [ci, cls] of allClasses.entries()) {
      const subs = await tx
        .select({ id: subjects.id, name: subjects.name })
        .from(levelSubjects)
        .innerJoin(subjects, eq(subjects.id, levelSubjects.subjectId))
        .where(eq(levelSubjects.levelId, cls.levelId))
        .orderBy(asc(subjects.sort), asc(subjects.name));
      const teachers = new Map((await tx.select().from(teacherAssignments).where(eq(teacherAssignments.classId, cls.id))).map((a) => [a.subjectId, a.membershipId]));
      const core = subs.filter((s) => /^(Mathematics|English)/.test(s.name));
      const rest = subs.filter((s) => !core.includes(s));
      const week: (typeof subs)[number][] = [];
      // Each day: English and Maths, then the others in turn.
      let r = ci * 3;
      for (let d = 0; d < days.length; d++) {
        const day: (typeof subs)[number][] = [...core];
        while (day.length < lessonPeriods.length && rest.length) day.push(rest[r++ % rest.length]);
        // Rotate so the same subject isn't always first period, and classes sharing a teacher don't collide.
        const shift = (d + ci * 2) % day.length;
        week.push(...day.slice(shift), ...day.slice(0, shift));
      }
      const rows = week.slice(0, days.length * lessonPeriods.length).map((s, i) => ({
        schoolId: owner.school.id,
        termId: current.term.id,
        classId: cls.id,
        day: days[Math.floor(i / lessonPeriods.length)],
        periodId: lessonPeriods[i % lessonPeriods.length].id,
        subjectId: s.id,
        teacherId: teachers.get(s.id) ?? null,
        room: /Science|Chemistry|Physics|Biology/.test(s.name) ? "Science lab" : /Computer|ICT/.test(s.name) ? "ICT room" : null,
      }));
      if (rows.length) await tx.insert(timetableSlots).values(rows);
      n += rows.length;
    }
    return n;
  });
  console.log(placed ? `Placed ${placed} lessons.` : "Timetable already seeded.");
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
