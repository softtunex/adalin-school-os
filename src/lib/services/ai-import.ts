import type { DB } from "../db/client";
import type { Access } from "./access";
import { aiAvailability, runAi } from "./ai";
import { COLUMN_KEYS, IMPORT_COLUMNS, type HeaderMapper } from "./student-import";

/*
 * Matches a school's own spreadsheet headings ("Pupil's Name", "Sex", "Father's GSM") to SchoolHub's
 * fields. AI sees only the headings and what each column looks like, never the students' details.
 */

const FIELDS = [
  ...IMPORT_COLUMNS.map((c) => `${c.key}: ${c.header}${c.note ? ` (${c.note})` : ""}`),
  "fullName: the whole student name in one column",
].join("\n");

/** An AI heading matcher for this school, or undefined when AI isn't available (the import then works as before). */
export function aiHeaderMapper(db: DB, access: Access): HeaderMapper | undefined {
  if (!aiAvailability(access).ok) return undefined;
  return async (columns) => {
    try {
      const text = await runAi(db, access, "import", "fast", [
        {
          role: "system",
          content: `[task:columns] You match spreadsheet column headings from Nigerian schools to the fields of a student import. Fields:\n${FIELDS}\n\nNotes: g1 is the first parent or guardian, g2 the second. "GSM", "phone" and "mobile" are phone numbers. A father's details usually go to g2 if a mother's are also present, otherwise g1. Serial-number columns (S/N, No.) are not admission numbers. Match each heading to at most one field and use each field once. If a heading matches nothing, use null. Reply with a JSON object mapping each heading exactly as given to a field key or null.`,
        },
        { role: "user", content: JSON.stringify(columns) },
      ], { maxTokens: 600, temperature: 0, json: true, publicData: true });
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string" && COLUMN_KEYS.has(e[1])));
    } catch {
      // AI is a convenience here: if it fails or is busy, the import carries on with the headings it knows.
      return {};
    }
  };
}
