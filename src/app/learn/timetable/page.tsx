import type { Metadata } from "next";
import { Card, EmptyState } from "@/components/ui/display";
import { WeekList } from "@/components/week-list";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getStudentHome } from "@/lib/services/student-portal";

export const metadata: Metadata = { title: "Timetable" };

export default async function StudentTimetable() {
  const user = await requireUser();
  const home = await getStudentHome(getDb(), user.id);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="fs-26 font-bold tracking-[-0.02em]">Timetable</h1>
      {home.week ? (
        <WeekList days={home.week.schedule.days} periods={home.week.schedule.periods} slots={home.week.slots} />
      ) : (
        <Card>
          <EmptyState icon="clock" title="No timetable yet">
            Your class timetable shows here once the school sets it.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
