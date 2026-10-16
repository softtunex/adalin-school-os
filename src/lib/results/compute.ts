/*
 * Pure result computation. No database access here, so every rule is easy to test
 * against hand-checked report cards.
 */

export type Component = { id: string; name: string; maxScore: number };
export type Band = { grade: string; minScore: number; remark: string; passes: boolean };
export type ScoreRow = { studentId: string; subjectId: string; componentId: string; score: number };

export type SubjectResult = {
  subjectId: string;
  components: Record<string, number | null>;
  total: number | null;
  grade: string | null;
  remark: string | null;
  position: number | null;
  classAverage: number | null;
  classHighest: number | null;
  classLowest: number | null;
};

export type StudentResult = {
  studentId: string;
  subjects: Record<string, SubjectResult>;
  subjectsTaken: number;
  grandTotal: number;
  average: number | null;
  position: number | null;
  passed: number;
  failed: number;
};

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Bands sorted highest first; a score gets the first band whose minimum it reaches. */
export function gradeFor(score: number, bands: Band[]): Band | null {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  return sorted.find((b) => score >= b.minScore) ?? null;
}

/**
 * Standard competition ranking: equal values share a position and the next position
 * skips, so 90, 85, 85, 70 rank 1, 2, 2, 4. Null values are unranked.
 */
export function rank<T>(items: T[], value: (item: T) => number | null): Map<T, number | null> {
  const ranked = items
    .map((item) => ({ item, v: value(item) }))
    .filter((x): x is { item: T; v: number } => x.v !== null)
    .sort((a, b) => b.v - a.v);
  const out = new Map<T, number | null>(items.map((i) => [i, null]));
  let position = 0;
  let previous: number | null = null;
  ranked.forEach((x, i) => {
    if (previous === null || x.v !== previous) position = i + 1;
    previous = x.v;
    out.set(x.item, position);
  });
  return out;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Computes a class's results for one term. A subject counts for a student only if
 * they have at least one score in it; missing components count as zero in the total.
 */
export function computeClassResults(input: {
  studentIds: string[];
  subjectIds: string[];
  components: Component[];
  bands: Band[];
  scores: ScoreRow[];
}): Map<string, StudentResult> {
  const { studentIds, subjectIds, components, bands } = input;
  const byKey = new Map<string, number>();
  for (const s of input.scores) byKey.set(`${s.studentId}|${s.subjectId}|${s.componentId}`, s.score);

  const results = new Map<string, StudentResult>();
  for (const studentId of studentIds) {
    const subjects: Record<string, SubjectResult> = {};
    for (const subjectId of subjectIds) {
      const comps: Record<string, number | null> = {};
      let any = false;
      let total = 0;
      for (const c of components) {
        const v = byKey.get(`${studentId}|${subjectId}|${c.id}`);
        comps[c.id] = v ?? null;
        if (v !== undefined) {
          any = true;
          total += v;
        }
      }
      const finalTotal = any ? round2(total) : null;
      const band = finalTotal === null ? null : gradeFor(finalTotal, bands);
      subjects[subjectId] = {
        subjectId,
        components: comps,
        total: finalTotal,
        grade: band?.grade ?? null,
        remark: band?.remark ?? null,
        position: null,
        classAverage: null,
        classHighest: null,
        classLowest: null,
      };
    }
    const taken = Object.values(subjects).filter((s) => s.total !== null);
    const grandTotal = round2(taken.reduce((n, s) => n + (s.total ?? 0), 0));
    const passed = taken.filter((s) => gradeFor(s.total!, bands)?.passes ?? true).length;
    results.set(studentId, {
      studentId,
      subjects,
      subjectsTaken: taken.length,
      grandTotal,
      average: taken.length ? round2(grandTotal / taken.length) : null,
      position: null,
      passed,
      failed: taken.length - passed,
    });
  }

  // Subject positions and class statistics.
  for (const subjectId of subjectIds) {
    const all = [...results.values()];
    const positions = rank(all, (r) => r.subjects[subjectId].total);
    const totals = all.map((r) => r.subjects[subjectId].total).filter((t): t is number => t !== null);
    const avg = totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
    const hi = totals.length ? Math.max(...totals) : null;
    const lo = totals.length ? Math.min(...totals) : null;
    for (const r of all) {
      const sub = r.subjects[subjectId];
      sub.position = positions.get(r) ?? null;
      sub.classAverage = avg;
      sub.classHighest = hi;
      sub.classLowest = lo;
    }
  }

  // Overall class position by average.
  const overall = rank([...results.values()], (r) => r.average);
  for (const [r, p] of overall) r.position = p;
  return results;
}

/** Class-wide summary for the broadsheet header. */
export function classSummary(results: Map<string, StudentResult>) {
  const averages = [...results.values()].map((r) => r.average).filter((a): a is number => a !== null);
  return {
    students: results.size,
    withResults: averages.length,
    classAverage: averages.length ? round2(averages.reduce((a, b) => a + b, 0) / averages.length) : null,
    highestAverage: averages.length ? Math.max(...averages) : null,
    lowestAverage: averages.length ? Math.min(...averages) : null,
  };
}

/** Annual (cumulative) average across terms: the mean of the term averages that exist. */
export function cumulativeAverage(termAverages: (number | null)[]) {
  const present = termAverages.filter((a): a is number => a !== null);
  return present.length ? round2(present.reduce((a, b) => a + b, 0) / present.length) : null;
}

export const WAEC_BANDS: Band[] = [
  { grade: "A1", minScore: 75, remark: "Excellent", passes: true },
  { grade: "B2", minScore: 70, remark: "Very good", passes: true },
  { grade: "B3", minScore: 65, remark: "Good", passes: true },
  { grade: "C4", minScore: 60, remark: "Credit", passes: true },
  { grade: "C5", minScore: 55, remark: "Credit", passes: true },
  { grade: "C6", minScore: 50, remark: "Credit", passes: true },
  { grade: "D7", minScore: 45, remark: "Pass", passes: true },
  { grade: "E8", minScore: 40, remark: "Pass", passes: true },
  { grade: "F9", minScore: 0, remark: "Fail", passes: false },
];

export const SIMPLE_BANDS: Band[] = [
  { grade: "A", minScore: 70, remark: "Excellent", passes: true },
  { grade: "B", minScore: 60, remark: "Very good", passes: true },
  { grade: "C", minScore: 50, remark: "Good", passes: true },
  { grade: "D", minScore: 45, remark: "Fair", passes: true },
  { grade: "E", minScore: 40, remark: "Pass", passes: true },
  { grade: "F", minScore: 0, remark: "Fail", passes: false },
];

export const BRITISH_BANDS: Band[] = [
  { grade: "A*", minScore: 90, remark: "Outstanding", passes: true },
  { grade: "A", minScore: 80, remark: "Excellent", passes: true },
  { grade: "B", minScore: 70, remark: "Very good", passes: true },
  { grade: "C", minScore: 60, remark: "Good", passes: true },
  { grade: "D", minScore: 50, remark: "Satisfactory", passes: true },
  { grade: "E", minScore: 40, remark: "Pass", passes: true },
  { grade: "U", minScore: 0, remark: "Ungraded", passes: false },
];

export const GRADING_PRESETS = {
  waec: { label: "WAEC (A1 to F9)", bands: WAEC_BANDS },
  simple: { label: "A to F (A from 70)", bands: SIMPLE_BANDS },
  british: { label: "British (A* to U)", bands: BRITISH_BANDS },
} as const;

export const COMPONENT_PRESETS = [
  { label: "20 / 20 / 60", components: [{ name: "1st CA", maxScore: 20 }, { name: "2nd CA", maxScore: 20 }, { name: "Exam", maxScore: 60 }] },
  { label: "40 / 60", components: [{ name: "Test", maxScore: 40 }, { name: "Exam", maxScore: 60 }] },
  { label: "30 / 70", components: [{ name: "CA", maxScore: 30 }, { name: "Exam", maxScore: 70 }] },
  { label: "10 / 10 / 20 / 60", components: [{ name: "1st Test", maxScore: 10 }, { name: "2nd Test", maxScore: 10 }, { name: "Assignment", maxScore: 20 }, { name: "Exam", maxScore: 60 }] },
] as const;

export const DEFAULT_COMPONENTS = [
  { name: "1st CA", maxScore: 20 },
  { name: "2nd CA", maxScore: 20 },
  { name: "Exam", maxScore: 60 },
];

export const RATING_TRAITS = {
  affective: ["Punctuality", "Neatness", "Politeness", "Honesty", "Relationship with others", "Leadership", "Attentiveness"],
  psychomotor: ["Handwriting", "Sports and games", "Creative arts", "Verbal fluency", "Use of tools"],
} as const;

export const RATING_SCALE = [
  { value: 5, label: "Excellent" },
  { value: 4, label: "Very good" },
  { value: 3, label: "Good" },
  { value: 2, label: "Fair" },
  { value: 1, label: "Poor" },
];
