/*
 * Fills the demo school with a term of fees: a fee structure, discounts, every student's
 * invoice, a realistic spread of payments over the last month (some online), and a
 * month and a half of expenses. Run with the dev server stopped.
 */
import { and, eq } from "drizzle-orm";
import { createDatabaseFromEnv } from "../src/lib/db/client";
import { invoices, students } from "../src/lib/db/schema";
import { withTenant } from "../src/lib/db/tenant";
import { drainOutbox } from "../src/lib/services/outbox";
import { loadAccess } from "../src/lib/services/access";
import { findUserByEmail } from "../src/lib/services/accounts";
import { getAcademicOverview } from "../src/lib/services/academics";
import { lagosToday } from "../src/lib/services/attendance";
import { createExpense } from "../src/lib/services/expenses";
import { getFeeSetup, saveDiscountScheme, saveFeeItem, saveFeeStructure, setStudentDiscounts } from "../src/lib/services/fees";
import { addInvoiceLine, generateTermInvoices, listInvoices } from "../src/lib/services/invoices";
import { recordPayment } from "../src/lib/services/payments";
import { confirmOnlinePayment, saveFeeSettings, saveSettlementAccount, startOnlinePayment } from "../src/lib/services/paystack";

function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function daysAgo(n: number) {
  const d = new Date(`${lagosToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const N = (naira: number) => String(naira);

async function main() {
  const database = createDatabaseFromEnv();
  await database.migrate();
  const db = database.db;
  const user = await findUserByEmail(db, "director@demo.adalinschoolhub.ng");
  if (!user) throw new Error("Run pnpm db:seed first.");
  const owner = (await loadAccess(db, user.id, "adalin-college"))!;
  const bursarUser = await findUserByEmail(db, "musa2@demo.adalinschoolhub.ng");
  const bursar = bursarUser ? ((await loadAccess(db, bursarUser.id, "adalin-college")) ?? owner) : owner;

  const setup = await getFeeSetup(db, owner);
  if (setup.invoiced > 0) {
    console.log(`Fees already seeded (${setup.invoiced} invoices for ${setup.term.label}).`);
    await database.close();
    return;
  }

  // Fee items and the structure.
  const item = async (name: string, isOptional = false) => (await saveFeeItem(db, owner, { name, isOptional })).id;
  const tuition = await item("Tuition");
  const levy = await item("Development levy");
  const ict = await item("ICT and computer studies");
  const pta = await item("PTA levy");
  const sports = await item("Sports and excursions");
  const bus = await item("School bus", true);
  await item("Lunch", true);

  const overview = await getAcademicOverview(db, owner);
  const amounts: { levelId: string; itemId: string; amount: string }[] = [];
  for (const level of overview.levels) {
    const senior = level.name.startsWith("SS");
    amounts.push(
      { levelId: level.id, itemId: tuition, amount: N(senior ? 210_000 : 185_000) },
      { levelId: level.id, itemId: levy, amount: N(25_000) },
      { levelId: level.id, itemId: ict, amount: N(senior ? 18_000 : 15_000) },
      { levelId: level.id, itemId: pta, amount: N(5_000) },
      { levelId: level.id, itemId: sports, amount: N(7_500) },
      { levelId: level.id, itemId: bus, amount: N(60_000) },
    );
  }
  const termId = setup.term.id;
  await saveFeeStructure(db, owner, { termId, amounts: amounts.map((a) => ({ ...a, amount: Number(a.amount) * 100 })) });

  // Discounts.
  const sibling = await saveDiscountScheme(db, owner, { name: "Sibling discount", kind: "percent", value: 10, itemId: tuition });
  const staffChild = await saveDiscountScheme(db, owner, { name: "Staff child", kind: "percent", value: 50, itemId: tuition });
  const scholarship = await saveDiscountScheme(db, owner, { name: "Academic scholarship", kind: "percent", value: 100, itemId: tuition });
  const roll = await withTenant(db, owner.school.id, (tx) => tx.select({ id: students.id }).from(students).where(eq(students.status, "active")).orderBy(students.admissionNo));
  await setStudentDiscounts(db, owner, roll[2].id, [sibling.id]);
  await setStudentDiscounts(db, owner, roll[3].id, [sibling.id]);
  await setStudentDiscounts(db, owner, roll[7].id, [staffChild.id]);
  await setStudentDiscounts(db, owner, roll[12].id, [scholarship.id]);

  // Where fees settle, so the pay links work in test mode.
  await saveSettlementAccount(db, owner, { bankName: "Guaranty Trust Bank", accountNumber: "0123456789", accountName: "Adalin College Ltd" });
  await saveFeeSettings(db, (await loadAccess(db, user.id, "adalin-college"))!, { withholdResults: false, autoReminders: false, reminderEveryDays: 7, invoiceNote: "Fees once paid are not refundable. Please quote the invoice number on every transfer." });

  // Invoices for everyone.
  const gen = await generateTermInvoices(db, bursar, { termId, dueOn: daysAgo(5) });
  console.log(`Raised ${gen.created} invoices.`);
  const list = await listInvoices(db, owner, { termId, limit: 500 });
  const byStudent = list.rows;

  // Bus for a handful.
  for (const r of byStudent.filter((_, i) => i % 6 === 1)) {
    await addInvoiceLine(db, bursar, { invoiceId: r.invoice.id, kind: "charge", itemId: bus, description: "School bus", amount: 60_000_00 });
  }

  // Payments over the last 30 days: about half in full, a third in part, the rest nothing yet.
  type Plan = { invoiceId: string; token: string; amount: number; day: number; method: "transfer" | "cash" | "pos" | "online" };
  const plans: Plan[] = [];
  const fresh = await listInvoices(db, owner, { termId, limit: 500 });
  fresh.rows.forEach((r, i) => {
    const owed = r.balance;
    if (owed <= 0) return;
    const roll = seeded(i + 1);
    const method = (["transfer", "transfer", "cash", "pos", "online"] as const)[Math.floor(seeded(i + 50) * 5)];
    const day = Math.floor(seeded(i + 99) * 29);
    if (roll < 0.5) plans.push({ invoiceId: r.invoice.id, token: r.invoice.payToken, amount: owed, day, method });
    else if (roll < 0.82) {
      const first = Math.round((owed * (0.4 + seeded(i + 7) * 0.3)) / 100_00) * 100_00;
      plans.push({ invoiceId: r.invoice.id, token: r.invoice.payToken, amount: first, day, method });
    }
  });
  plans.sort((a, b) => b.day - a.day);
  let online = 0;
  for (const p of plans) {
    if (p.method === "online") {
      const { url } = await startOnlinePayment(db, { token: p.token, email: "parent@example.com", amount: p.amount }, "http://localhost:3005");
      await confirmOnlinePayment(db, new URL(url).searchParams.get("reference")!, { testApproved: true });
      online++;
    } else {
      await recordPayment(db, bursar, { invoiceId: p.invoiceId, amount: p.amount, method: p.method, paidOn: daysAgo(p.day), reference: p.method === "transfer" ? `TRF${100000 + Math.floor(seeded(p.day + p.amount) * 899999)}` : null });
    }
  }
  console.log(`Recorded ${plans.length} payments (${online} online).`);

  // Expenses.
  const spend: [number, string, string, number, "cash" | "transfer" | "pos", string | null][] = [
    [2, "Diesel and fuel", "Diesel for the generator, 250 litres", 312_500, "transfer", "Total Energies Lekki"],
    [4, "Repairs and maintenance", "Fix leaking roof, JSS 2 block", 145_000, "cash", "Bode & Sons Works"],
    [6, "Teaching materials", "Science lab reagents and glassware", 88_000, "transfer", "Lab Supplies NG"],
    [9, "Utilities", "Ikeja Electric postpaid bill", 236_400, "transfer", "Ikeja Electric"],
    [11, "Stationery and printing", "Exam booklets and printing", 54_000, "pos", "Copy World"],
    [14, "Cleaning and sanitation", "Cleaning contract, monthly", 120_000, "transfer", "Sparkle Cleaners"],
    [17, "Security", "Security guards, monthly", 180_000, "transfer", "Shield Guards Ltd"],
    [20, "Diesel and fuel", "Diesel for the generator, 200 litres", 250_000, "transfer", "Total Energies Lekki"],
    [24, "Events", "Inter-house sports: medals and refreshments", 96_500, "cash", null],
    [28, "Internet and data", "Office internet, monthly", 45_000, "transfer", "Spectranet"],
    [33, "Bank charges", "Monthly account maintenance", 4_750, "transfer", "GTBank"],
    [38, "Repairs and maintenance", "Service two air conditioners", 38_000, "cash", "CoolTech"],
  ];
  for (const [ago, category, description, naira, method, vendor] of spend) {
    await createExpense(db, owner, { spentOn: daysAgo(ago), category: category === "Internet and data" ? "Utilities" : category, description, amount: naira * 100, method, vendor });
  }
  // Two from the bursar stay pending, so the approval queue has something in it.
  await createExpense(db, bursar, { spentOn: daysAgo(1), category: "Feeding", description: "Staff lunch for open day", amount: 42_000_00, method: "cash", vendor: null });
  await createExpense(db, bursar, { spentOn: daysAgo(0), category: "Transport", description: "Bus tyres, two pieces", amount: 168_000_00, method: "transfer", vendor: "Tyre Masters" });

  const left = await withTenant(db, owner.school.id, (tx) => tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.termId, termId), eq(invoices.status, "unpaid"))));
  console.log(`Done. ${left.length} invoices still unpaid, the rest paid or part paid.`);
  await drainOutbox(db, async (m) => (console.info(`[${m.channel}] ${m.to}`), { ok: true, ref: "seed" }), 5000);
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
