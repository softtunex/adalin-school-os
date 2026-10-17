import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { groupOverview } from "@/lib/services/groups";

const naira = (kobo: number) => (kobo / 100).toFixed(2);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const o = await groupOverview(getDb(), user.id, id).catch(() => notFound());
  const csv = toCsv(
    ["Campus", "School code", "Current term", "Students", "Staff", "Marked today", "Present or late today", "Billed this term (NGN)", "Collected (NGN)", "Outstanding (NGN)"],
    o.campuses.map((c) => [c.name, c.slug, c.term ?? "", c.students, c.staff, c.marked, c.present, naira(c.billed), naira(c.collected), naira(c.outstanding)]),
  );
  return csvResponse(`${o.group.name}-campuses-${o.today}.csv`, csv);
}
