import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { listPayments, METHOD_LABEL } from "@/lib/services/payments";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const sp = new URL(request.url).searchParams;
  const get = (k: string) => sp.get(k) ?? undefined;
  const list = await listPayments(getDb(), access, { from: get("from"), to: get("to"), method: get("method"), q: get("q"), status: get("status"), limit: 50_000 });
  const csv = toCsv(
    ["Date", "Receipt", "Invoice", "Admission no", "Student", "Class", "Method", "Reference", "Paid by", "Amount (NGN)", "Status", "Recorded by", "Reversal reason"],
    list.rows.map((r) => [
      r.payment.paidOn,
      r.payment.receiptNo,
      r.invoiceNumber,
      r.student.admissionNo,
      `${r.student.firstName} ${r.student.lastName}`,
      r.className,
      METHOD_LABEL[r.payment.method],
      r.payment.reference,
      r.payment.payerName,
      (r.payment.amountKobo / 100).toFixed(2),
      r.payment.status,
      r.recordedByName ?? (r.payment.method === "paystack" ? "Online" : ""),
      r.payment.reversalReason,
    ]),
  );
  return csvResponse(`${slug}-payments.csv`, csv);
}
