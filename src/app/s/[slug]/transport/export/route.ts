import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { lagosToday } from "@/lib/services/attendance";
import { DIRECTION_LABEL, listRiders } from "@/lib/services/transport";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["operations:transport"]);
  const routeId = new URL(request.url).searchParams.get("route") ?? undefined;
  const rows = await listRiders(getDb(), access, { routeId });
  const csv = toCsv(
    ["Student", "Admission no", "Class", "Route", "Stop", "Pick-up", "Drop-off", "Rides", "Since"],
    rows.map((r) => {
      const stop = r.stops.find((s) => s.name === r.r.stop);
      return [r.name, r.admissionNo, r.className ?? "", r.route, r.r.stop, stop?.pickup ?? "", stop?.dropoff ?? "", DIRECTION_LABEL[r.r.direction], r.r.startedOn];
    }),
  );
  return csvResponse(`${slug}-bus-riders-${lagosToday()}.csv`, csv);
}
