import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { ordinal } from "@/lib/results/compute";
import { getClassResults } from "@/lib/services/results";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; classId: string }> }) {
  const { slug, classId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(classId)) return new Response("Not found", { status: 404 });
  const access = await requirePageAccess(slug, ["results:view"]);
  let data;
  try {
    data = await getClassResults(getDb(), access, classId);
  } catch (error) {
    if (error instanceof AppError) return new Response(error.message, { status: 404 });
    throw error;
  }
  const rows = [...data.students].sort((a, b) => (a.result.position ?? 9999) - (b.result.position ?? 9999));
  const csv = toCsv(
    ["Position", "Admission no", "Student", ...data.subjects.flatMap((s) => [`${s.name} total`, `${s.name} grade`]), "Total", "Average", "Days present"],
    rows.map((s) => [
      s.result.position ? ordinal(s.result.position) : "",
      s.admissionNo,
      `${s.lastName} ${s.firstName}`,
      ...data.subjects.flatMap((sub) => [s.result.subjects[sub.id]?.total ?? "", s.result.subjects[sub.id]?.grade ?? ""]),
      s.result.subjectsTaken ? s.result.grandTotal : "",
      s.result.average ?? "",
      s.attendance.present + s.attendance.late,
    ]),
  );
  return csvResponse(`${data.class.name}-${data.term.term.name}-broadsheet.csv`, csv);
}
