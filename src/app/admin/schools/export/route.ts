import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { lagosToday } from "@/lib/services/attendance";
import { listSchools, requirePlatformAdmin } from "@/lib/services/platform";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const db = getDb();
  await requirePlatformAdmin(db, user.id).catch(() => notFound());
  const sp = new URL(request.url).searchParams;
  const { rows } = await listSchools(db, { q: sp.get("q") ?? undefined, plan: sp.get("plan") ?? undefined, status: sp.get("status") ?? undefined, all: true });
  const csv = toCsv(
    ["School", "Code", "Plan", "Status", "Trial ends", "Students", "Staff", "Owing (NGN)", "Email", "Phone", "City", "State", "Joined"],
    rows.map(({ school, students, staff, owed }) => [
      school.name,
      school.slug,
      school.planKey,
      school.status,
      school.trialEndsAt?.toISOString().slice(0, 10) ?? "",
      students,
      staff,
      (owed / 100).toFixed(2),
      school.email ?? "",
      school.phone ?? "",
      school.city ?? "",
      school.state ?? "",
      school.createdAt.toISOString().slice(0, 10),
    ]),
  );
  return csvResponse(`school-os-schools-${lagosToday()}.csv`, csv);
}
