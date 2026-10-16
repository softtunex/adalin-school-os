import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { pdfResponse } from "@/lib/fees/school-header";
import { renderPayslip } from "@/lib/payroll/payslip-pdf";
import { getPayslip } from "@/lib/services/payroll";

/** A payslip PDF, for the staff member it belongs to or the payroll team. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await requireAccess(slug);
  const row = await getPayslip(getDb(), access, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { pdf, filename } = await renderPayslip(access.school, row.run, row.slip);
  return pdfResponse(pdf, filename);
}
