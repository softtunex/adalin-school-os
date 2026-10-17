import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { lagosToday } from "@/lib/services/attendance";
import { formatTemp, listVisits, OUTCOME_LABEL } from "@/lib/services/health";
import { lagosClock } from "@/lib/services/hr";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["operations:health"]);
  const sp = new URL(request.url).searchParams;
  const { rows } = await listVisits(getDb(), access, { q: sp.get("q") ?? undefined, outcome: sp.get("outcome") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, all: true });
  const csv = toCsv(
    ["Date", "Arrived", "Left", "Student", "Admission no", "Class", "Complaint", "Temperature", "What was seen", "What was done", "Medicine given", "Outcome", "Parents told", "Recorded by"],
    rows.map((r) => [
      r.v.arrivedAt.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }),
      lagosClock(r.v.arrivedAt),
      r.v.leftAt ? lagosClock(r.v.leftAt) : "",
      r.name,
      r.admissionNo,
      r.className ?? "",
      r.v.complaint,
      formatTemp(r.v.temperature) ?? "",
      r.v.observations ?? "",
      r.v.treatment ?? "",
      r.v.medicines.map((m) => `${m.medicine} ${m.dose}${m.allergyOverride ? " (allergy override)" : ""}`).join("; "),
      r.v.outcome ? OUTCOME_LABEL[r.v.outcome] : "",
      r.v.parentsTold ? "Yes" : "No",
      r.by ?? "",
    ]),
  );
  return csvResponse(`${slug}-sick-bay-${lagosToday()}.csv`, csv);
}
