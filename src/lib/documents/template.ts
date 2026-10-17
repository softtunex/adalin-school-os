/** Words a template can use. Filled in per student when the letter is printed. */
export const MERGE_FIELDS = [
  ["name", "Student's full name"],
  ["first_name", "Student's first name"],
  ["admission_no", "Admission number"],
  ["class", "Current class"],
  ["parent", "Parent or guardian's name"],
  ["school", "School name"],
  ["date", "Today's date"],
  ["session", "Current session"],
  ["term", "Current term"],
] as const;

export type MergeData = Partial<Record<(typeof MERGE_FIELDS)[number][0], string>>;

export function fillTemplate(text: string, data: MergeData) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => data[k as keyof MergeData] ?? m);
}

export function unknownFields(text: string) {
  const known = new Set<string>(MERGE_FIELDS.map(([k]) => k));
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !known.has(k)))];
}
