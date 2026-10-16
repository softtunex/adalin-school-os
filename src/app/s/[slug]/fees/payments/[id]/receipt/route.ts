import { renderToBuffer } from "@react-pdf/renderer";
import { notFound } from "next/navigation";
import { createElement } from "react";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { ReceiptPdf } from "@/lib/fees/documents";
import { pdfDate, pdfResponse, schoolHeader } from "@/lib/fees/school-header";
import { getReceipt, METHOD_LABEL } from "@/lib/services/payments";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const access = await requireAccess(slug);
  let data;
  try {
    data = await getReceipt(getDb(), access, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const { payment, invoice, student, term } = data;
  const pdf = await renderToBuffer(
    createElement(ReceiptPdf, {
      doc: {
        school: await schoolHeader(access.school),
        receiptNo: payment.receiptNo,
        paidOn: pdfDate(payment.paidOn),
        amountKobo: payment.amountKobo,
        method: METHOD_LABEL[payment.method],
        reference: payment.reference,
        payerName: payment.payerName,
        receivedBy: data.recordedByName,
        status: payment.status,
        student: { name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "), admissionNo: student.admissionNo, className: data.className },
        invoice: { number: invoice.number, title: invoice.title, term: term.label, totalKobo: invoice.chargesKobo - invoice.discountKobo, balanceKobo: data.balance },
      },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  return pdfResponse(pdf, `${payment.receiptNo}-${student.lastName}`);
}
