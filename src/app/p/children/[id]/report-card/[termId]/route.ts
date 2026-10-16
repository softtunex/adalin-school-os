import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { AppError } from "@/lib/errors";
import { renderStudentReportCard } from "@/lib/results/student-report";
import { parentReportCardAccess } from "@/lib/services/parent-portal";
import { buildClassResults, resolveTerm } from "@/lib/services/results";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A parent's copy of their child's published report card. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; termId: string }> }) {
  const { id, termId } = await params;
  if (!UUID.test(id) || !UUID.test(termId)) notFound();
  const user = await getCurrentUser();
  if (!user) return Response.redirect(new URL("/parent", request.url), 303);
  const db = getDb();
  let access;
  try {
    access = await parentReportCardAccess(db, user.id, id, termId);
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(error.message, { status: error.code === "forbidden" ? 403 : 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    throw error;
  }
  const [school] = await db.select().from(schools).where(eq(schools.id, access.link.schoolId));
  const built = await withTenant(db, school.id, async (tx) => buildClassResults(tx, school.id, access.classId, await resolveTerm(tx, termId)));
  const { pdf, filename } = await renderStudentReportCard(db, school, built, id);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
