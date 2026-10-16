import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { asc, desc, eq } from "drizzle-orm";
import { createElement } from "react";
import type { DB } from "../db/client";
import { classes, guardians, invoiceLines, invoices, plans, schools, studentGuardians, students } from "../db/schema";
import { withTenant } from "../db/tenant";
import { hasFeature, type PlanRow } from "../plans/entitlements";
import { pickTerm } from "../services/fees";
import { paystackMode } from "../services/paystack";
import { InvoicePdf } from "./documents";
import { pdfDate, schoolHeader } from "./school-header";

/**
 * The invoice PDF. One builder for every copy: the bursar's download, the parent app and
 * the pay link, so they always match. Callers check who may see the invoice first.
 */
export async function renderInvoicePdf(db: DB, schoolId: string, invoiceId: string, baseUrl: string) {
  const [row] = await db.select({ school: schools, plan: plans }).from(schools).innerJoin(plans, eq(plans.key, schools.planKey)).where(eq(schools.id, schoolId));
  const data = await withTenant(db, schoolId, async (tx) => {
    const [inv] = await tx
      .select({ invoice: invoices, student: students, className: classes.name })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .leftJoin(classes, eq(classes.id, invoices.classId))
      .where(eq(invoices.id, invoiceId));
    if (!inv) return null;
    const { term } = await pickTerm(tx, inv.invoice.termId);
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.sort), asc(invoiceLines.description));
    const [parent] = await tx
      .select({ name: guardians.name })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(eq(studentGuardians.studentId, inv.student.id))
      .orderBy(desc(studentGuardians.isPrimary))
      .limit(1);
    return { ...inv, term, lines, parent: parent?.name ?? null };
  });
  if (!row || !data) return null;
  const { school, plan } = row;
  const { invoice, student } = data;
  const online = hasFeature(plan as PlanRow, "fees_online") && !!school.paystackSubaccount && paystackMode() !== "off";
  const pdf = await renderToBuffer(
    createElement(InvoicePdf, {
      doc: {
        school: await schoolHeader(school),
        number: invoice.number,
        title: invoice.title,
        term: data.term.label,
        issuedOn: pdfDate(invoice.createdAt),
        dueOn: invoice.dueOn ? pdfDate(invoice.dueOn) : null,
        status: invoice.status,
        student: { name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "), admissionNo: student.admissionNo, className: data.className },
        parent: data.parent,
        lines: data.lines.map((l) => ({ kind: l.kind, description: l.description, amountKobo: l.amountKobo })),
        chargesKobo: invoice.chargesKobo,
        discountKobo: invoice.discountKobo,
        paidKobo: invoice.paidKobo,
        bank: school.feeSettings.bank ?? null,
        payUrl: online ? `${baseUrl}/pay/${invoice.payToken}` : null,
        note: school.feeSettings.invoiceNote ?? null,
      },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  return { pdf, filename: `${invoice.number}-${student.lastName}-${student.firstName}` };
}
