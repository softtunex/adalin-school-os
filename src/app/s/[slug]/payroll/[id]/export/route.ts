import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { getRun } from "@/lib/services/payroll";

const naira = (kobo: number) => (kobo / 100).toFixed(2);

/** The bank schedule (who to pay, where) or the remittance summary (PAYE, pension, NHF). */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const access = await requirePageAccess(slug, ["expenses:payroll"]);
  const kind = new URL(request.url).searchParams.get("kind") === "remit" ? "remit" : "bank";
  const { run, slips } = await getRun(getDb(), access, id);
  if (kind === "bank") {
    const csv = toCsv(
      ["Name", "Account name", "Bank", "Account number", "Amount (NGN)", "Narration"],
      slips.map((s) => [s.name, s.accountName, s.bankName, s.accountNumber, naira(s.netKobo), `Salary ${run.month}`]),
    );
    return csvResponse(`${slug}-bank-schedule-${run.month}.csv`, csv);
  }
  const csv = toCsv(
    ["Name", "Gross (NGN)", "PAYE (NGN)", "Pension, employee (NGN)", "Pension, employer (NGN)", "NHF (NGN)"],
    [
      ...slips.map((s) => [s.name, naira(s.grossKobo), naira(s.payeKobo), naira(s.pensionKobo), naira(s.employerPensionKobo), naira(s.nhfKobo)]),
      ["Total", naira(run.grossKobo), naira(run.payeKobo), naira(run.pensionKobo), naira(run.employerPensionKobo), naira(run.nhfKobo)],
    ],
  );
  return csvResponse(`${slug}-remittances-${run.month}.csv`, csv);
}
