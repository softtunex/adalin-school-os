import { describe, expect, it } from "vitest";
import { annualTax, computePay } from "./tax";

const N = (naira: number) => Math.round(naira * 100);

describe("PAYE bands (Nigeria Tax Act 2025)", () => {
  it("leaves the first ₦800,000 a year untaxed", () => {
    expect(annualTax(N(800_000))).toBe(0);
  });
  it("taxes each band at its own rate", () => {
    // 2.2m at 15% = 330,000; next 1m at 18% = 180,000.
    expect(annualTax(N(4_000_000))).toBe(N(510_000));
    // Up to 50m: 330k + 1.62m + 2.73m + 5.75m = 10.43m; next 10m at 25% = 2.5m.
    expect(annualTax(N(60_000_000))).toBe(N(12_930_000));
  });
});

describe("a payslip", () => {
  const teacher = {
    basic: N(120_000),
    allowances: [
      { name: "Housing", kobo: N(40_000) },
      { name: "Transport", kobo: N(20_000) },
      { name: "Responsibility", kobo: N(10_000) },
    ],
    extras: [],
    deductions: [{ name: "Co-operative", kobo: N(5_000) }],
    pension: true,
    nhf: true,
    paye: true,
    annualRent: N(600_000),
  };

  it("works out pension on basic, housing and transport only", () => {
    const p = computePay(teacher);
    expect(p.gross).toBe(N(190_000));
    expect(p.pension).toBe(N(14_400)); // 8% of 180,000
    expect(p.employerPension).toBe(N(18_000));
    expect(p.nhf).toBe(N(3_000)); // 2.5% of basic
  });

  it("applies PAYE after pension, NHF and rent relief", () => {
    const p = computePay(teacher);
    // Year: 2,280,000 gross − 172,800 pension − 36,000 NHF − 120,000 rent relief = 1,951,200 taxable.
    // Tax: (1,951,200 − 800,000) × 15% = 172,680 a year → 14,390 a month.
    expect(p.paye).toBe(N(14_390));
    expect(p.net).toBe(N(190_000 - 14_400 - 3_000 - 14_390 - 5_000));
  });

  it("taxes a bonus at the person's top rate", () => {
    const withBonus = computePay({ ...teacher, extras: [{ name: "Exam bonus", kobo: N(50_000) }] });
    expect(withBonus.paye - computePay(teacher).paye).toBe(N(7_500)); // 15% of 50,000
  });

  it("skips what's switched off", () => {
    const p = computePay({ ...teacher, pension: false, nhf: false, paye: false, deductions: [] });
    expect(p.net).toBe(p.gross);
  });
});
