import { describe, expect, it } from "vitest";
import { classSummary, computeClassResults, cumulativeAverage, gradeFor, ordinal, rank, WAEC_BANDS } from "./compute";

const components = [
  { id: "ca1", name: "1st CA", maxScore: 20 },
  { id: "ca2", name: "2nd CA", maxScore: 20 },
  { id: "exam", name: "Exam", maxScore: 60 },
];

function sheet(rows: [string, string, number, number, number][]) {
  return rows.flatMap(([studentId, subjectId, a, b, c]) => [
    { studentId, subjectId, componentId: "ca1", score: a },
    { studentId, subjectId, componentId: "ca2", score: b },
    { studentId, subjectId, componentId: "exam", score: c },
  ]);
}

describe("grading", () => {
  it("maps WAEC boundaries exactly", () => {
    expect(gradeFor(100, WAEC_BANDS)?.grade).toBe("A1");
    expect(gradeFor(75, WAEC_BANDS)?.grade).toBe("A1");
    expect(gradeFor(74.99, WAEC_BANDS)?.grade).toBe("B2");
    expect(gradeFor(50, WAEC_BANDS)?.grade).toBe("C6");
    expect(gradeFor(39.5, WAEC_BANDS)?.grade).toBe("F9");
    expect(gradeFor(0, WAEC_BANDS)?.remark).toBe("Fail");
  });

  it("ranks ties as 1, 2, 2, 4 and leaves the unscored unranked", () => {
    const items = [90, 85, 85, 70, null];
    const r = rank(items, (x) => x);
    expect(items.map((i) => r.get(i))).toEqual([1, 2, 2, 4, null]);
  });

  it("writes ordinals the way report cards do", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 112].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "112th"]);
  });
});

describe("class results", () => {
  // Hand-checked: Ada 85 + 69 = 154, average 77. Bayo 75 + 80 = 155, average 77.5. Chi 38 + 52 = 90, average 45.
  const scores = sheet([
    ["ada", "maths", 18, 17, 50],
    ["ada", "english", 15, 14, 40],
    ["bayo", "maths", 15, 15, 45],
    ["bayo", "english", 16, 16, 48],
    ["chi", "maths", 10, 8, 20],
    ["chi", "english", 12, 10, 30],
  ]);
  const results = computeClassResults({ studentIds: ["ada", "bayo", "chi", "dayo"], subjectIds: ["maths", "english"], components, bands: WAEC_BANDS, scores });

  it("totals, grades and averages each student", () => {
    const ada = results.get("ada")!;
    expect(ada.subjects.maths).toMatchObject({ total: 85, grade: "A1", remark: "Excellent" });
    expect(ada.subjects.english).toMatchObject({ total: 69, grade: "B3" });
    expect(ada.grandTotal).toBe(154);
    expect(ada.average).toBe(77);
    expect(results.get("bayo")!.average).toBe(77.5);
    expect(results.get("chi")!.subjects.maths).toMatchObject({ total: 38, grade: "F9" });
    expect(results.get("chi")!.failed).toBe(1);
  });

  it("positions students overall and per subject", () => {
    expect(results.get("bayo")!.position).toBe(1);
    expect(results.get("ada")!.position).toBe(2);
    expect(results.get("chi")!.position).toBe(3);
    expect(results.get("ada")!.subjects.maths.position).toBe(1);
    expect(results.get("bayo")!.subjects.english.position).toBe(1);
  });

  it("treats a student with no scores as unranked, not last", () => {
    const dayo = results.get("dayo")!;
    expect(dayo.average).toBeNull();
    expect(dayo.position).toBeNull();
    expect(dayo.subjectsTaken).toBe(0);
  });

  it("computes class statistics per subject", () => {
    const maths = results.get("ada")!.subjects.maths;
    expect(maths.classHighest).toBe(85);
    expect(maths.classLowest).toBe(38);
    expect(maths.classAverage).toBe(66);
    expect(classSummary(results)).toMatchObject({ students: 4, withResults: 3, highestAverage: 77.5 });
  });

  it("counts a subject with partial scores, missing components as zero", () => {
    const partial = computeClassResults({
      studentIds: ["x"],
      subjectIds: ["maths", "art"],
      components,
      bands: WAEC_BANDS,
      scores: [{ studentId: "x", subjectId: "maths", componentId: "ca1", score: 18 }],
    }).get("x")!;
    expect(partial.subjects.maths.total).toBe(18);
    expect(partial.subjects.art.total).toBeNull();
    expect(partial.subjectsTaken).toBe(1);
  });

  it("keeps decimal scores exact", () => {
    const r = computeClassResults({
      studentIds: ["x"],
      subjectIds: ["s"],
      components,
      bands: WAEC_BANDS,
      scores: [
        { studentId: "x", subjectId: "s", componentId: "ca1", score: 12.5 },
        { studentId: "x", subjectId: "s", componentId: "ca2", score: 13.25 },
        { studentId: "x", subjectId: "s", componentId: "exam", score: 49.25 },
      ],
    }).get("x")!;
    expect(r.subjects.s.total).toBe(75);
    expect(r.subjects.s.grade).toBe("A1");
  });

  it("averages terms for the annual result, ignoring missing terms", () => {
    expect(cumulativeAverage([70, 80, null])).toBe(75);
    expect(cumulativeAverage([null, null])).toBeNull();
  });
});
