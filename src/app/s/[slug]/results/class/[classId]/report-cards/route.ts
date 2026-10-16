import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { initials } from "@/components/ui/display";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { hasFeature } from "@/lib/plans/entitlements";
import { ReportCards, type ReportCardData } from "@/lib/results/report-card";
import { getClassResults } from "@/lib/services/results";
import { readLocalUpload } from "@/lib/storage";

function ageOn(dob: string | null) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) years--;
  return years;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; classId: string }> }) {
  const { slug, classId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(classId)) return new Response("Not found", { status: 404 });
  const access = await requirePageAccess(slug, ["results:view"]);
  const studentId = new URL(request.url).searchParams.get("student");

  let data;
  try {
    data = await getClassResults(getDb(), access, classId);
  } catch (error) {
    if (error instanceof AppError) return new Response(error.message, { status: 404 });
    throw error;
  }
  const chosen = data.students.filter((s) => !studentId || s.id === studentId).filter((s) => s.result.subjectsTaken > 0);
  if (chosen.length === 0) return new Response("No report cards to print yet. Scores need to be entered first.", { status: 404 });

  const school = access.school;
  let logo: Buffer | string | null = null;
  if (school.logoUrl?.startsWith("/uploads/")) {
    logo = (await readLocalUpload(school.logoUrl.replace("/uploads/", "").split("/")))?.bytes ?? null;
  } else if (school.logoUrl?.startsWith("https://")) {
    logo = school.logoUrl;
  }

  const payload: ReportCardData = {
    school: { name: school.name, motto: school.motto, address: [school.address, school.city, school.state].filter(Boolean).join(", ") || null, phone: school.phone, email: school.email, logo, initials: initials(school.name) },
    term: { name: data.term.term.name, session: data.term.session.name },
    className: data.class.name,
    classSize: data.summary.withResults,
    attendanceDays: data.attendanceDays,
    nextTermBegins: data.nextTermBegins,
    components: data.components.map((c) => ({ id: c.id, name: c.name, maxScore: c.maxScore })),
    subjects: data.subjects.map((s) => ({ id: s.id, name: s.name })),
    bands: data.bands,
    watermark: !hasFeature(access.plan, "report_cards_unbranded"),
    students: chosen.map((s) => ({
      name: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" "),
      admissionNo: s.admissionNo,
      gender: s.gender,
      age: ageOn(s.dateOfBirth),
      result: s.result,
      attendance: s.attendance,
      report: s.report ? { classTeacherComment: s.report.classTeacherComment, principalComment: s.report.principalComment, ratings: s.report.ratings } : null,
    })),
  };

  const pdf = await renderToBuffer(createElement(ReportCards, { data: payload }) as Parameters<typeof renderToBuffer>[0]);
  const name = studentId && chosen[0] ? `${chosen[0].lastName}-${chosen[0].firstName}` : data.class.name;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${`${name}-${data.term.term.name}`.replace(/[^\w.-]+/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
