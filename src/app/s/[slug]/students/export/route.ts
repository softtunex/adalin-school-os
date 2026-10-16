import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { classes, guardians, studentGuardians, students, STUDENT_STATUSES } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { can } from "@/lib/services/access";
import { studentScope } from "@/lib/services/academics";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["students:export"]);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const classId = url.searchParams.get("class");
  const statusParam = url.searchParams.get("status") ?? "active";
  const medical = can(access, "students:view_medical");

  const rows = await withTenant(getDb(), access.school.id, async (tx) => {
    const scope = await studentScope(tx, access);
    const conditions: SQL[] = [];
    if (scope !== "all") conditions.push(scope.length ? inArray(students.classId, scope) : sql`false`);
    if ((STUDENT_STATUSES as readonly string[]).includes(statusParam)) conditions.push(eq(students.status, statusParam as (typeof STUDENT_STATUSES)[number]));
    if (classId) conditions.push(eq(students.classId, classId));
    if (q) {
      const term = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      conditions.push(or(ilike(students.firstName, term), ilike(students.lastName, term), ilike(students.admissionNo, term))!);
    }
    return tx
      .select({ s: students, className: classes.name, guardianName: guardians.name, guardianPhone: guardians.phone, guardianEmail: guardians.email })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(studentGuardians, and(eq(studentGuardians.studentId, students.id), eq(studentGuardians.isPrimary, true)))
      .leftJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(classes.name), asc(students.lastName), asc(students.firstName));
  });

  const headers = ["Admission no", "First name", "Middle name", "Surname", "Gender", "Date of birth", "Class", "Status", "State of origin", "LGA", "Religion", "Address", "Parent name", "Parent phone", "Parent email"];
  if (medical) headers.push("Blood group", "Genotype", "Medical notes");
  const csv = toCsv(
    headers,
    rows.map(({ s, className, guardianName, guardianPhone, guardianEmail }) => {
      const row = [s.admissionNo, s.firstName, s.middleName, s.lastName, s.gender, s.dateOfBirth, className, s.status, s.stateOfOrigin, s.lga, s.religion, s.address, guardianName, guardianPhone, guardianEmail];
      if (medical) row.push(s.bloodGroup, s.genotype, s.medicalNotes);
      return row;
    }),
  );
  return csvResponse(`${slug}-students.csv`, csv);
}
