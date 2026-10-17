/*
 * Staff attendance and leave for the demo school: two weeks of clock-ins (mostly on time, a
 * few late, the odd absence), one leave request waiting for the Director, and approved leave
 * next week. Run with the dev server stopped, after db:seed.
 */
import { and, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { leaveRequests, membershipRoles, memberships, roles, staffAttendance, users } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { lagosToday } from "../src/lib/services/attendance";
import { DEFAULT_HR, workdaysBetween } from "../src/lib/services/hr";

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
function seeded(n: number) {
  const x = Math.sin(n * 4567 + 89) * 10000;
  return x - Math.floor(x);
}

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const today = lagosToday();
  const n = await withTenant(db, owner.school.id, async (tx) => {
    const existing = await tx.select({ id: staffAttendance.id }).from(staffAttendance).limit(1);
    if (existing.length) return null;
    const staff = await tx
      .selectDistinct({ id: memberships.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff")));
    const rows: (typeof staffAttendance.$inferInsert)[] = [];
    let k = 0;
    for (let d = addDays(today, -14); d < today; d = addDays(d, 1)) {
      if (!DEFAULT_HR.workDays.includes(weekday(d))) continue;
      for (const s of staff) {
        k++;
        const r = seeded(k);
        if (r < 0.04) {
          rows.push({ schoolId: owner.school.id, membershipId: s.id, date: d, status: "absent", method: "manager", note: "Called in sick" });
          continue;
        }
        const minutes = 7 * 60 + 15 + Math.round(r * 40); // 07:15 to 07:55
        const late = minutes > 7 * 60 + 45;
        const inAt = new Date(`${d}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+01:00`);
        const outAt = new Date(`${d}T15:${String(10 + Math.round(seeded(k + 1000) * 45)).padStart(2, "0")}:00+01:00`);
        rows.push({ schoolId: owner.school.id, membershipId: s.id, date: d, status: late ? "late" : "present", clockIn: inAt, clockOut: outAt, method: "self" });
      }
    }
    await tx.insert(staffAttendance).values(rows);
    const byName = (needle: string) => staff.find((s) => s.name.includes(needle));
    const teacher = byName("Adeyemi");
    const bursar = byName("Musa");
    const waiting = [];
    if (teacher) {
      const start = addDays(today, 10);
      const end = addDays(today, 12);
      waiting.push({ schoolId: owner.school.id, membershipId: teacher.id, kind: "annual" as const, startsOn: start, endsOn: end, days: workdaysBetween(start, end, DEFAULT_HR.workDays), reason: "My sister's wedding in Abeokuta." });
    }
    if (bursar) {
      const start = addDays(today, 3);
      const end = addDays(today, 4);
      waiting.push({ schoolId: owner.school.id, membershipId: bursar.id, kind: "casual" as const, startsOn: start, endsOn: end, days: workdaysBetween(start, end, DEFAULT_HR.workDays), reason: "Bank and embassy appointments.", status: "approved" as const, decidedBy: owner.membershipId, decidedAt: new Date() });
    }
    if (waiting.length) await tx.insert(leaveRequests).values(waiting);
    return { rows: rows.length, staff: staff.length };
  });
  console.log(n ? `HR demo: ${n.rows} attendance days for ${n.staff} staff, one leave request waiting, one approved.` : "HR demo data already there.");
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

