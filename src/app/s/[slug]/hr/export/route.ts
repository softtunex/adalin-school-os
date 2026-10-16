import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { getMonthSummary } from "@/lib/services/hr";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["staff:attendance"]);
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  const m = await getMonthSummary(getDb(), access, month);
  const csv = toCsv(
    ["Staff", "Job title", "Workdays", "On time", "Late", "Absent", "Leave", "Attendance %", "Usually in"],
    m.rows.map((r) => [r.name, r.jobTitle, m.workdays, r.present, r.late, r.absent, r.leave, r.rate, r.usualArrival]),
  );
  return csvResponse(`${slug}-staff-attendance-${m.month}.csv`, csv);
}
