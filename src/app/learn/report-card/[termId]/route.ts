import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { renderStudentReportCard } from "@/lib/results/student-report";
import { getStudentResults } from "@/lib/services/student-portal";
import { buildClassResults, resolveTerm } from "@/lib/services/results";

/** A student's own published report card, when the school lets students see results. */
export async function GET(request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const { termId } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.redirect(new URL("/student", request.url), 303);
  const db = getDb();
  const r = await getStudentResults(db, user.id).catch(() => null);
  const term = r?.allowed ? r.results.find((t) => t.termId === termId && !t.withheld) : undefined;
  if (!r || !term) notFound();
  const [school] = await db.select().from(schools).where(eq(schools.id, r.me.schoolId));
  const built = await withTenant(db, school.id, async (tx) => buildClassResults(tx, school.id, term.classId, await resolveTerm(tx, termId)));
  const { pdf, filename } = await renderStudentReportCard(db, school, built, r.me.studentId);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" } });
}
