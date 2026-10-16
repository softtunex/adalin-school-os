import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { renderStudentReportCard } from "@/lib/results/student-report";
import { checkResultWithPin } from "@/lib/services/pins";
import { codeFor } from "../errors";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await request.formData();
  const admissionNo = String(form.get("admissionNo") ?? "").slice(0, 60);
  const pin = String(form.get("pin") ?? "").slice(0, 40);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const back = (code: string) => Response.redirect(new URL(`/r/${slug}?e=${code}`, request.url), 303);
  if (!admissionNo.trim() || !pin.trim()) return back("missing");

  let result;
  try {
    result = await checkResultWithPin(getDb(), { slug, admissionNo, pin, ip });
  } catch (error) {
    if (error instanceof AppError) return back(codeFor(error.message));
    throw error;
  }

  const { school, built, studentId, usesLeft } = result;
  const { pdf, filename } = await renderStudentReportCard(getDb(), school, built, studentId);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "no-store",
      "X-Pin-Uses-Left": String(usesLeft),
    },
  });
}
