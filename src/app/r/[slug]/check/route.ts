import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { initials } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getPlanForSchool } from "@/lib/plans/plan-for-school";
import { hasFeature } from "@/lib/plans/entitlements";
import { ReportCards } from "@/lib/results/report-card";
import { checkResultWithPin } from "@/lib/services/pins";
import { readLocalUpload } from "@/lib/storage";
import { codeFor } from "../errors";

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let y = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) y--;
  return y;
}

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
  const plan = await getPlanForSchool(getDb(), school.planKey);
  const s = built.students.find((x) => x.id === studentId)!;
  let logo: Buffer | string | null = null;
  if (school.logoUrl?.startsWith("/uploads/")) logo = (await readLocalUpload(school.logoUrl.replace("/uploads/", "").split("/")))?.bytes ?? null;
  else if (school.logoUrl?.startsWith("https://")) logo = school.logoUrl;

  const pdf = await renderToBuffer(
    createElement(ReportCards, {
      data: {
        school: { name: school.name, motto: school.motto, address: [school.address, school.city, school.state].filter(Boolean).join(", ") || null, phone: school.phone, email: school.email, logo, initials: initials(school.name) },
        term: { name: built.term.term.name, session: built.term.session.name },
        className: built.class.name,
        classSize: built.summary.withResults,
        attendanceDays: built.attendanceDays,
        nextTermBegins: built.nextTermBegins,
        components: built.components.map((c) => ({ id: c.id, name: c.name, maxScore: c.maxScore })),
        subjects: built.subjects.map((x) => ({ id: x.id, name: x.name })),
        bands: built.bands,
        watermark: !plan || !hasFeature(plan, "report_cards_unbranded"),
        students: [
          {
            name: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" "),
            admissionNo: s.admissionNo,
            gender: s.gender,
            age: age(s.dateOfBirth),
            result: s.result,
            attendance: s.attendance,
            report: s.report ? { classTeacherComment: s.report.classTeacherComment, principalComment: s.report.principalComment, ratings: s.report.ratings } : null,
          },
        ],
      },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${`${s.lastName}-${s.firstName}-${built.term.term.name}`.replace(/[^\w.-]+/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
      "X-Pin-Uses-Left": String(usesLeft),
    },
  });
}
