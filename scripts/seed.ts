import { eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { roles, schools, users } from "../src/lib/db/schema";
import { seedPlans } from "../src/lib/db/seed-plans";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail, registerSchoolOwner } from "../src/lib/services/accounts";
import { assignSubjectTeacher, getAcademicOverview, setupAcademics, updateClass } from "../src/lib/services/academics";
import { acceptInvitation, inviteStaff } from "../src/lib/services/staff";
import { createStudent, guardianInputSchema, studentInputSchema } from "../src/lib/services/students";

const DEMO = {
  email: "director@demo.adalinschoolhub.ng",
  password: "Demo2026!",
  schoolName: "Adalin College",
};

const STAFF = [
  { name: "Dr Adebayo Ogunleye", key: "principal" },
  { name: "Mrs Chioma Nwosu", key: "admin" },
  { name: "Mr Ibrahim Musa", key: "bursar" },
  { name: "Mrs Funmilayo Adeyemi", key: "class_teacher" },
  { name: "Mr Emeka Obi", key: "subject_teacher" },
  { name: "Miss Zainab Bello", key: "subject_teacher" },
];

const FIRST = {
  female: ["Adaeze", "Temitope", "Aisha", "Chiamaka", "Folake", "Ngozi", "Halima", "Ifeoma", "Oluwaseun", "Kemi", "Amina", "Blessing", "Ebunoluwa", "Nneka"],
  male: ["Tobi", "Chukwuemeka", "Ibrahim", "Oluwadamilare", "Kelechi", "Musa", "Tunde", "Ikenna", "Yusuf", "Femi", "Obinna", "Segun", "Abdullahi", "Chidi"],
};
const LAST = ["Okafor", "Adeyemi", "Bello", "Eze", "Ogunleye", "Nwankwo", "Ibrahim", "Afolabi", "Okoro", "Balogun", "Uche", "Lawal", "Olawale", "Danjuma", "Ojo", "Nnamdi"];
const STATES = ["Lagos", "Ogun", "Oyo", "Anambra", "Enugu", "Kano", "Rivers", "Delta", "Imo", "Kwara"];

function pick<T>(list: T[], i: number) {
  return list[i % list.length];
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  await seedPlans(database.db);
  const { db } = database;

  if (await findUserByEmail(db, DEMO.email)) {
    console.log("Demo school already exists.");
  } else {
    const { user, school } = await registerSchoolOwner(db, {
      name: "Olatunji Buari",
      email: DEMO.email,
      password: DEMO.password,
      schoolName: DEMO.schoolName,
    });
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
    await db
      .update(schools)
      .set({
        planKey: "premium",
        motto: "Knowledge, Character, Excellence",
        schoolType: "secondary",
        curriculum: "nigerian",
        email: "info@adalincollege.ng",
        phone: "+2348031234567",
        address: "14 Admiralty Way, Lekki Phase 1",
        city: "Lekki",
        state: "Lagos",
        admissionPrefix: "ADC",
        onboarding: { profile: true },
      })
      .where(eq(schools.id, school.id));
    const owner = (await loadAccess(db, user.id, school.slug))!;

    await setupAcademics(db, owner, {
      template: "nigerian",
      sections: ["junior_secondary", "senior_secondary"],
      arms: ["Gold", "Diamond"],
      sessionName: "2026/2027",
    });

    const schoolRoles = await withTenant(db, school.id, (tx) => tx.select().from(roles));
    const staffAccess = [];
    for (const [i, s] of STAFF.entries()) {
      const role = schoolRoles.find((r) => r.key === s.key)!;
      const email = `${s.name.split(" ").slice(-1)[0].toLowerCase()}${i}@demo.adalinschoolhub.ng`;
      const { token } = await inviteStaff(db, owner, { name: s.name, email, roleIds: [role.id] });
      const { userId } = await acceptInvitation(db, token, { name: s.name, password: DEMO.password });
      staffAccess.push({ ...s, email, access: (await loadAccess(db, userId, school.slug))! });
    }

    const overview = await getAcademicOverview(db, owner);
    const allClasses = overview.levels.flatMap((l) => l.classes);
    const classTeacher = staffAccess.find((s) => s.key === "class_teacher")!;
    const jss1Gold = allClasses.find((c) => c.name === "JSS 1 Gold")!;
    await updateClass(db, owner, jss1Gold.id, { classTeacherId: classTeacher.access.membershipId, capacity: 35 });
    const maths = overview.subjects.find((s) => s.name === "Mathematics")!;
    const english = overview.subjects.find((s) => s.name === "English Studies")!;
    const [emeka, zainab] = staffAccess.filter((s) => s.key === "subject_teacher");
    for (const cls of allClasses.filter((c) => c.name.startsWith("JSS 1"))) {
      await assignSubjectTeacher(db, owner, { classId: cls.id, subjectId: maths.id, membershipId: emeka.access.membershipId });
      await assignSubjectTeacher(db, owner, { classId: cls.id, subjectId: english.id, membershipId: zainab.access.membershipId });
    }

    let n = 0;
    for (const cls of allClasses) {
      const size = cls.name.startsWith("JSS 1") ? 8 : 4;
      for (let i = 0; i < size; i++, n++) {
        const gender = n % 2 === 0 ? "female" : "male";
        const lastName = pick(LAST, n * 7 + 3);
        await createStudent(
          db,
          owner,
          studentInputSchema.parse({
            firstName: pick(FIRST[gender], n),
            lastName,
            gender,
            classId: cls.id,
            dateOfBirth: `${2010 + (n % 6)}-${String((n % 12) + 1).padStart(2, "0")}-${String((n % 27) + 1).padStart(2, "0")}`,
            stateOfOrigin: pick(STATES, n),
            religion: n % 3 === 0 ? "Islam" : "Christianity",
            genotype: pick(["AA", "AS", "AA", "AA", "AC"], n),
            bloodGroup: pick(["O+", "A+", "B+", "O+", "AB+"], n),
          }),
          [
            guardianInputSchema.parse({
              name: `${n % 2 === 0 ? "Mrs" : "Mr"} ${pick(FIRST[n % 2 === 0 ? "female" : "male"], n + 3)} ${lastName}`,
              relationship: n % 2 === 0 ? "Mother" : "Father",
              phone: `080${String(30000000 + n * 7919).slice(0, 8)}`,
              email: `parent${n}@example.com`,
            }),
          ],
        );
      }
    }
    console.log(`Created ${DEMO.schoolName} with ${STAFF.length} staff and ${n} students.`);
    console.log("Staff logins (same password):");
    for (const s of staffAccess) console.log(`  ${s.name.padEnd(24)} ${s.email}`);
  }

  console.log(`\nDirector login: ${DEMO.email} / ${DEMO.password}`);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
