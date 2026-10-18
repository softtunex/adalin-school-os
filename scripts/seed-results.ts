/*
 * Fills the demo school with attendance for the last two weeks and full scores for
 * JSS 1 Gold and JSS 1 Diamond, so the Attendance and Results screens have real data.
 * Run with the dev server stopped (the local database allows one process at a time).
 */
import { and, eq, inArray } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { attendanceDays, attendanceRecords, classes, levelSubjects, scores, students, studentSubjects, subjects, termReports } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { getCurrentTerm } from "../src/lib/services/academics";
import { loadAssessmentConfig } from "../src/lib/services/assessment";
import { lagosToday } from "../src/lib/services/attendance";

const COMMENTS = [
  "A focused and respectful student who takes part well in class.",
  "Shows steady improvement. More reading at home will help.",
  "Very hardworking and always willing to help classmates.",
  "Capable of much more. Needs to concentrate in class.",
  "A cheerful student with good leadership qualities.",
];

function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const user = await findUserByEmail(database.db, "director@demo.adalinschoolhub.ng");
  if (!user) throw new Error("Run pnpm db:seed first.");
  const access = (await loadAccess(database.db, user.id, "adalin-college"))!;

  await withTenant(database.db, access.school.id, async (tx) => {
    const current = await getCurrentTerm(tx);
    if (!current) throw new Error("No current term");
    const config = await loadAssessmentConfig(tx, access.school.id);
    const targets = await tx.select().from(classes).where(eq(classes.isActive, true));
    const jss1 = targets.filter((c) => c.name.startsWith("JSS 1"));

    // Attendance: the last 10 school days for every class.
    const days: string[] = [];
    const d = new Date(`${lagosToday()}T12:00:00Z`);
    while (days.length < 10) {
      d.setUTCDate(d.getUTCDate() - 1);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10));
    }
    let n = 0;
    for (const cls of targets) {
      const roll = await tx.select().from(students).where(and(eq(students.classId, cls.id), eq(students.status, "active")));
      for (const date of days) {
        const [day] = await tx
          .insert(attendanceDays)
          .values({ schoolId: access.school.id, classId: cls.id, date, termId: current.term.id, takenBy: cls.classTeacherId ?? access.membershipId })
          .onConflictDoNothing()
          .returning();
        if (!day) continue;
        await tx.insert(attendanceRecords).values(
          roll.map((s) => {
            const r = seeded(n++);
            return { schoolId: access.school.id, dayId: day.id, studentId: s.id, status: r < 0.06 ? ("absent" as const) : r < 0.12 ? ("late" as const) : ("present" as const) };
          }),
        );
      }
    }

    // Scores for every subject offered in JSS 1.
    for (const cls of jss1) {
      const offered = await tx.select().from(levelSubjects).where(eq(levelSubjects.levelId, cls.levelId));
      const roll = await tx.select().from(students).where(and(eq(students.classId, cls.id), eq(students.status, "active")));
      const subjectNames = new Map((await tx.select({ id: subjects.id, name: subjects.name }).from(subjects)).map((x) => [x.id, x.name]));
      for (const [si, s] of roll.entries()) {
        const ability = 0.45 + seeded(si + cls.name.length) * 0.45;
        // Electives: CRS or IRS by religion; other electives are left unpicked.
        const religious = s.religion === "Islam" ? "Islamic Religious Studies" : "Christian Religious Studies";
        const picked = offered.filter((o) => o.isElective && subjectNames.get(o.subjectId) === religious).map((o) => o.subjectId);
        if (picked.length) await tx.insert(studentSubjects).values(picked.map((subjectId) => ({ schoolId: access.school.id, studentId: s.id, subjectId }))).onConflictDoNothing();
        const takes = offered.filter((o) => !o.isElective || picked.includes(o.subjectId));
        const electiveIds = offered.filter((o) => o.isElective).map((o) => o.subjectId);
        const dropped = electiveIds.filter((id) => !picked.includes(id));
        if (dropped.length) await tx.delete(scores).where(and(eq(scores.studentId, s.id), inArray(scores.subjectId, dropped)));
        for (const [oi, o] of takes.entries()) {
          await tx
            .insert(scores)
            .values(
              config.components.map((c, ci) => ({
                schoolId: access.school.id,
                termId: current.term.id,
                classId: cls.id,
                subjectId: o.subjectId,
                studentId: s.id,
                componentId: c.id,
                score: Math.min(c.maxScore, Math.round(c.maxScore * Math.min(1, ability + (seeded(si * 31 + oi * 7 + ci) - 0.5) * 0.3))),
                updatedBy: access.membershipId,
              })),
            )
            .onConflictDoNothing();
        }
        await tx
          .insert(termReports)
          .values({
            schoolId: access.school.id,
            termId: current.term.id,
            studentId: s.id,
            classTeacherComment: COMMENTS[si % COMMENTS.length],
            ratings: { Punctuality: 3 + (si % 3), Neatness: 4, Politeness: 5 - (si % 2), Honesty: 5, "Relationship with others": 4, Handwriting: 3 + (si % 3), "Sports and games": 4 },
          })
          .onConflictDoNothing();
      }
    }
    console.log(`Seeded attendance for ${targets.length} classes over ${days.length} days, and scores for ${jss1.map((c) => c.name).join(", ")}.`);
  });
  await database.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
