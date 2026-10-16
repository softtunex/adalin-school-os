import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listClassOptions } from "@/lib/services/academics";
import { buildTemplate } from "@/lib/services/student-import";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["students:import"]);
  const classes = await listClassOptions(getDb(), access);
  const buffer = await buildTemplate(classes.map((c) => c.name));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}-student-import-template.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
