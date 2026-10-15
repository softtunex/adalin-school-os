import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { AUDIT_CATEGORIES, categoryOf, exportAuditLog, isImportant } from "@/lib/services/audit-log";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["audit:view"]);
  const url = new URL(request.url);
  const rows = await exportAuditLog(getDb(), access, {
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
  });
  const csv = toCsv(
    ["When (UTC)", "Action", "Details", "By", "IP address", "Category", "Severity"],
    rows.map((e) => {
      const cat = categoryOf(e.action);
      return [e.createdAt.toISOString(), e.action, e.summary, e.actorName ?? "System", e.ip, cat ? AUDIT_CATEGORIES[cat].label : "Other", isImportant(e.action) ? "Review" : "Info"];
    }),
  );
  return csvResponse(`${slug}-audit-log.csv`, csv);
}
