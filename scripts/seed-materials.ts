/*
 * Learning materials for the demo school: JSS 1 Maths gets a typed note, a worksheet PDF and
 * a link. Run with the dev server stopped, after db:seed-teaching.
 */
import { and, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { classes, files, materials, memberships, subjects, teacherAssignments } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { writeLocal } from "../src/lib/documents";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { createUpload } from "../src/lib/services/files";
import { materialSchema, saveMaterial } from "../src/lib/services/materials";
import { worksheet } from "./pdf-fixture";

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.adalinschoolhub.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const ctx = await withTenant(db, owner.school.id, async (tx) => {
    const [gold] = await tx.select().from(classes).where(eq(classes.name, "JSS 1 Gold"));
    const [maths] = await tx.select().from(subjects).where(eq(subjects.name, "Mathematics"));
    const [link] = await tx
      .select({ userId: memberships.userId })
      .from(teacherAssignments)
      .innerJoin(memberships, eq(memberships.id, teacherAssignments.membershipId))
      .where(and(eq(teacherAssignments.classId, gold.id), eq(teacherAssignments.subjectId, maths.id)));
    const existing = await tx.select({ id: materials.id }).from(materials).limit(1);
    return { gold, maths, link, seeded: existing.length > 0 };
  });
  if (ctx.seeded) {
    console.log("Materials demo data already there.");
    await database.close();
    return;
  }
  const teacher = (await loadAccess(db, ctx.link.userId, "adalin-college"))!;
  const base = { levelId: ctx.gold.levelId, subjectId: ctx.maths.id };

  await saveMaterial(
    db,
    teacher,
    materialSchema.parse({
      ...base,
      title: "Fractions: the key ideas",
      description: "Read this before Thursday's lesson.",
      kind: "note",
      body: [
        "1. A fraction is part of a whole. In 3/4, the 4 (denominator) is how many equal parts, and the 3 (numerator) is how many we take.",
        "",
        "2. Equivalent fractions: multiply or divide the top and bottom by the same number. 1/2 = 2/4 = 4/8.",
        "",
        "3. Adding fractions: make the denominators the same first.",
        "   1/2 + 1/3 = 3/6 + 2/6 = 5/6",
        "",
        "4. Simplify your answer: 6/8 = 3/4 (divide top and bottom by 2).",
        "",
        "Practice: 1/4 + 2/4, 2/3 + 1/6, 3/5 + 1/10.",
      ].join("\n"),
    }),
  );

  const pdf = worksheet("Fractions worksheet 2");
  const { fileId } = await createUpload(db, { schoolId: owner.school.id, userId: teacher.user.id, ownerType: "material", name: "Fractions practice.pdf", size: pdf.byteLength });
  const [f] = await db.select().from(files).where(eq(files.id, fileId));
  await writeLocal(f.storageKey, pdf);
  await saveMaterial(db, teacher, materialSchema.parse({ ...base, title: "Fractions practice sheet", description: "Extra practice. Answers next week.", kind: "file", fileIds: [fileId] }));

  await saveMaterial(
    db,
    teacher,
    materialSchema.parse({
      ...base,
      title: "Khan Academy: fractions",
      description: "Free videos and practice at your own pace.",
      kind: "link",
      url: "https://www.khanacademy.org/math/arithmetic/fraction-arithmetic",
    }),
  );

  console.log("Materials demo: a note, a worksheet and a link for JSS 1 Maths.");
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
