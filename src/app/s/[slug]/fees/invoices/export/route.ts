import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { listInvoices } from "@/lib/services/invoices";

const naira = (kobo: number) => (kobo / 100).toFixed(2);

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const sp = new URL(request.url).searchParams;
  const list = await listInvoices(getDb(), access, { termId: sp.get("term"), q: sp.get("q") ?? undefined, classId: sp.get("class") ?? undefined, status: sp.get("status") ?? undefined, limit: 20_000 });
  const csv = toCsv(
    ["Invoice", "Title", "Term", "Admission no", "Student", "Class", "Due", "Charges (NGN)", "Discounts (NGN)", "Total (NGN)", "Paid (NGN)", "Balance (NGN)", "Status"],
    list.rows.map((r) => [
      r.invoice.number,
      r.invoice.title,
      list.term.label,
      r.student.admissionNo,
      `${r.student.firstName} ${r.student.lastName}`,
      r.className,
      r.invoice.dueOn,
      naira(r.invoice.chargesKobo),
      naira(r.invoice.discountKobo),
      naira(r.invoice.chargesKobo - r.invoice.discountKobo),
      naira(r.invoice.paidKobo),
      naira(Math.max(0, r.balance)),
      r.overdue ? "overdue" : r.invoice.status,
    ]),
  );
  return csvResponse(`${slug}-invoices.csv`, csv);
}
