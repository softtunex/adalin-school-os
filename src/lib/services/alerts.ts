import { and, eq } from "drizzle-orm";
import type { Tx } from "../db/client";
import { students } from "../db/schema";
import { lagosToday } from "./attendance";
import { notifyGuardians, schoolComms } from "./notify";

/*
 * The automatic messages parents get. Each one is on by default and can be switched off
 * per school in Settings → Messaging. SMS copies go out only when the school has turned
 * on SMS alerts (they cost credits); in-app and email copies are free.
 */

const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");
const ngn = (kobo: number) => `NGN ${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

function prettyDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Parents of students marked absent today hear about it straight away. */
export async function absenceAlerts(tx: Tx, schoolId: string, absentIds: string[], date: string) {
  if (!absentIds.length || date !== lagosToday()) return null;
  const school = await schoolComms(tx, schoolId);
  if (school.comms.absenceAlerts === false) return null;
  return notifyGuardians(
    tx,
    school,
    absentIds,
    (c) => ({
      kind: "absence",
      title: `${c.studentFirstName} was marked absent today`,
      body: `${c.studentName} wasn't in school on ${prettyDate(date)}. If this is unexpected, please contact the school.`,
      link: `/p/children/${c.studentId}`,
      ref: `absence:${c.studentId}:${date}`,
      sms: `${school.name}: ${c.studentFirstName} was marked absent today. If this is unexpected, please contact the school.`,
      email: {
        subject: `${c.studentFirstName} was marked absent today`,
        text: `Dear ${c.name},\n\n${c.studentName} was marked absent on ${prettyDate(date)}. If this is unexpected, please contact the school.\n\n${school.name}`,
      },
    }),
    { email: true, sms: !!school.comms.smsAlerts },
  );
}

/** When a class's results are published, every parent in the class is told. */
export async function resultAlerts(tx: Tx, schoolId: string, classId: string, term: { id: string; name: string; session: string }) {
  const school = await schoolComms(tx, schoolId);
  if (school.comms.resultAlerts === false) return null;
  const roll = await tx.select({ id: students.id }).from(students).where(and(eq(students.classId, classId), eq(students.status, "active")));
  const link = appUrl() ? ` See them at ${appUrl()}/p` : "";
  return notifyGuardians(
    tx,
    school,
    roll.map((r) => r.id),
    (c) => ({
      kind: "result",
      title: `${c.studentFirstName}'s ${term.name} results are out`,
      body: `${c.studentName}'s report card for ${term.name}, ${term.session} is ready to view.`,
      link: `/p/children/${c.studentId}?tab=results`,
      ref: `result:${c.studentId}:${term.id}`,
      sms: `${school.name}: ${c.studentFirstName}'s ${term.name} results are ready.${link}`,
      email: {
        subject: `${c.studentFirstName}'s ${term.name} results are ready`,
        text: `Dear ${c.name},\n\n${c.studentName}'s report card for ${term.name}, ${term.session} has been published.${appUrl() ? `\n\nView it in the parent app: ${appUrl()}/p` : ""}\n\n${school.name}`,
      },
    }),
    { email: true, sms: !!school.comms.smsAlerts },
  );
}

/** A receipt for every payment, manual or online. */
export async function paymentAlert(
  tx: Tx,
  schoolId: string,
  p: { studentId: string; receiptNo: string; amountKobo: number; balanceKobo: number; invoiceNumber: string; paidOn: string },
  opts: { email: boolean } = { email: true },
) {
  const school = await schoolComms(tx, schoolId);
  if (school.comms.paymentAlerts === false && !opts.email) return null;
  const balance = p.balanceKobo > 0 ? `Balance: ${ngn(p.balanceKobo)}.` : "Fully paid, thank you.";
  return notifyGuardians(
    tx,
    school,
    [p.studentId],
    (c) => ({
      kind: "payment",
      title: `${ngn(p.amountKobo)} received for ${c.studentFirstName}`,
      body: `Receipt ${p.receiptNo} for invoice ${p.invoiceNumber}. ${balance}`,
      link: `/p/children/${c.studentId}?tab=fees`,
      ref: `payment:${p.receiptNo}`,
      sms: `${school.name}: received ${ngn(p.amountKobo)} for ${c.studentFirstName}'s fees. Receipt ${p.receiptNo}. ${balance}`,
      email: {
        subject: `Receipt ${p.receiptNo}: ${ngn(p.amountKobo)} for ${c.studentName}`,
        text: `Dear ${c.name},\n\nWe have received ${ngn(p.amountKobo)} towards ${c.studentName}'s fees (invoice ${p.invoiceNumber}) on ${p.paidOn}.\nReceipt number: ${p.receiptNo}\n${balance}\n\n${school.name}`,
      },
    }),
    { email: opts.email, sms: school.comms.paymentAlerts !== false && !!school.comms.smsAlerts },
  );
}
