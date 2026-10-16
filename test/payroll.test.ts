import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { expenses, notifications, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { approveRun, createRun, editPayslip, getPayslip, getRun, listPayProfiles, markRunPaid, myPayslips, payProfileSchema, savePayProfile } from "@/lib/services/payroll";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let bursar: Access;
let teacher: Access;
let other: Access;
const N = (naira: number) => naira * 100;
const month = new Date().toISOString().slice(0, 7);

async function staff(key: string, email: string) {
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  const { token } = await inviteStaff(database.db, owner, { name: email.split("@")[0], email, roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: email.split("@")[0], password: "Teacher123" });
  return (await loadAccess(database.db, userId, owner.school.slug))!;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Chief Pay", email: "chief@pay.test", password: "Payroll123", schoolName: "Payroll Academy" });
  await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, school.id));
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  bursar = await staff("bursar", "bursar@pay.test");
  teacher = await staff("subject_teacher", "teacher@pay.test");
  other = await staff("subject_teacher", "other@pay.test");
});

afterAll(async () => {
  await database.close();
});

describe("payroll", () => {
  let runId = "";

  it("keeps a pay profile per staff member", async () => {
    await expect(listPayProfiles(database.db, teacher)).rejects.toThrow(/permission/);
    await savePayProfile(
      database.db,
      bursar,
      payProfileSchema.parse({
        membershipId: teacher.membershipId,
        basic: "120,000",
        allowances: [
          { name: "Housing", kobo: N(40_000) },
          { name: "Transport", kobo: N(20_000) },
        ],
        deductions: [{ name: "Co-operative", kobo: N(5_000) }],
        pension: true,
        nhf: false,
        paye: true,
        accountNumber: "0123456789",
        bankName: "GTBank",
        accountName: "Teacher Oke",
      }),
    );
    await savePayProfile(database.db, bursar, payProfileSchema.parse({ membershipId: other.membershipId, basic: "90000", pension: false, nhf: false, paye: false }));
    expect(payProfileSchema.safeParse({ membershipId: other.membershipId, basic: "1", pension: false, nhf: false, paye: false, accountNumber: "123" }).success).toBe(false);
    const list = await listPayProfiles(database.db, bursar);
    expect(list.stats).toMatchObject({ onPayroll: 2, missingBank: 1 });
  });

  it("prepares a month with one-off bonuses", async () => {
    const run = await createRun(database.db, bursar, month);
    runId = run.id;
    await expect(createRun(database.db, bursar, month)).rejects.toThrow(/already a payroll/);
    const d = await getRun(database.db, bursar, runId);
    expect(d.slips).toHaveLength(2);
    const slip = d.slips.find((s) => s.membershipId === teacher.membershipId)!;
    expect(slip.pensionKobo).toBe(N(14_400));
    await editPayslip(database.db, bursar, { payslipId: slip.id, extras: [{ name: "Exam bonus", kobo: N(10_000) }], deductions: slip.deductions });
    const after = (await getRun(database.db, bursar, runId)).slips.find((s) => s.id === slip.id)!;
    expect(after.grossKobo).toBe(N(190_000));
    expect((await getRun(database.db, bursar, runId)).run.grossKobo).toBe(N(190_000 + 90_000));
  });

  it("needs the proprietor to approve, then records the cost and tells staff", async () => {
    await expect(approveRun(database.db, bursar, runId)).rejects.toThrow(/Only the proprietor/);
    await expect(markRunPaid(database.db, bursar, runId)).rejects.toThrow(/Approve the payroll first/);
    expect(await myPayslips(database.db, teacher)).toHaveLength(0);
    await approveRun(database.db, owner, runId);
    await markRunPaid(database.db, bursar, runId);
    const [e] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(expenses).where(eq(expenses.reference, `PAYROLL-${month}`)));
    const run = (await getRun(database.db, owner, runId)).run;
    expect(e).toMatchObject({ category: "Salaries and wages", status: "approved", amountKobo: run.grossKobo + run.employerPensionKobo });
    const told = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(notifications).where(eq(notifications.kind, "payslip")));
    expect(told.map((n) => n.userId).sort()).toEqual([teacher.user.id, other.user.id].sort());
  });

  it("shows each teacher only their own payslip", async () => {
    const mine = await myPayslips(database.db, teacher);
    expect(mine).toHaveLength(1);
    expect((await getPayslip(database.db, teacher, mine[0].slip.id)).slip.name).toBe("teacher");
    await expect(getPayslip(database.db, other, mine[0].slip.id)).rejects.toThrow(/wasn't found/);
  });
});
