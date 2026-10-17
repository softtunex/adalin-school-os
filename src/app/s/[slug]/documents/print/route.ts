import { appUrl, requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { renderDocuments } from "@/lib/documents/render";
import { pdfResponse } from "@/lib/fees/school-header";

/** One document (?id=) or one print run (?batch=) as a PDF, drawn from the register. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["documents:issue"]);
  const sp = new URL(request.url).searchParams;
  const id = sp.get("id") ?? undefined;
  const batch = sp.get("batch") ?? undefined;
  const uuid = /^[0-9a-f-]{36}$/;
  if (!(id && uuid.test(id)) && !(batch && uuid.test(batch))) return new Response("Not found", { status: 404 });
  const { pdf, filename } = await renderDocuments(getDb(), access.school, await appUrl(), { id, batch });
  return pdfResponse(pdf, filename);
}
