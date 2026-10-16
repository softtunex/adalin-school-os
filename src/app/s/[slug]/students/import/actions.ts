"use server";

import { revalidatePath } from "next/cache";
import { requestMeta, requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { listClassOptions } from "@/lib/services/academics";
import { commitImport, MAX_IMPORT_BYTES, previewImport, readSpreadsheet, type ImportError } from "@/lib/services/student-import";

export type ImportState = {
  error?: string;
  preview?: {
    fileName: string;
    valid: { row: number; name: string; className: string | null; admissionNo: string | null; parent: string | null }[];
    errors: ImportError[];
    unknownHeaders: string[];
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
    const [{ rows, unknownHeaders }, classes] = await Promise.all([readSpreadsheet(await file.arrayBuffer(), file.name), listClassOptions(db, access)]);
    const preview = await previewImport(db, access, rows, classes);

    if (formData.get("intent") === "commit") {
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
        overLimit: preview.overLimit,
        limit: preview.limit,
      },
    };
  } catch (error) {
    return { error: userMessage(error) };
  }
}
