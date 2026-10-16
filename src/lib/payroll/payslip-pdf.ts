import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import type { payrollRuns, payslips, schools } from "../db/schema";
import { PayslipPdf } from "../fees/documents";
import { schoolHeader } from "../fees/school-header";
import { monthLabel } from "../services/payroll";

/** The payslip PDF. Callers check the reader may see it first. */
export async function renderPayslip(school: typeof schools.$inferSelect, run: typeof payrollRuns.$inferSelect, slip: typeof payslips.$inferSelect) {
  const deductions = [
    ...(slip.payeKobo ? [{ name: "PAYE tax", kobo: slip.payeKobo }] : []),
    ...(slip.pensionKobo ? [{ name: "Pension (8%)", kobo: slip.pensionKobo }] : []),
    ...(slip.nhfKobo ? [{ name: "National Housing Fund", kobo: slip.nhfKobo }] : []),
    ...slip.deductions,
  ];
  const pdf = await renderToBuffer(
    createElement(PayslipPdf, {
      doc: {
        school: await schoolHeader(school),
        month: monthLabel(run.month),
        name: slip.name,
        jobTitle: slip.jobTitle,
        bank: slip.accountNumber ? `${slip.accountName ?? slip.name} · ${slip.bankName ?? "Bank"} · ${slip.accountNumber}` : null,
        earnings: [{ name: "Basic salary", kobo: slip.basicKobo }, ...slip.allowances, ...slip.extras],
        deductions,
        gross: slip.grossKobo,
        net: slip.netKobo,
        employerPension: slip.employerPensionKobo,
      },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  return { pdf, filename: `Payslip-${run.month}-${slip.name}` };
}
