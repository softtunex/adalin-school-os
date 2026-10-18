import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { academicSessions, membershipRoles, memberships, outboundMessages, plans, platformInvoices, roles, schools, students, terms, users, type BillLine } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { formatNaira } from "../money";
import type { PlanRow } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { lagosToday } from "./attendance";
import { recordAudit } from "./audit";
import { notifyUsers } from "./notify";
import { enqueue } from "./outbox";
import { paystack, paystackMode } from "./paystack";
import { activateAddonsForBill, syncExtraFeatures, termAddonLines } from "./addons";
import { addDays, charge, dayDiff, nextBillNumber, termFraction } from "./billing-core";

export { charge, termFraction };

const pupils = (n: number) => `${n} student${n === 1 ? "" : "s"}`;

/*
 * Adalin billing schools. Each term a school on a paid plan gets a bill: students on roll
 * times the plan's price per student. Upgrades take effect at once and are charged for the
 * rest of the term; downgrades start next term. One free trial per school. A bill unpaid a
 * week after its due date puts the school in read-only mode until it's paid; nothing is lost.
 */

export const TRIAL_DAYS = 30;
export const DUE_DAYS = 14;
export const GRACE_DAYS = 7;
export const TRIAL_PLANS = ["standard", "premium"];
const SELF_SERVE = ["free", "basic", "standard", "premium"];

type School = typeof schools.$inferSelect;
type Term = typeof terms.$inferSelect;

function actor(access: Access, ip?: string | null) {
  return { userId: access.user.id, name: access.user.name, ip };
}

async function activeStudents(tx: Tx) {
  const [{ n }] = await tx.select({ n: count() }).from(students).where(eq(students.status, "active"));
  return n;
}

async function currentTerm(tx: Tx) {
  const [row] = await tx.select({ term: terms, session: academicSessions.name }).from(terms).innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId)).where(eq(terms.isCurrent, true));
  return row ?? null;
}

const periodOf = (t: { term: Term; session: string }) => `${/term$/i.test(t.term.name) ? t.term.name : `${t.term.name} term`}, ${t.session}`;

async function planRow(db: DB | Tx, key: string): Promise<PlanRow> {
  const [p] = await db.select().from(plans).where(eq(plans.key, key));
  if (!p) throw new AppError("That plan wasn't found.", "not_found");
  return p;
}

/** The people who hear about the school's bill: everyone with the proprietor role. */
async function billingContacts(db: DB, schoolId: string) {
  return db
    .selectDistinct({ userId: users.id, email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.schoolId, schoolId), eq(memberships.status, "active"), eq(roles.key, "owner")));
}

async function tellOwners(db: DB, school: { id: string; slug: string; name: string }, n: { title: string; body: string; ref: string; email?: string }) {
  const people = await billingContacts(db, school.id);
  await withTenant(db, school.id, async (tx) => {
    await notifyUsers(tx, school.id, people.map((p) => p.userId), { kind: "billing", title: n.title, body: n.body, link: `/s/${school.slug}/settings?tab=plan`, ref: n.ref });
    if (n.email) {
      // The daily run may meet the same event twice; anyone already emailed about it is skipped.
      const refs = people.map((p) => `${n.ref}:${p.userId}`);
      const sent = new Set((await tx.select({ ref: outboundMessages.ref }).from(outboundMessages).where(inArray(outboundMessages.ref, refs))).map((r) => r.ref));
      await enqueue(
        tx,
        school.id,
        people.filter((p) => p.email && !sent.has(`${n.ref}:${p.userId}`)).map((p) => ({ channel: "email" as const, to: p.email!, subject: `Adalin SchoolHub: ${n.title}`, body: `Dear ${p.name},\n\n${n.email}\n\nAdalin SchoolHub, by Adalin Technologies`, kind: "billing", ref: `${n.ref}:${p.userId}` })),
      );
    }
  });
}

// ---------- What the school sees ----------

export async function billingOverview(db: DB, access: Access) {
  requirePermission(access, "school:billing");
  await ensureTermBill(db, access.school.id);
  const school = (await db.select().from(schools).where(eq(schools.id, access.school.id)))[0];
  return withTenant(db, access.school.id, async (tx) => {
    const [plan, allPlans, onRoll, term, bills] = await Promise.all([
      planRow(tx, school.planKey),
      tx.select().from(plans).orderBy(asc(plans.sort)),
      activeStudents(tx),
      currentTerm(tx),
      tx.select().from(platformInvoices).orderBy(desc(platformInvoices.issuedOn), desc(platformInvoices.createdAt)).limit(50),
    ]);
    const today = lagosToday();
    const open = bills.filter((b) => b.status === "open");
    const overdue = open.filter((b) => b.dueOn < today);
    return {
      school,
      plan,
      plans: allPlans,
      onRoll,
      term: term ? { name: periodOf(term), startsOn: term.term.startsOn, endsOn: term.term.endsOn } : null,
      estimate: plan.pricePerStudentKobo ? charge(plan.pricePerStudentKobo, onRoll) : 0,
      trial: school.trialEndsAt ? { plan: plan.name, endsAt: school.trialEndsAt, daysLeft: Math.max(0, Math.ceil((school.trialEndsAt.getTime() - Date.now()) / 86_400_000)), returnTo: school.trialReturnPlanKey } : null,
      trialAvailable: !school.trialUsed,
      pending: school.pendingPlanKey ? allPlans.find((p) => p.key === school.pendingPlanKey) ?? null : null,
      bills,
      owed: open.reduce((n, b) => n + b.totalKobo, 0),
      overdue: overdue.length,
      readOnly: school.status === "read_only",
      payMode: paystackMode(),
    };
  });
}

/** For the banner across the app: read-only, a bill overdue, or a trial ending soon. */
export async function billingNotice(db: DB, schoolId: string) {
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  if (!school) return null;
  if (school.status === "read_only") return { tone: "danger" as const, text: "Your school is read-only until the overdue Adalin SchoolHub bill is paid. Everyone can still view everything." };
  const today = lagosToday();
  const [overdue] = await withTenant(db, schoolId, (tx) => tx.select({ dueOn: platformInvoices.dueOn }).from(platformInvoices).where(and(eq(platformInvoices.status, "open"), sql`${platformInvoices.dueOn} < ${today}`)).orderBy(asc(platformInvoices.dueOn)).limit(1));
  if (overdue) {
    const lockOn = addDays(overdue.dueOn, GRACE_DAYS);
    return { tone: "warning" as const, text: `A Adalin SchoolHub bill is overdue. Pay by ${new Date(`${lockOn}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "long", timeZone: "UTC" })} to avoid read-only mode.` };
  }
  if (school.trialEndsAt) {
    const days = Math.ceil((school.trialEndsAt.getTime() - Date.now()) / 86_400_000);
    if (days <= 5) return { tone: "blue" as const, text: `Your free trial ends in ${Math.max(0, days)} day${days === 1 ? "" : "s"}. Choose a plan to keep its features.` };
  }
  return null;
}

// ---------- Trials and plan changes ----------

export async function startTrial(db: DB, access: Access, planKey: string, ip?: string | null) {
  requirePermission(access, "school:billing");
  if (!TRIAL_PLANS.includes(planKey)) throw new AppError("Trials are for the Standard and Premium plans.", "invalid");
  const school = (await db.select().from(schools).where(eq(schools.id, access.school.id)))[0];
  if (school.trialUsed) throw new AppError("Your school has already had its free trial.", "conflict");
  const target = await planRow(db, planKey);
  const ends = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  await db.update(schools).set({ planKey, trialReturnPlanKey: school.planKey, trialEndsAt: ends, trialUsed: true, pendingPlanKey: null }).where(eq(schools.id, school.id));
  await withTenant(db, school.id, (tx) => recordAudit(tx, school.id, actor(access, ip), { action: "billing.trial", summary: `Started a ${TRIAL_DAYS}-day free trial of ${target.name}` }));
  return { plan: target.name, endsAt: ends };
}

/**
 * Upgrades start at once and are billed for the rest of the term. Downgrades wait for the
 * next term, so nothing paid for is taken away. Choosing a plan during a trial ends the trial.
 */
export async function changePlan(db: DB, access: Access, planKey: string, ip?: string | null) {
  requirePermission(access, "school:billing");
  if (!SELF_SERVE.includes(planKey)) throw new AppError("Talk to us about Enterprise. We'll set it up with you.", "invalid");
  // Reads, then updates, then the bill: never a query outside an open transaction, which on a
  // single-connection database waits on itself.
  const school = (await db.select().from(schools).where(eq(schools.id, access.school.id)))[0];
  const [from, to] = await Promise.all([planRow(db, school.trialReturnPlanKey ?? school.planKey), planRow(db, planKey)]);
  const onTrial = !!school.trialEndsAt;
  const { onRoll, term, termBill } = await withTenant(db, school.id, async (tx) => {
    const term = await currentTerm(tx);
    const [termBill] = term
      ? await tx
          .select()
          .from(platformInvoices)
          .where(and(eq(platformInvoices.termId, term.term.id), eq(platformInvoices.kind, "term"), ne(platformInvoices.status, "void")))
      : [];
    return { onRoll: await activeStudents(tx), term, termBill: termBill ?? null };
  });
  const limit = to.limits.students;
  if (typeof limit === "number" && onRoll > limit) throw new AppError(`${to.name} allows ${limit} students and you have ${onRoll} on roll.`, "limit");
  const fromPrice = from.pricePerStudentKobo ?? 0;
  const toPrice = to.pricePerStudentKobo ?? 0;
  if (!onTrial && planKey === school.planKey) {
    if (school.pendingPlanKey) await db.update(schools).set({ pendingPlanKey: null }).where(eq(schools.id, school.id));
    return { change: "kept" as const, plan: to.name, bill: null };
  }
  // Cheaper plan: from next term (a trial simply ends onto it).
  if (toPrice < fromPrice && !onTrial) {
    await db.update(schools).set({ pendingPlanKey: planKey }).where(eq(schools.id, school.id));
    await withTenant(db, school.id, (tx) => recordAudit(tx, school.id, actor(access, ip), { action: "billing.downgrade", summary: `Moving to ${to.name} from next term` }));
    return { change: "next_term" as const, plan: to.name, bill: null };
  }
  await db.update(schools).set({ planKey, trialEndsAt: null, trialReturnPlanKey: null, pendingPlanKey: null }).where(eq(schools.id, school.id));
  const today = lagosToday();
  const lines: BillLine[] = [];
  if (term && toPrice > 0) {
    const fraction = termFraction(term.term, today);
    if (termBill && !onTrial) {
      // Already billed this term at the old price: charge the difference for what's left.
      const diff = charge(toPrice - fromPrice, termBill.studentCount, fraction);
      if (diff > 0) lines.push({ description: `Upgrade from ${from.name} to ${to.name}: ${pupils(termBill.studentCount)} × ${formatNaira(toPrice - fromPrice)}, ${Math.round(fraction * 100)}% of the term left`, amountKobo: diff });
    } else if (!termBill) {
      const amount = charge(toPrice, onRoll, fraction);
      if (amount > 0) lines.push({ description: `${to.name}: ${pupils(onRoll)} × ${formatNaira(toPrice)}${fraction < 1 ? `, ${Math.round(fraction * 100)}% of the term left` : ""}`, amountKobo: amount });
    }
  }
  const number = lines.length ? await nextBillNumber(db) : null;
  const bill = await withTenant(db, school.id, async (tx) => {
    let bill: typeof platformInvoices.$inferSelect | null = null;
    if (number && term) {
      [bill] = await tx
        .insert(platformInvoices)
        .values({
          schoolId: school.id,
          number,
          kind: termBill ? "upgrade" : "term",
          termId: term.term.id,
          period: periodOf(term),
          planKey,
          studentCount: termBill?.studentCount ?? onRoll,
          lines,
          totalKobo: lines.reduce((n, l) => n + l.amountKobo, 0),
          issuedOn: today,
          dueOn: addDays(today, DUE_DAYS),
        })
        .returning();
    }
    await recordAudit(tx, school.id, actor(access, ip), { action: "billing.plan", summary: `Changed plan to ${to.name}${bill ? ` (bill ${bill.number}, ${formatNaira(bill.totalKobo)})` : ""}` });
    return bill;
  });
  return { change: "now" as const, plan: to.name, bill };
}

// ---------- Term bills ----------

/**
 * Makes sure a school on a paid plan has its bill for the current term. A downgrade chosen
 * last term takes effect here. Safe to call any number of times.
 */
export async function ensureTermBill(db: DB, schoolId: string) {
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  if (!school || school.status === "suspended" || school.trialEndsAt) return null;
  const found = await withTenant(db, schoolId, async (tx) => {
    const term = await currentTerm(tx);
    if (!term) return null;
    const [existing] = await tx.select({ id: platformInvoices.id }).from(platformInvoices).where(and(eq(platformInvoices.termId, term.term.id), eq(platformInvoices.kind, "term")));
    return existing ? null : { term, onRoll: await activeStudents(tx) };
  });
  if (!found) return null;
  let planKey = school.planKey;
  if (school.pendingPlanKey) {
    planKey = school.pendingPlanKey;
    await db.update(schools).set({ planKey, pendingPlanKey: null }).where(eq(schools.id, schoolId));
  }
  const plan = await planRow(db, planKey);
  // A new term: add-ons cancelled last term stop now.
  await syncExtraFeatures(db, schoolId);
  const planAmount = plan.pricePerStudentKobo ? charge(plan.pricePerStudentKobo, found.onRoll) : 0;
  const lines: BillLine[] = [
    ...(planAmount ? [{ description: `${plan.name}: ${pupils(found.onRoll)} on roll × ${formatNaira(plan.pricePerStudentKobo!)}`, amountKobo: planAmount }] : []),
    ...(await termAddonLines(db, schoolId, found.term.term.id)),
  ];
  const amount = lines.reduce((n, l) => n + l.amountKobo, 0);
  if (!amount) return null;
  const number = await nextBillNumber(db);
  const today = lagosToday();
  const [bill] = await withTenant(db, schoolId, (tx) =>
    tx
      .insert(platformInvoices)
      .values({
        schoolId,
        number,
        kind: "term",
        termId: found.term.term.id,
        period: periodOf(found.term),
        planKey,
        studentCount: found.onRoll,
        lines,
        totalKobo: amount,
        issuedOn: today,
        dueOn: addDays(today, DUE_DAYS),
      })
      .returning(),
  );
  return bill;
}

// ---------- Paying ----------

/** Starts paying a bill: Paystack checkout to Adalin's account, or straight through in test mode. */
export async function payBill(db: DB, access: Access, billId: string, baseUrl: string, ip?: string | null) {
  requirePermission(access, "school:billing");
  const [bill] = await withTenant(db, access.school.id, (tx) => tx.select().from(platformInvoices).where(eq(platformInvoices.id, billId)));
  if (!bill) throw new AppError("That bill wasn't found.", "not_found");
  if (bill.status !== "open") throw new AppError(bill.status === "paid" ? "That bill is already paid." : "That bill was cancelled.", "conflict");
  const reference = `sosb_${randomBytes(12).toString("hex")}`;
  const mode = paystackMode();
  if (mode === "off") throw new AppError("Online payment isn't switched on yet. Pay by bank transfer and tell us on WhatsApp.", "conflict");
  await withTenant(db, access.school.id, (tx) => tx.update(platformInvoices).set({ reference }).where(eq(platformInvoices.id, bill.id)));
  if (mode === "test") {
    await settleBill(db, { reference, amount: bill.totalKobo, currency: "NGN", channel: "test card" });
    await withTenant(db, access.school.id, (tx) => recordAudit(tx, access.school.id, actor(access, ip), { action: "billing.paid", summary: `Paid ${bill.number} (${formatNaira(bill.totalKobo)}, test mode)` }));
    return { url: `${baseUrl}/s/${access.school.slug}/settings?tab=plan&paid=${bill.number}` };
  }
  const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: access.user.email ?? access.school.email ?? "billing@adalintech.com",
      amount: bill.totalKobo,
      currency: "NGN",
      reference,
      callback_url: `${baseUrl}/api/billing/callback?school=${encodeURIComponent(access.school.slug)}`,
      metadata: { kind: "billing", school_id: access.school.id, bill: bill.number },
    },
  });
  return { url: data.authorization_url };
}

/** Marks a bill paid from Paystack's (or the test) result. Idempotent; lifts read-only when nothing else is overdue. */
export async function settleBill(db: DB, data: { reference: string; amount: number; currency: string; channel?: string; paid_at?: string }) {
  if (!/^sosb_[0-9a-f]{24}$/.test(data.reference) || data.currency !== "NGN") return false;
  const [bill] = await db.select().from(platformInvoices).where(eq(platformInvoices.reference, data.reference));
  if (!bill || data.amount !== bill.totalKobo) return false;
  if (bill.status === "open") {
    await db
      .update(platformInvoices)
      .set({ status: "paid", paidAt: data.paid_at ? new Date(data.paid_at) : new Date(), paidVia: data.channel ?? "card" })
      .where(eq(platformInvoices.id, bill.id));
  }
  await activateAddonsForBill(db, bill.schoolId, bill.id);
  await liftReadOnlyIfClear(db, bill.schoolId);
  return true;
}

export async function verifyBillPayment(db: DB, reference: string) {
  if (!/^sosb_[0-9a-f]{24}$/.test(reference) || paystackMode() !== "live") return false;
  const data = await paystack<{ status: string; reference: string; amount: number; currency: string; channel: string; paid_at: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (data.status !== "success") return false;
  return settleBill(db, data);
}

export async function liftReadOnlyIfClear(db: DB, schoolId: string) {
  const today = lagosToday();
  const [{ n }] = await db
    .select({ n: count() })
    .from(platformInvoices)
    .where(and(eq(platformInvoices.schoolId, schoolId), eq(platformInvoices.status, "open"), sql`${platformInvoices.dueOn} < ${addDays(today, -GRACE_DAYS)}`));
  if (n === 0) await db.update(schools).set({ status: "active", readOnlySince: null }).where(and(eq(schools.id, schoolId), eq(schools.status, "read_only")));
}

// ---------- The daily run ----------

/**
 * The billing day: trials ending, term bills, reminders, and read-only for bills more than a
 * week overdue. Called by the cron route; safe to run more than once a day.
 */
export async function runBilling(db: DB, now = new Date()) {
  const today = lagosToday(now);
  const report = { trialsEnded: 0, trialWarnings: 0, billsIssued: 0, reminders: 0, readOnly: 0 };
  const all = await db.select().from(schools).where(ne(schools.status, "suspended"));
  for (const school of all) {
    if (school.trialEndsAt && school.trialEndsAt <= now) {
      const back = school.trialReturnPlanKey ?? "free";
      await db.update(schools).set({ planKey: back, trialEndsAt: null, trialReturnPlanKey: null }).where(eq(schools.id, school.id));
      const plan = await planRow(db, back);
      await tellOwners(db, school, {
        title: "Your free trial has ended",
        body: `You're back on ${plan.name}. Choose a plan any time to get the features back.`,
        ref: `trial-ended:${school.id}`,
        email: `Your free trial of Adalin SchoolHub has ended and ${school.name} is back on the ${plan.name} plan. Nothing has been deleted. Choose a plan under Settings, Plan & billing, to get the features back.`,
      });
      report.trialsEnded++;
      continue;
    }
    if (school.trialEndsAt && school.trialEndsAt.getTime() - now.getTime() <= 3 * 86_400_000) {
      await tellOwners(db, school, {
        title: "Your free trial ends in 3 days",
        body: "Choose a plan to keep the features you've been using.",
        ref: `trial-ending:${school.id}`,
        email: `Your free trial of Adalin SchoolHub for ${school.name} ends in 3 days. Choose a plan under Settings, Plan & billing, to keep the features you've been using.`,
      });
      report.trialWarnings++;
    }
    const bill = await ensureTermBill(db, school.id);
    if (bill) {
      report.billsIssued++;
      await tellOwners(db, school, {
        title: `Adalin SchoolHub bill for ${bill.period}`,
        body: `${formatNaira(bill.totalKobo)} for ${pupils(bill.studentCount)}, due ${bill.dueOn}.`,
        ref: `bill:${bill.id}`,
        email: `Your Adalin SchoolHub bill ${bill.number} for ${bill.period} is ready: ${formatNaira(bill.totalKobo)} for ${pupils(bill.studentCount)} on roll. It's due by ${bill.dueOn}. Pay it under Settings, Plan & billing.`,
      });
    }
    const open = await db.select().from(platformInvoices).where(and(eq(platformInvoices.schoolId, school.id), eq(platformInvoices.status, "open")));
    for (const b of open) {
      const late = dayDiff(b.dueOn, today);
      // Reminders a week before, on the due date, and three days late; at most one a day.
      const remind = [-7, 0, 3].includes(late) && b.lastReminderOn !== today;
      if (remind) {
        await tellOwners(db, school, {
          title: late < 0 ? `Adalin SchoolHub bill due in 7 days` : late === 0 ? "Adalin SchoolHub bill due today" : "Adalin SchoolHub bill overdue",
          body: `${b.number}: ${formatNaira(b.totalKobo)}.${late > 0 ? ` Pay within ${GRACE_DAYS - late} days to avoid read-only mode.` : ""}`,
          ref: `bill-reminder:${b.id}:${late}`,
          email: `A reminder about Adalin SchoolHub bill ${b.number} for ${b.period}: ${formatNaira(b.totalKobo)}, due ${b.dueOn}.${late > 0 ? ` It's overdue. If it isn't paid within ${GRACE_DAYS - late} days, ${school.name} will become read-only until it is: everyone can still view everything, but changes are paused.` : ""}`,
        });
        await db.update(platformInvoices).set({ remindersSent: b.remindersSent + 1, lastReminderOn: today }).where(eq(platformInvoices.id, b.id));
        report.reminders++;
      }
      if (late > GRACE_DAYS && school.status === "active") {
        await db.update(schools).set({ status: "read_only", readOnlySince: now }).where(eq(schools.id, school.id));
        school.status = "read_only";
        await tellOwners(db, school, {
          title: "Your school is now read-only",
          body: `Bill ${b.number} is more than ${GRACE_DAYS} days overdue. Pay it to carry on as normal.`,
          ref: `read-only:${b.id}`,
          email: `Adalin SchoolHub bill ${b.number} for ${b.period} is more than ${GRACE_DAYS} days overdue, so ${school.name} is now read-only. Staff can still view everything and parents can still pay fees, but changes are paused until the bill is paid. Nothing has been deleted.`,
        });
        report.readOnly++;
      }
    }
  }
  return report;
}

/** Adalin's own view of who has paid, for the admin console. */
export async function revenueSummary(db: DB) {
  const rows = await db
    .select({ status: platformInvoices.status, total: sql<number>`coalesce(sum(${platformInvoices.totalKobo}), 0)`.mapWith(Number), n: count() })
    .from(platformInvoices)
    .groupBy(platformInvoices.status);
  const paidSchools = await db.selectDistinct({ id: platformInvoices.schoolId }).from(platformInvoices).where(and(eq(platformInvoices.status, "paid"), isNotNull(platformInvoices.paidAt)));
  return { byStatus: rows, payingSchools: paidSchools.length, schools: (await db.select({ n: count() }).from(schools).where(inArray(schools.status, ["active", "read_only"])))[0].n };
}
