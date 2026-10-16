import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { listDebtors } from "@/lib/services/invoices";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["fees:view"]);
  const sp = new URL(request.url).searchParams;
  const list = await listDebtors(getDb(), access, { termId: sp.get("term"), q: sp.get("q") ?? undefined, classId: sp.get("class") ?? undefined, overdue: sp.get("when") === "overdue", limit: 20_000 });
  const csv = toCsv(
    ["Admission no", "Student", "Class", "Invoice", "Due", "Paid (NGN)", "Owing (NGN)", "Overdue", "Parent", "Parent phone", "Parent email", "Last reminded"],
    list.rows.map((r) => [
      r.student.admissionNo,
      `${r.student.firstName} ${r.student.lastName}`,
      r.className,
      r.invoice.number,
      r.invoice.dueOn,
      (r.invoice.paidKobo / 100).toFixed(2),
      (r.balance / 100).toFixed(2),
      r.overdue ? "yes" : "no",
      r.contact?.name,
      r.contact?.phone,
      r.contact?.email,
      r.invoice.lastRemindedAt?.toISOString().slice(0, 10),
    ]),
  );
  return csvResponse(`${slug}-debtors-${list.term.label}.csv`, csv);
}
