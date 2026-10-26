"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { listClassOptions } from "@/lib/services/academics";
import { aiHeaderMapper } from "@/lib/services/ai-import";
import { commitImport, IMPORT_COLUMNS, MAX_IMPORT_BYTES, previewImport, readSpreadsheet, type ImportError } from "@/lib/services/student-import";

export type ImportState = {
  error?: string;
  preview?: {
    fileName: string;
    valid: { row: number; name: string; className: string | null; admissionNo: string | null; parent: string | null }[];
    errors: ImportError[];
    unknownHeaders: string[];
    /** Headings AI matched to SchoolHub fields: heading → field name shown to the teacher. */
    matched: Record<string, string>;
    /** The same, in words: "Pupil's Name → Full name". */
    matchedLabels: string[];
    overLimit: number;
    limit: number | null;
  };
  imported?: number;
};

export async function importAction(slug: string, _prev: ImportState, formData: FormData): Promise<ImportState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your spreadsheet first." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "That file is over 5 MB. Split it into smaller files." };

  try {
    const access = await requireAccess(slug);
    const db = getDb();
    const committing = formData.get("intent") === "commit";
    const mapping = committing ? parseMapping(formData.get("mapping")) : undefined;
    const [{ rows, unknownHeaders, matched }, classes] = await Promise.all([
      readSpreadsheet(await file.arrayBuffer(), file.name, mapping ? { mapping } : { mapHeaders: aiHeaderMapper(db, access) }),
      listClassOptions(db, access),
    ]);
    const preview = await previewImport(db, access, rows, classes);

    if (committing) {
      if (preview.errors.length) return { error: "Fix the rows with problems first, then upload the file again." };
      const imported = await commitImport(db, access, preview.valid, (await requestMeta()).ip);
      revalidatePath(`/s/${slug}`, "layout");
      return { imported };
    }

    return {
      preview: {
        fileName: file.name,
        valid: preview.valid.map((r) => ({
          row: r.row,
          name: r.name,
          className: r.className,
          admissionNo: r.student.admissionNo ?? null,
          parent: r.guardians[0] ? `${r.guardians[0].name}${r.guardians[0].phone ? ` · ${r.guardians[0].phone}` : ""}` : null,
        })),
        errors: preview.errors,
        unknownHeaders,
        matched,
        matchedLabels: Object.entries(matched).map(([h, k]) => `${h} → ${k === "fullName" ? "Full name" : (IMPORT_COLUMNS.find((c) => c.key === k)?.header ?? k)}`),
        overLimit: preview.overLimit,
        limit: preview.limit,
      },
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}

function parseMapping(raw: FormDataEntryValue | null): Record<string, string> | undefined {
  if (typeof raw !== "string" || raw.length > 5000) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return undefined;
  }
}
