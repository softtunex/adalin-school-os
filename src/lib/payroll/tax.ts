import type { PayLine } from "../db/schema";

/*
 * Nigerian payroll arithmetic, all in kobo. PAYE follows the Nigeria Tax Act 2025 bands in force
 * from January 2026; pension follows the Pension Reform Act 2014 (8% employee, 10% employer on
 * basic + housing + transport); NHF is 2.5% of basic. Pure functions, so they're easy to check.
 */

/** Annual bands: [upper limit of the band in kobo, rate]. The last band has no limit. */
export const PAYE_BANDS: [number, number][] = [
  [800_000_00, 0],
  [3_000_000_00, 0.15],
  [12_000_000_00, 0.18],
  [25_000_000_00, 0.21],
  [50_000_000_00, 0.23],
  [Number.POSITIVE_INFINITY, 0.25],
];

export const PENSION_EMPLOYEE = 0.08;
export const PENSION_EMPLOYER = 0.1;
export const NHF_RATE = 0.025;
export const RENT_RELIEF_RATE = 0.2;
export const RENT_RELIEF_CAP = 500_000_00;

/** Tax on a year's taxable income. */
export function annualTax(taxable: number) {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of PAYE_BANDS) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax);
}

const sum = (lines: PayLine[]) => lines.reduce((t, l) => t + l.kobo, 0);

/** Allowances that count towards the pension base. */
function pensionable(allowances: PayLine[]) {
  return sum(allowances.filter((a) => /housing|rent|transport/i.test(a.name)));
}

export type PayInput = {
  basic: number;
  allowances: PayLine[];
  /** One-off earnings this month. */
  extras: PayLine[];
  deductions: PayLine[];
  pension: boolean;
  nhf: boolean;
  paye: boolean;
  annualRent: number;
};

export function computePay(p: PayInput) {
  const regular = p.basic + sum(p.allowances);
  const oneOff = sum(p.extras);
  const gross = regular + oneOff;
  const pensionBase = p.basic + pensionable(p.allowances);
  const pension = p.pension ? Math.round(pensionBase * PENSION_EMPLOYEE) : 0;
  const employerPension = p.pension ? Math.round(pensionBase * PENSION_EMPLOYER) : 0;
  const nhf = p.nhf ? Math.round(p.basic * NHF_RATE) : 0;
  let paye = 0;
  if (p.paye) {
    const relief = Math.min(Math.round(p.annualRent * RENT_RELIEF_RATE), RENT_RELIEF_CAP);
    const taxableYear = Math.max(0, regular * 12 - (pension + nhf) * 12 - relief);
    const monthly = annualTax(taxableYear) / 12;
    // A one-off payment is taxed at the top of this person's band, not spread over the year.
    const bonusTax = oneOff ? annualTax(taxableYear + oneOff) - annualTax(taxableYear) : 0;
    paye = Math.round(monthly + bonusTax);
  }
  const other = sum(p.deductions);
  const net = gross - pension - nhf - paye - other;
  return { gross, pension, employerPension, nhf, paye, other, net };
}
