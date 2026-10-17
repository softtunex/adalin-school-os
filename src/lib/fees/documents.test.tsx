import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { amountInWords, InvoicePdf, ngn, ReceiptPdf } from "./documents";

const school = { name: "Adalin College", address: "14 Admiralty Way, Lekki, Lagos", phone: "+2348031234567", email: "info@adalincollege.ng", logo: null, initials: "AC" };

describe("fee documents", () => {
  it("writes amounts the way Nigerian receipts do", () => {
    expect(ngn(15_000_000)).toBe("NGN 150,000.00");
    expect(amountInWords(15_000_000)).toBe("One hundred and fifty thousand naira only");
    expect(amountInWords(26_550_050)).toBe("Two hundred and sixty-five thousand, five hundred naira, fifty kobo only");
    expect(amountInWords(100_000_000)).toBe("One million naira only");
    expect(amountInWords(1_250_000_000)).toBe("Twelve million, five hundred thousand naira only");
    expect(amountInWords(10_500)).toBe("One hundred and five naira only");
  });

  it("renders an invoice and a receipt", async () => {
    const invoice = await renderToBuffer(
      createElement(InvoicePdf, {
        doc: {
          school,
          number: "INV-00001",
          title: "First Term fees",
          term: "First Term · 2026/2027",
          issuedOn: "1 October 2026",
          dueOn: "15 October 2026",
          status: "partial",
          student: { name: "Adaeze Okafor", admissionNo: "ADC/2026/0001", className: "JSS 1 Gold" },
          parent: "Mrs Ngozi Okafor",
          lines: [
            { kind: "charge", description: "Tuition", amountKobo: 18_500_000 },
            { kind: "charge", description: "Development levy", amountKobo: 2_500_000 },
            { kind: "discount", description: "Sibling discount", amountKobo: 1_850_000 },
          ],
          chargesKobo: 21_000_000,
          discountKobo: 1_850_000,
          paidKobo: 10_000_000,
          bank: { name: "GTBank", accountNumber: "0123456789", accountName: "Adalin College Ltd" },
          payUrl: "https://app.test/pay/abc",
          note: "Fees are not refundable.",
        },
      }) as Parameters<typeof renderToBuffer>[0],
    );
    expect(invoice.subarray(0, 4).toString()).toBe("%PDF");
    const receipt = await renderToBuffer(
      createElement(ReceiptPdf, {
        doc: {
          school,
          receiptNo: "RCT-00001",
          paidOn: "2 October 2026",
          amountKobo: 10_000_000,
          method: "Bank transfer",
          reference: "GTB-123",
          payerName: "Mrs Okafor",
          receivedBy: "Mr Ibrahim Musa",
          status: "succeeded",
          student: { name: "Adaeze Okafor", admissionNo: "ADC/2026/0001", className: "JSS 1 Gold" },
          invoice: { number: "INV-00001", title: "First Term fees", term: "First Term · 2026/2027", totalKobo: 19_150_000, balanceKobo: 9_150_000 },
        },
      }) as Parameters<typeof renderToBuffer>[0],
    );
    expect(receipt.subarray(0, 4).toString()).toBe("%PDF");
  });
});
