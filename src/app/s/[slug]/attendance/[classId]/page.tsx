import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { Alert } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getAttendanceSheet, lagosToday } from "@/lib/services/attendance";
import { Register } from "./register";

export const metadata: Metadata = { title: "Register" };

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ slug: string; classId: string }>; searchParams: Promise<{ date?: string }> }) {
  const { slug, classId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(classId)) notFound();
  const access = await requirePageAccess(slug, ["attendance:take", "attendance:edit_past"]);
  const today = lagosToday();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;

  let sheet;
  try {
    sheet = await getAttendanceSheet(getDb(), access, classId, date);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }

  return (
    <>
      <Topbar
        title={
          <span className="flex items-center gap-2">
            <Link href={`/s/${slug}/attendance${date === today ? "" : `?date=${date}`}`} className="text-muted hover:text-ink">
              Attendance
            </Link>
            <Icon name="chevronRight" size={18} className="text-muted" />
            {sheet.class.name}
          </span>
        }
      />
      <PageBody>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="fs-15 font-medium text-ink">{longDate.format(new Date(`${date}T00:00:00Z`))}</p>
          {sheet.taken ? <p className="fs-13.5 text-muted">Already taken. Changes overwrite the saved register.</p> : null}
        </div>
        {!sheet.canEdit ? <Alert tone="warning">Only admins can change attendance for past days. You can view it below.</Alert> : null}
        {sheet.students.length === 0 ? (
          <Alert tone="blue" title="No students in this class">Add students to {sheet.class.name} from the Students page first.</Alert>
        ) : (
          <Register
            slug={slug}
            classId={classId}
            className={sheet.class.name}
            date={date}
            readOnly={!sheet.canEdit}
            taken={sheet.taken}
            initial={sheet.students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, status: s.status, note: s.note }))}
          />
        )}
      </PageBody>
    </>
  );
}
