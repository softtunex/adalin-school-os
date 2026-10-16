import { requirePageAccess } from "@/lib/auth/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { listApplicants, STATUS_LABEL } from "@/lib/services/admissions";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["admissions:view"]);
  const sp = new URL(request.url).searchParams;
  const list = await listApplicants(getDb(), access, { status: sp.get("status") ?? undefined, levelId: sp.get("level") ?? undefined, paid: sp.get("paid") ?? undefined, q: sp.get("q") ?? undefined, limit: 20_000 });
  const csv = toCsv(
    ["Reference", "First name", "Middle name", "Surname", "Gender", "Date of birth", "Class", "Status", "Exam score", "Fee (NGN)", "Fee paid", "Parent", "Relationship", "Phone", "Email", "Previous school", "Applied"],
    list.rows.map(({ a, levelName }) => [
      a.ref,
      a.firstName,
      a.middleName,
      a.lastName,
      a.gender,
      a.dateOfBirth,
      levelName,
      STATUS_LABEL[a.status],
      a.examScore,
      (a.feeKobo / 100).toFixed(2),
      a.feePaid ? "yes" : "no",
      a.guardianName,
      a.guardianRelationship,
      a.guardianPhone,
      a.guardianEmail,
      a.previousSchool,
      a.createdAt.toISOString().slice(0, 10),
    ]),
  );
  return csvResponse(`${slug}-applicants.csv`, csv);
}
