import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { CertificatesPdf, IdCardsPdf, LettersPdf, TestimonialPdf, TranscriptPdf, type Verify } from "./pdf";

const school = { accent: "#1B2A5C", name: "Adalin College", address: "12 Admiralty Way, Lekki, Lagos", phone: "0803 000 0000", email: "info@adalin.test", logo: null, initials: "AC" };
const signs = [
  { name: "Dr Adebayo Ogunleye", title: "Principal" },
  { name: "Olatunji Buari", title: "Proprietor" },
];

async function verify(serial: string): Promise<Verify> {
  const url = `http://localhost:3005/verify/adalin-college/${serial}`;
  return { url, serial, qr: await QRCode.toDataURL(url, { margin: 0, width: 240 }) };
}

const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-";

describe("document PDFs", () => {
  it("draws every kind", async () => {
    const v = await verify("GC-ID-2026-00001");
    const cards = Array.from({ length: 9 }, (_, i) => ({ holderName: `Student ${i + 1}`, photo: null, initials: "S", lines: [["Adm. no", `ADC/2026/000${i}`], ["Class", "JSS 1 Gold"]] as [string, string][], kind: "Student", emergency: "Mrs Okafor, 0803 111 2222", verify: v }));
    const pdfs = await Promise.all([
      renderToBuffer(<IdCardsPdf school={school} session="2026/2027" note="Return to the school if found." cards={cards} sign={signs[0]} />),
      renderToBuffer(
        <TestimonialPdf
          d={{ school, name: "Ada Okafor", admissionNo: "ADC/2020/0001", gender: "female", dateOfBirth: "4 March 2009", yearsFrom: "2020", yearsTo: "2026", lastClass: "SS 3 Gold", conduct: "Excellent", offices: "Head girl", activities: "Debate club", remark: "A kind and hard-working student.", date: "17 October 2026", signs, verify: v }}
        />,
      ),
      renderToBuffer(<CertificatesPdf school={school} date="17 October 2026" signs={signs} docs={[{ name: "Ada Okafor", heading: "Certificate of Excellence", body: "For outstanding performance.", verify: v }]} />),
      renderToBuffer(<LettersPdf school={school} date="17 October 2026" sign={signs[0]} docs={[{ to: "Mrs Okafor", heading: "Resumption", body: "Dear Mrs Okafor,\n\nSchool resumes on Monday.", verify: v }]} />),
      renderToBuffer(
        <TranscriptPdf
          d={{ school, name: "Ada Okafor", admissionNo: "ADC/2020/0001", className: "SS 3 Gold", date: "17 October 2026", signs, verify: v, blocks: [{ term: "First term, 2026/2027", className: "JSS 1 Gold", subjects: [{ name: "Mathematics", total: 78, grade: "A1" }], average: 78, position: 2, classSize: 30 }] }}
        />,
      ),
    ]);
    for (const p of pdfs) expect(isPdf(p)).toBe(true);
  }, 30_000);
});
