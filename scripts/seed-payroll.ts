/*
 * Payroll for the demo school: pay details for every staff member, last month's payroll paid
 * (with payslips staff can open), and this month's prepared as a draft for the Director to
 * approve. Run with the dev server stopped, after db:seed.
 */
import { eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { membershipRoles, memberships, payrollRuns, roles, staffPay, users } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { lagosToday } from "../src/lib/services/attendance";
import { approveRun, createRun, markRunPaid, payProfileSchema, savePayProfile } from "../src/lib/services/payroll";

const N = (naira: number) => naira * 100;

// Monthly basic, housing, transport by role.
const PAY: Record<string, [number, number, number]> = {
  owner: [450_000, 150_000, 60_000],
  principal: [350_000, 120_000, 50_000],
  admin: [150_000, 50_000, 25_000],
  bursar: [160_000, 55_000, 25_000],
  class_teacher: [130_000, 45_000, 20_000],
  subject_teacher: [115_000, 40_000, 20_000],
};
const BANKS = ["GTBank", "Access Bank", "Zenith Bank", "First Bank", "UBA", "Opay"];

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const director = await findUserByEmail(db, "director@demo.schoolos.ng");
  if (!director) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, director.id, "adalin-college"))!;
  const existing = await withTenant(db, owner.school.id, (tx) => tx.select({ id: payrollRuns.id }).from(payrollRuns).limit(1));
  if (existing.length) {
    console.log("Payroll demo data already there.");
    await database.close();
    return;
  }
  const staff = await withTenant(db, owner.school.id, (tx) =>
    tx
      .select({ membershipId: memberships.id, name: users.name, key: roles.key })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .where(eq(roles.kind, "staff")),
  );
  const seen = new Set<string>();
  let i = 0;
  for (const s of staff) {
    if (seen.has(s.membershipId)) continue;
    seen.add(s.membershipId);
    const [basic, housing, transport] = PAY[s.key] ?? PAY.subject_teacher;
    await savePayProfile(
      db,
      owner,
      payProfileSchema.parse({
        membershipId: s.membershipId,
        basic: String(basic),
        allowances: [
          { name: "Housing", kobo: N(housing) },
          { name: "Transport", kobo: N(transport) },
          ...(s.key === "class_teacher" ? [{ name: "Form teacher allowance", kobo: N(10_000) }] : []),
        ],
        deductions: i % 3 === 1 ? [{ name: "Staff co-operative", kobo: N(10_000) }] : [],
        pension: true,
        nhf: i % 2 === 0,
        paye: true,
        annualRent: i % 2 === 0 ? N(900_000) : 0,
        bankName: BANKS[i % BANKS.length],
        accountNumber: s.key === "owner" ? "" : String(1_000_000_000 + i * 123_457).slice(0, 10),
        accountName: s.name.replace(/^(Mr|Mrs|Miss|Dr)\.? /, ""),
      }),
    );
    i++;
  }
  const today = lagosToday();
  const last = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() - 1);
  const lastMonth = last.toISOString().slice(0, 7);
  const paid = await createRun(db, owner, lastMonth);
  await approveRun(db, owner, paid.id);
  await markRunPaid(db, owner, paid.id);
  await createRun(db, owner, today.slice(0, 7));
  await withTenant(db, owner.school.id, async (tx) => {
    const n = await tx.select({ id: staffPay.id }).from(staffPay);
    console.log(`Payroll demo: pay details for ${n.length} staff, ${lastMonth} paid, ${today.slice(0, 7)} drafted.`);
  });
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
