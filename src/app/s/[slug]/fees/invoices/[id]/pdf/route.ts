import { renderToBuffer } from "@react-pdf/renderer";
import { notFound } from "next/navigation";
import { createElement } from "react";
import { appUrl, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { InvoicePdf } from "@/lib/fees/documents";
import { pdfDate, pdfResponse, schoolHeader } from "@/lib/fees/school-header";
import { hasFeature } from "@/lib/plans/entitlements";
import { getInvoice } from "@/lib/services/invoices";
import { paystackMode } from "@/lib/services/paystack";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const access = await requireAccess(slug);
  let data;
  try {
    data = await getInvoice(getDb(), access, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const { invoice, student, lines, contacts, term } = data;
  const online = hasFeature(access.plan, "fees_online") && !!access.school.paystackSubaccount && paystackMode() !== "off";
  const pdf = await renderToBuffer(
    createElement(InvoicePdf, {
      doc: {
        school: await schoolHeader(access.school),
        number: invoice.number,
        title: invoice.title,
        term: term.label,
        issuedOn: pdfDate(invoice.createdAt),
        dueOn: invoice.dueOn ? pdfDate(invoice.dueOn) : null,
        status: invoice.status,
        student: { name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "), admissionNo: student.admissionNo, className: data.className },
        parent: contacts[0]?.name ?? null,
        lines: lines.map((l) => ({ kind: l.kind, description: l.description, amountKobo: l.amountKobo })),
        chargesKobo: invoice.chargesKobo,
        discountKobo: invoice.discountKobo,
        paidKobo: invoice.paidKobo,
        bank: access.school.feeSettings.bank ?? null,
        payUrl: online ? `${await appUrl()}/pay/${invoice.payToken}` : null,
        note: access.school.feeSettings.invoiceNote ?? null,
      },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  return pdfResponse(pdf, `${invoice.number}-${student.lastName}-${student.firstName}`);
}
