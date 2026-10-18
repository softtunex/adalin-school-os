/**
 * An Enterprise demo: Adalin Heights Schools, two campuses in one group, with a proprietor login that
 * can try everything Enterprise adds (API & webhooks, staff sign-in, campuses, web address).
 * Separate from Adalin College so the main demo stays on Premium.
 */
import { eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { schools } from "../src/lib/db/schema";
import { seedPlans } from "../src/lib/db/seed-plans";
import { loadAccess, type Access } from "../src/lib/services/access";
import { findUserByEmail, registerSchoolOwner } from "../src/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "../src/lib/services/academics";
import { addNewCampus, createGroup } from "../src/lib/services/groups";
import { createStudent, studentInputSchema } from "../src/lib/services/students";

const OWNER = { name: "Mrs Ronke Adeleke", email: "enterprise@demo.adalinschoolhub.ng", password: "Demo2026!" };

const FIRST = {
  female: ["Adaeze", "Temitope", "Aisha", "Chiamaka", "Ngozi", "Halima", "Ifeoma", "Kemi", "Amina", "Nneka"],
  male: ["Tobi", "Chukwuemeka", "Ibrahim", "Kelechi", "Musa", "Tunde", "Yusuf", "Femi", "Obinna", "Segun"],
};
const LAST = ["Okafor", "Adeyemi", "Bello", "Eze", "Nwankwo", "Afolabi", "Okoro", "Balogun", "Lawal", "Danjuma", "Ojo", "Nnamdi"];

async function fill(db: Parameters<typeof setupAcademics>[0], access: Access, count: number, offset: number) {
  await setupAcademics(db, access, { template: "nigerian", sections: ["junior_secondary", "senior_secondary"], arms: ["Blue", "Green"], sessionName: "2026/2027" });
  const classes = (await getAcademicOverview(db, access)).levels.flatMap((l) => l.classes);
  for (let i = 0; i < count; i++) {
    const gender = i % 2 ? "male" : "female";
    const n = i + offset;
    await createStudent(
      db,
      access,
      studentInputSchema.parse({
        firstName: FIRST[gender][n % FIRST[gender].length],
        lastName: LAST[(n * 7) % LAST.length],
        gender,
        classId: classes[i % classes.length].id,
        dateOfBirth: `${2010 + (n % 6)}-0${1 + (n % 9)}-1${n % 9}`,
      }),
      [],
    );
  }
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  await seedPlans(database.db);
  const { db } = database;
  if (await findUserByEmail(db, OWNER.email)) {
    console.log("Enterprise demo already exists.");
    await database.close();
    return;
  }
  const { user, school } = await registerSchoolOwner(db, { ...OWNER, schoolName: "Adalin Heights School, Ikoyi" });
  await db
    .update(schools)
    .set({
      planKey: "enterprise",
      motto: "Light and Learning",
      schoolType: "secondary",
      curriculum: "nigerian",
      email: "hello@adalinheights.ng",
      phone: "+2348091112233",
      address: "7 Bourdillon Road, Ikoyi",
      city: "Ikoyi",
      state: "Lagos",
      admissionPrefix: "AHI",
      brandColor: "#1A5FB4",
      onboarding: { profile: true },
    })
    .where(eq(schools.id, school.id));
  let main = (await loadAccess(db, user.id, school.slug))!;
  await fill(db, main, 24, 0);

  await createGroup(db, main, "Adalin Heights Schools");
  main = (await loadAccess(db, user.id, school.slug))!;
  const abuja = await addNewCampus(db, main, "Adalin Heights School, Abuja");
  await db.update(schools).set({ city: "Wuse II", state: "FCT", admissionPrefix: "AHA", brandColor: "#1A5FB4" }).where(eq(schools.id, abuja.id));
  await fill(db, (await loadAccess(db, user.id, abuja.slug))!, 14, 5);

  console.log(`Enterprise demo ready: ${OWNER.email} / ${OWNER.password} (${school.slug}, ${abuja.slug})`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
