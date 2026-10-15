import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { listStaff } from "@/lib/services/staff";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["staff:view"]);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const { filtered } = await listStaff(getDb(), access, {
    q: url.searchParams.get("q") ?? undefined,
    roleId: url.searchParams.get("role") ?? undefined,
    status: status === "active" || status === "deactivated" ? status : undefined,
  });
  const csv = toCsv(
    ["Name", "Email", "Job title", "Roles", "Status", "Joined"],
    filtered.map((m) => [
      m.name,
      m.email,
      m.jobTitle,
      m.roles.filter((r) => r.kind === "staff").map((r) => r.name).join("; "),
      m.status,
      m.joinedAt.toISOString().slice(0, 10),
    ]),
  );
  return csvResponse(`${slug}-staff.csv`, csv);
}
