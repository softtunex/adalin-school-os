import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { formatNaira, parseNaira } from "@/lib/money";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { createExpense, decideExpense, listExpenses } from "@/lib/services/expenses";
import { runAutoReminders } from "@/lib/services/fee-reminders";
import { copyFeeStructure, getFeeSetup, saveDiscountScheme, saveFeeItem, saveFeeStructure, setStudentDiscounts } from "@/lib/services/fees";
import { getFeesOverview, getIncomeStatement } from "@/lib/services/finance-report";
import {
  addInvoiceLine,
  buildTermLines,
  createOtherInvoice,
  generateTermInvoices,
  getInvoice,
  listDebtors,
  listInvoices,
  owesForTerm,
  prepareFeeReminders,
  voidInvoice,
} from "@/lib/services/invoices";
import { listPayments, recordPayment, reversePayment } from "@/lib/services/payments";
import { confirmOnlinePayment, getPayPage, handlePaystackEvent, saveSettlementAccount, startOnlinePayment, verifyWebhookSignature } from "@/lib/services/paystack";
import { acceptInvitation, inviteStaff } from "@/lib/services/staff";
import { createStudent, studentInputSchema } from "@/lib/services/students";
import { lagosToday } from "@/lib/services/attendance";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let bursar: Access;
let termId: string;
let jss1: string;
let jss2: string;
let classJss1: string;
let tuition: string;
let levy: string;
let bus: string;
const kids: Record<string, string> = {};

async function reload(a: Access) {
  return (await loadAccess(database.db, a.user.id, a.school.slug))!;
}

async function setPlan(plan: string) {
  await database.db.update(schools).set({ planKey: plan }).where(eq(schools.id, owner.school.id));
  owner = await reload(owner);
  if (bursar) bursar = await reload(bursar);
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, { name: "Mrs Bello", email: "bello@fees.test", password: "FeesSchool1", schoolName: "Fees College" });
  owner = (await loadAccess(database.db, user.id, school.slug))!;
  await setupAcademics(database.db, owner, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  const overview = await getAcademicOverview(database.db, owner);
  jss1 = overview.levels[0].id;
  jss2 = overview.levels[1].id;
  classJss1 = overview.levels[0].classes[0].id;
  const classJss2 = overview.levels[1].classes[0].id;
  termId = overview.sessions.flatMap((s) => s.terms).find((t) => t.isCurrent)!.id;
  for (const [name, classId, email] of [
    ["Ada", classJss1, "ada.parent@fees.test"],
    ["Bayo", classJss1, null],
    ["Chi", classJss2, "chi.parent@fees.test"],
  ] as const) {
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: name, lastName: "Okafor", gender: "female", classId }), [
      { name: `${name}'s Mum`, relationship: "Mother", phone: null, email, occupation: null, address: null },
    ]);
    kids[name] = s.id;
  }
  const [role] = await withTenant(database.db, owner.school.id, (tx) => tx.select().from(roles).where(eq(roles.key, "bursar")));
  const { token } = await inviteStaff(database.db, owner, { name: "Mr Musa", email: "musa@fees.test", roleIds: [role.id] });
  const { userId } = await acceptInvitation(database.db, token, { name: "Mr Musa", password: "Bursar123" });
  bursar = (await loadAccess(database.db, userId, owner.school.slug))!;
});

afterAll(async () => {
  await database.close();
});

describe("money", () => {
  it("parses what people type and formats naira", () => {
    expect(parseNaira("150,000")).toBe(15_000_000);
    expect(parseNaira("₦ 1,500.50")).toBe(150_050);
    expect(parseNaira("150k")).toBe(15_000_000);
    expect(parseNaira("1.2m")).toBe(120_000_000);
    expect(parseNaira("abc")).toBeNull();
    expect(parseNaira("1.234")).toBeNull();
    expect(formatNaira(15_000_000)).toBe("₦150,000");
    expect(formatNaira(150_050)).toBe("₦1,500.5");
  });

  it("builds term lines with discounts that never exceed the charges", () => {
    const items = [
      { id: "t", name: "Tuition", isOptional: false },
      { id: "l", name: "Levy", isOptional: false },
      { id: "b", name: "Bus", isOptional: true },
    ];
    const amounts = new Map([["t", 100_000_00], ["l", 20_000_00], ["b", 30_000_00]]);
    const sibling = { id: "s", name: "Sibling 10%", kind: "percent" as const, value: 10, itemId: null };
    const staffTuition = { id: "x", name: "Staff child 50% tuition", kind: "percent" as const, value: 50, itemId: "t" };
    const huge = { id: "h", name: "Bursary", kind: "fixed" as const, value: 500_000_00, itemId: null };
    expect(buildTermLines(items, amounts, [])).toMatchObject({ total: 120_000_00, discount: 0 });
    expect(buildTermLines(items, amounts, [sibling, staffTuition])).toMatchObject({ total: 120_000_00, discount: 12_000_00 + 50_000_00 });
    const capped = buildTermLines(items, amounts, [staffTuition, huge]);
    expect(capped.discount).toBe(120_000_00);
    expect(capped.discounts.map((d) => d.amountKobo)).toEqual([50_000_00, 70_000_00]);
  });
});

describe("fee structure", () => {
  it("is locked on the Free plan", async () => {
    await expect(getFeeSetup(database.db, owner)).rejects.toThrow(/Basic plan/);
  });

  it("lets the bursar set items and amounts per class level", async () => {
    await setPlan("basic");
    tuition = (await saveFeeItem(database.db, bursar, { name: "Tuition", isOptional: false })).id;
    levy = (await saveFeeItem(database.db, bursar, { name: "Development levy", isOptional: false })).id;
    bus = (await saveFeeItem(database.db, bursar, { name: "School bus", isOptional: true })).id;
    await expect(saveFeeItem(database.db, bursar, { name: "Tuition", isOptional: false })).rejects.toThrow(/already/);
    await saveFeeStructure(database.db, bursar, {
      termId,
      amounts: [
        { levelId: jss1, itemId: tuition, amount: 150_000_00 },
        { levelId: jss1, itemId: levy, amount: 20_000_00 },
        { levelId: jss1, itemId: bus, amount: 45_000_00 },
        { levelId: jss2, itemId: tuition, amount: 160_000_00 },
        { levelId: jss2, itemId: levy, amount: 0 },
      ],
    });
    const setup = await getFeeSetup(database.db, bursar);
    expect(setup.levelTotals[jss1]).toBe(170_000_00);
    expect(setup.levelTotals[jss2]).toBe(160_000_00);
    expect(setup.grid[jss2][levy]).toBeUndefined();
  });

  it("copies a structure into another term", async () => {
    const setup = await getFeeSetup(database.db, bursar);
    const next = setup.terms.find((t) => t.id !== termId)!;
    expect(await copyFeeStructure(database.db, bursar, { fromTermId: termId, toTermId: next.id })).toBe(4);
    expect((await getFeeSetup(database.db, bursar, next.id)).levelTotals[jss1]).toBe(170_000_00);
  });

  it("keeps discounts on the Standard plan", async () => {
    await expect(saveDiscountScheme(database.db, bursar, { name: "Sibling", kind: "percent", value: 10, itemId: null })).rejects.toThrow(/Standard plan/);
  });
});

describe("invoices and payments", () => {
  let adaInvoice: string;

  it("raises one term invoice per student, skipping optional items, and is safe to run twice", async () => {
    await setPlan("standard");
    const sibling = await saveDiscountScheme(database.db, bursar, { name: "Sibling discount", kind: "percent", value: 10, itemId: tuition });
    await setStudentDiscounts(database.db, bursar, kids.Bayo, [sibling.id]);

    const first = await generateTermInvoices(database.db, bursar, { termId, dueOn: "2026-10-01" });
    expect(first).toMatchObject({ created: 3, alreadyInvoiced: 0, noFees: 0 });
    const again = await generateTermInvoices(database.db, bursar, { termId });
    expect(again).toMatchObject({ created: 0, alreadyInvoiced: 3 });

    const list = await listInvoices(database.db, bursar, { termId });
    const byName = Object.fromEntries(list.rows.map((r) => [r.student.firstName, r]));
    expect(byName.Ada.invoice).toMatchObject({ chargesKobo: 170_000_00, discountKobo: 0, status: "unpaid" });
    expect(byName.Bayo.invoice).toMatchObject({ chargesKobo: 170_000_00, discountKobo: 15_000_00 });
    expect(byName.Chi.invoice.chargesKobo).toBe(160_000_00);
    expect(list.rows.map((r) => r.invoice.number).sort()).toEqual(["INV-00001", "INV-00002", "INV-00003"]);
    expect(list.summary).toMatchObject({ invoices: 3, expected: 485_000_00, collected: 0, outstanding: 485_000_00 });
    expect(byName.Ada.overdue).toBe(lagosToday() > "2026-10-01");
    adaInvoice = byName.Ada.invoice.id;

    const detail = await getInvoice(database.db, bursar, adaInvoice);
    expect(detail.lines.map((l) => l.description)).toEqual(["Tuition", "Development levy"]);
    expect(detail.contacts[0].email).toBe("ada.parent@fees.test");
  });

  it("records part-payments with receipts and refuses overpayment", async () => {
    const today = lagosToday();
    const { payment, invoice } = await recordPayment(database.db, bursar, { invoiceId: adaInvoice, amount: 100_000_00, method: "transfer", paidOn: today, reference: "GTB-123" });
    expect(payment.receiptNo).toBe("RCT-00001");
    expect(invoice).toMatchObject({ paidKobo: 100_000_00, status: "partial" });
    await expect(recordPayment(database.db, bursar, { invoiceId: adaInvoice, amount: 80_000_00, method: "cash", paidOn: today })).rejects.toThrow(/more than the balance of ₦70,000/);
    await expect(recordPayment(database.db, bursar, { invoiceId: adaInvoice, amount: 1_000_00, method: "cash", paidOn: "2999-01-01" })).rejects.toThrow(/future/);
    const second = await recordPayment(database.db, bursar, { invoiceId: adaInvoice, amount: 70_000_00, method: "cash", paidOn: today });
    expect(second.payment.receiptNo).toBe("RCT-00002");
    expect(second.invoice.status).toBe("paid");
    await expect(voidInvoice(database.db, bursar, { invoiceId: adaInvoice, reason: "Wrong class" })).rejects.toThrow(/Reverse them/);

    await reversePayment(database.db, bursar, { paymentId: second.payment.id, reason: "Counterfeit notes" });
    const after = await getInvoice(database.db, bursar, adaInvoice);
    expect(after.invoice.status).toBe("partial");
    expect(after.balance).toBe(70_000_00);
    expect(after.payments.find((p) => p.id === second.payment.id)!.status).toBe("reversed");

    const payments = await listPayments(database.db, bursar, {});
    expect(payments).toMatchObject({ total: 1, amount: 100_000_00 });
  });

  it("supports one-off invoices, extra charges and ad-hoc discounts", async () => {
    const uniform = await createOtherInvoice(database.db, bursar, { studentId: kids.Chi, termId, title: "Uniform", lines: [{ description: "Two sets of uniform", amount: 25_000_00 }] });
    expect(uniform.number).toBe("INV-00004");
    const charged = await addInvoiceLine(database.db, bursar, { invoiceId: uniform.id, kind: "charge", description: "Sports wear", amount: 8_000_00 });
    expect(charged.chargesKobo).toBe(33_000_00);
    await expect(addInvoiceLine(database.db, bursar, { invoiceId: uniform.id, kind: "discount", description: "Too much", amount: 40_000_00 })).rejects.toThrow(/balance/);
    const discounted = await addInvoiceLine(database.db, bursar, { invoiceId: uniform.id, kind: "discount", description: "Goodwill", amount: 3_000_00 });
    expect(discounted.discountKobo).toBe(3_000_00);
    await voidInvoice(database.db, bursar, { invoiceId: uniform.id, reason: "Raised in error" });
    expect((await getInvoice(database.db, bursar, uniform.id)).invoice.status).toBe("void");
  });

  it("keeps one school's invoices away from another school", async () => {
    const { user, school } = await registerSchoolOwner(database.db, { name: "Other Owner", email: "other@fees.test", password: "OtherSchool1", schoolName: "Other School" });
    const other = (await loadAccess(database.db, user.id, school.slug))!;
    await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, other.school.id));
    await expect(getInvoice(database.db, (await loadAccess(database.db, user.id, school.slug))!, adaInvoice)).rejects.toThrow(/wasn't found/);
  });
});

describe("debtors, reminders and withheld results", () => {
  it("lists who owes, largest balance first", async () => {
    const debtors = await listDebtors(database.db, bursar, { termId });
    expect(debtors.rows.map((r) => r.student.firstName)).toEqual(["Chi", "Bayo", "Ada"]);
    expect(debtors.owed).toBe(160_000_00 + 155_000_00 + 70_000_00);
    expect(debtors.rows.find((r) => r.student.firstName === "Bayo")!.contact?.email).toBeNull();
  });

  it("emails guardians with an email address, and not twice in a day", async () => {
    const first = await prepareFeeReminders(database.db, bursar, { termId, baseUrl: "https://app.test" });
    expect(first).toMatchObject({ reminded: 2, noContact: 1 });
    expect(first.emails.map((e) => e.to).sort()).toEqual(["ada.parent@fees.test", "chi.parent@fees.test"]);
    expect(first.emails.find((e) => e.to.startsWith("ada"))!.text).toContain("₦70,000");
    const second = await prepareFeeReminders(database.db, bursar, { termId, baseUrl: "https://app.test" });
    expect(second.reminded).toBe(0);
  });

  it("runs automatic reminders only for schools that turned them on", async () => {
    const sent: string[] = [];
    expect(await runAutoReminders(database.db, "https://app.test", async (r) => sent.push(r.to))).toEqual([]);
    await database.db.update(schools).set({ feeSettings: { autoReminders: true, reminderEveryDays: 7 } }).where(eq(schools.id, owner.school.id));
    expect(await runAutoReminders(database.db, "https://app.test", async (r) => sent.push(r.to))).toEqual([]); // reminded within the interval already
    expect(sent).toEqual([]);
  });

  it("reports what a student owes for the result checker", async () => {
    const owed = await withTenant(database.db, owner.school.id, (tx) => owesForTerm(tx, kids.Ada, termId));
    expect(owed).toBe(70_000_00);
  });
});

describe("online payment (test mode)", () => {
  it("needs a settlement account before parents can pay online", async () => {
    const debtors = await listDebtors(database.db, bursar, { termId });
    const chi = debtors.rows.find((r) => r.student.firstName === "Chi")!;
    const before = await getPayPage(database.db, chi.invoice.payToken);
    expect(before?.canPayOnline).toBe(false);
    await expect(saveSettlementAccount(database.db, bursar, { bankName: "GTBank", accountNumber: "0123456789", accountName: "Fees College" })).rejects.toThrow(/permission/);
    await saveSettlementAccount(database.db, owner, { bankName: "GTBank", accountNumber: "0123456789", accountName: "Fees College" });
    const page = await getPayPage(database.db, chi.invoice.payToken);
    expect(page).toMatchObject({ canPayOnline: true, balance: 160_000_00, mode: "test" });
    expect(page!.school.bank?.accountName).toBe("Fees College");
    expect(await getPayPage(database.db, "not-a-real-token-at-all")).toBeNull();

    await expect(startOnlinePayment(database.db, { token: chi.invoice.payToken, email: "chi.parent@fees.test", amount: 200_000_00 }, "https://app.test")).rejects.toThrow(/more than the balance/);
    const { url } = await startOnlinePayment(database.db, { token: chi.invoice.payToken, email: "chi.parent@fees.test", amount: 60_000_00 }, "https://app.test");
    const reference = new URL(url).searchParams.get("reference")!;
    expect(url).toContain("/test-checkout");

    expect(await confirmOnlinePayment(database.db, reference)).toMatchObject({ ok: false });
    expect(await confirmOnlinePayment(database.db, reference, { testApproved: true })).toEqual({ ok: true });
    expect(await confirmOnlinePayment(database.db, reference, { testApproved: true })).toEqual({ ok: true });
    const after = await getInvoice(database.db, bursar, chi.invoice.id);
    expect(after.balance).toBe(100_000_00);
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({ method: "paystack", amountKobo: 60_000_00 });

    // A replayed webhook for the same reference doesn't double count.
    await handlePaystackEvent(database.db, { event: "charge.success", data: { reference, amount: 60_000_00, currency: "NGN" } });
    expect((await getInvoice(database.db, bursar, chi.invoice.id)).payments).toHaveLength(1);
  });

  it("only trusts webhooks signed with the secret key", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
    const body = JSON.stringify({ event: "charge.success" });
    const sig = createHmac("sha512", "sk_test_x").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig)).toBe(true);
    expect(verifyWebhookSignature(body, sig.replace(/.$/, "0"))).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it("shows the term on the bursar's dashboard", async () => {
    const overview = await getFeesOverview(database.db, bursar, termId);
    expect(overview.summary.collected).toBe(160_000_00);
    expect(overview.byClass).toHaveLength(2);
    expect(overview.series).toHaveLength(30);
    expect(overview.series.at(-1)!.amount).toBe(160_000_00);
    expect(overview.methods.map((m) => m.method).sort()).toEqual(["paystack", "transfer"]);
  });
});

describe("expenses and the income statement", () => {
  it("are on the Premium plan, and the bursar's expenses wait for approval", async () => {
    const today = lagosToday();
    await expect(createExpense(database.db, bursar, { spentOn: today, category: "Diesel and fuel", description: "Generator diesel", amount: 85_000_00, method: "cash" })).rejects.toThrow(/Premium plan/);
    await setPlan("premium");
    const pending = await createExpense(database.db, bursar, { spentOn: today, category: "Diesel and fuel", description: "Generator diesel", amount: 85_000_00, method: "cash" });
    expect(pending.status).toBe("pending");
    await expect(decideExpense(database.db, bursar, { expenseId: pending.id, approve: true })).rejects.toThrow(/permission/);
    await decideExpense(database.db, owner, { expenseId: pending.id, approve: true });
    const own = await createExpense(database.db, owner, { spentOn: today, category: "Repairs and maintenance", description: "Fix classroom roof", amount: 40_000_00, method: "transfer", vendor: "Bode Works" });
    expect(own.status).toBe("approved");
    const list = await listExpenses(database.db, bursar, {});
    expect(list).toMatchObject({ total: 2, amount: 125_000_00, thisMonth: 125_000_00 });
  });

  it("splits fee income across items and nets off expenses", async () => {
    const today = lagosToday();
    const statement = await getIncomeStatement(database.db, owner, { from: "2026-01-01", to: today });
    expect(statement.totalIncome).toBe(160_000_00);
    // Ada paid 100,000 on 150,000 tuition + 20,000 levy; Chi paid 60,000 all tuition.
    const tuitionIncome = statement.income.find((r) => r.label === "Tuition")!.amount;
    const levyIncome = statement.income.find((r) => r.label === "Development levy")!.amount;
    expect(tuitionIncome + levyIncome).toBe(160_000_00);
    expect(levyIncome).toBe(Math.round((100_000_00 * 20_000_00) / 170_000_00 / 100) * 100);
    expect(statement.totalExpenses).toBe(125_000_00);
    expect(statement.net).toBe(35_000_00);
  });
});
