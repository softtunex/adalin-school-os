import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { computeClassResults, WAEC_BANDS } from "./compute";
import { ReportCards, type ReportCardData } from "./report-card";

const components = [
  { id: "a", name: "1st CA", maxScore: 20 },
  { id: "b", name: "2nd CA", maxScore: 20 },
  { id: "c", name: "Exam", maxScore: 60 },
];
const subjects = ["Mathematics", "English Studies", "Basic Science", "Basic Technology", "Social Studies", "Civic Education", "Christian Religious Studies", "Agricultural Science", "Home Economics", "Business Studies", "Computer Studies", "French", "Yoruba"].map((name, i) => ({ id: `s${i}`, name }));

describe("report card PDF", () => {
  it("renders one A4 page per student", async () => {
    const scores = ["ada", "bayo"].flatMap((st, k) => subjects.flatMap((sub, i) => components.map((c) => ({ studentId: st, subjectId: sub.id, componentId: c.id, score: Math.min(c.maxScore, Math.round(c.maxScore * (0.45 + ((i * 7 + k * 13) % 50) / 100))) }))));
    const results = computeClassResults({ studentIds: ["ada", "bayo"], subjectIds: subjects.map((s) => s.id), components, bands: WAEC_BANDS, scores });
    const data: ReportCardData = {
      school: { name: "Adalin College", motto: "Knowledge, Character, Excellence", address: "14 Admiralty Way, Lekki, Lagos", phone: "+2348031234567", email: "info@adalincollege.ng", logo: null, initials: "AC" },
      term: { name: "First Term", session: "2026/2027" },
      className: "JSS 1 Gold",
      classSize: 2,
      attendanceDays: 58,
      nextTermBegins: "2027-01-06",
      components,
      subjects,
      bands: WAEC_BANDS,
      watermark: true,
      students: [
        { name: "Adaeze Chioma Okafor", admissionNo: "ADC/2026/0001", gender: "female", age: 12, result: results.get("ada")!, attendance: { present: 54, absent: 2, late: 2, excused: 0 }, report: { classTeacherComment: "Focused and kind. Keep reading every day.", principalComment: "An excellent result.", ratings: { Punctuality: 5, Neatness: 4 } } },
        { name: "Bayo Ade", admissionNo: "ADC/2026/0002", gender: "male", age: 13, result: results.get("bayo")!, attendance: { present: 50, absent: 6, late: 2, excused: 0 }, report: null },
      ],
    };
    const pdf = await renderToBuffer(createElement(ReportCards, { data }) as Parameters<typeof renderToBuffer>[0]);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const pages = pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length;
    expect(pages).toBe(2);
    if (process.env.WRITE_PDF) (await import("node:fs")).writeFileSync(".data/report-check.pdf", pdf);
  }, 60_000);
});
