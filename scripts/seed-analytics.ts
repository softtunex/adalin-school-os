/*
 * History for the analytics screens: the 2025/2026 session with three terms of scores for
 * every student who has scores this term. The school improves a little each term; a few
 * students were stronger last session, so they show as falling. Run with the dev server
 * stopped, after db:seed-results.
 */
import { asc, eq, sql } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { academicSessions, assessmentComponents, scores, terms } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { createSession, getCurrentTerm } from "../src/lib/services/academics";

const PAST = "2025/2026";

function seeded(n: number) {
  const x = Math.sin(n * 7919 + 104729) * 233280;
  return x - Math.floor(x);
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const exists = await withTenant(db, owner.school.id, (tx) => tx.select().from(academicSessions).where(eq(academicSessions.name, PAST)));
  if (exists.length) {
    console.log("Analytics history already there.");
    await database.close();
    return;
  }
  const session = await createSession(db, owner, { name: PAST });
  const n = await withTenant(db, owner.school.id, async (tx) => {
    const current = await getCurrentTerm(tx);
    if (!current) throw new Error("No current term");
    const pastTerms = await tx.select().from(terms).where(eq(terms.sessionId, session.id)).orderBy(asc(terms.number));
    await tx
      .update(academicSessions)
      .set({ startsOn: "2025-09-08", endsOn: "2026-07-24" })
      .where(eq(academicSessions.id, session.id));
    const dates = [
      ["2025-09-08", "2025-12-12"],
      ["2026-01-05", "2026-04-02"],
      ["2026-04-20", "2026-07-24"],
    ];
    for (const [i, t] of pastTerms.entries()) await tx.update(terms).set({ startsOn: dates[i][0], endsOn: dates[i][1] }).where(eq(terms.id, t.id));

    const components = await tx.select().from(assessmentComponents);
    const currentScores = await tx
      .select({
        studentId: scores.studentId,
        subjectId: scores.subjectId,
        classId: scores.classId,
        pct: sql<number>`sum(${scores.score}) / nullif(sum(${assessmentComponents.maxScore}), 0) * 100`.mapWith(Number),
      })
      .from(scores)
      .innerJoin(assessmentComponents, eq(assessmentComponents.id, scores.componentId))
      .where(eq(scores.termId, current.term.id))
      .groupBy(scores.studentId, scores.subjectId, scores.classId);
    const studentIds = [...new Set(currentScores.map((c) => c.studentId))];
    // Every seventh student did much better last session.
    const falling = new Set(studentIds.filter((_, i) => i % 7 === 3));
    const rows: (typeof scores.$inferInsert)[] = [];
    let k = 0;
    for (const c of currentScores) {
      for (const [ti, t] of pastTerms.entries()) {
        k++;
        const drift = falling.has(c.studentId) ? 16 - ti * 2 : -7 + ti * 2.5;
        const target = Math.max(8, Math.min(98, c.pct + drift + (seeded(k) - 0.5) * 10)) / 100;
        for (const comp of components) {
          rows.push({ schoolId: owner.school.id, termId: t.id, classId: c.classId, subjectId: c.subjectId, studentId: c.studentId, componentId: comp.id, score: Math.round(comp.maxScore * target * 2) / 2 });
        }
      }
    }
    for (let i = 0; i < rows.length; i += 500) await tx.insert(scores).values(rows.slice(i, i + 500));
    return { rows: rows.length, students: studentIds.length, falling: falling.size };
  });
  console.log(`Analytics history: ${PAST}, ${n.rows} scores for ${n.students} students (${n.falling} falling this term).`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

