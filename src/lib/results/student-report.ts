import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { initials } from "@/components/ui/display";
import type { DB } from "../db/client";
import type { schools } from "../db/schema";
import { hasFeature } from "../plans/entitlements";
import { getPlanForSchool } from "../plans/plan-for-school";
import type { buildClassResults } from "../services/results";
import { readLocalUpload } from "../storage";
import { ReportCards } from "./report-card";

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let y = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) y--;
  return y;
}

/** One student's report card as a PDF, for the result checker and the parent app. */
export async function renderStudentReportCard(db: DB, school: typeof schools.$inferSelect, built: Awaited<ReturnType<typeof buildClassResults>>, studentId: string) {
  const plan = await getPlanForSchool(db, school.planKey);
  const s = built.students.find((x) => x.id === studentId);
  if (!s) throw new Error("Student not in this class result");
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
  return { pdf, filename: `${s.lastName}-${s.firstName}-${built.term.term.name}`.replace(/[^\w.-]+/g, "-") };
}
