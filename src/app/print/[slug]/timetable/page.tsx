import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getClassTimetable, getTeacherTimetable } from "@/lib/services/timetable";
import { PrintNow } from "./print-now";

export const metadata: Metadata = { title: "Timetable" };

const DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A plain, printable week for the notice board. */
export default async function PrintTimetable({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ class?: string; teacher?: string; term?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.isStaff) notFound();
  const db = getDb();

  let title: string;
  let term: string;
  let days: number[];
  let periods: { id: string; label: string; startsAt: string; endsAt: string; kind: string }[];
  let cell: (day: number, periodId: string) => { top: string; bottom: string } | null;

  if (sp.class) {
    const t = await getClassTimetable(db, access, sp.class, sp.term);
    title = `${t.cls.name} timetable`;
    term = t.term.label;
    days = t.schedule.days;
    periods = t.schedule.periods;
    cell = (day, periodId) => {
      const s = t.slots.find((x) => x.day === day && x.periodId === periodId);
      return s ? { top: s.subjectName ?? s.note ?? "", bottom: [s.teacherName, s.room].filter(Boolean).join(" · ") } : null;
    };
  } else {
    const t = await getTeacherTimetable(db, access, sp.teacher, sp.term);
    const name = t.staff.find((s) => s.id === t.teacherId)?.name ?? access.user.name;
    title = `${name}'s timetable`;
    term = t.term.label;
    days = t.schedule.days;
    periods = t.schedule.periods;
    cell = (day, periodId) => {
      const p = periods.find((x) => x.id === periodId)!;
      const l = t.lessons.find((x) => x.day === day && minutes(x.startsAt) < minutes(p.endsAt) && minutes(p.startsAt) < minutes(x.endsAt));
      return l ? { top: l.className, bottom: [l.subjectName, l.room].filter(Boolean).join(" · ") } : null;
    };
  }

  return (
    <div className="min-h-dvh bg-white p-8 text-[#1d1d1f] print:p-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="fs-13 text-[#84848b]">{access.school.name}</p>
          <h1 className="fs-22 font-bold">{title}</h1>
          <p className="fs-13.5 text-[#4a4a4f]">{term}</p>
        </div>
        <PrintNow />
      </div>
      <table className="w-full table-fixed border-collapse fs-12">
        <thead>
          <tr>
            <th className="w-20 border border-[#d4d2ce] bg-[#f4f3f0] p-1.5 text-left">Day</th>
            {periods.map((p) => (
              <th key={p.id} className={`border border-[#d4d2ce] bg-[#f4f3f0] p-1.5 ${p.kind === "lesson" ? "" : "w-10"}`}>
                <span className="block">{p.kind === "lesson" ? p.label : ""}</span>
                <span className="block font-normal text-[#84848b]">{p.startsAt}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <th className="border border-[#d4d2ce] bg-[#f4f3f0] p-1.5 text-left">{DAY[d]}</th>
              {periods.map((p) =>
                p.kind !== "lesson" ? (
                  <td key={p.id} className="border border-[#d4d2ce] bg-[#f4f3f0] text-center fs-10 uppercase text-[#84848b]">
                    {d === days[0] ? <span className="[writing-mode:vertical-rl]">{p.label}</span> : null}
                  </td>
                ) : (
                  <td key={p.id} className="h-14 border border-[#d4d2ce] p-1.5 align-top">
                    {(() => {
                      const c = cell(d, p.id);
                      return c ? (
                        <>
                          <span className="block font-semibold leading-tight">{c.top}</span>
                          <span className="block text-[#4a4a4f]">{c.bottom}</span>
                        </>
                      ) : null;
                    })()}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
