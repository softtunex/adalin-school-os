import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { lagosToday } from "@/lib/services/attendance";
import { listBoarders } from "@/lib/services/hostel";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["operations:hostel"]);
  const hostelId = new URL(request.url).searchParams.get("hostel") ?? undefined;
  const rows = await listBoarders(getDb(), access, { hostelId });
  const csv = toCsv(
    ["Student", "Admission no", "Class", "Hostel", "Room", "Bed", "Since"],
    rows.map((r) => [r.name, r.admissionNo, r.className ?? "", r.hostel, r.room, r.b.bed, r.b.since]),
  );
  return csvResponse(`${slug}-boarders-${lagosToday()}.csv`, csv);
}
