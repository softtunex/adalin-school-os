"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Card } from "./ui/display";

type Period = { id: string; label: string; startsAt: string; endsAt: string; kind: string };
type Slot = { day: number; periodId: string; subjectName: string | null; teacherName: string | null; room: string | null; note: string | null };

const DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function lagosWeekday() {
  const d = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short" }).format(new Date());
  return ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(d);
}

function to12(t: string) {
  const h = Number(t.slice(0, 2));
  return `${((h + 11) % 12) + 1}:${t.slice(3, 5)} ${h < 12 ? "am" : "pm"}`;
}

/** A class's week as a day picker and a list: easy to read on a phone. For parents and students. */
export function WeekList({ days, periods, slots }: { days: number[]; periods: Period[]; slots: Slot[] }) {
  const today = lagosWeekday();
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Day">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === day}
            onClick={() => setDay(d)}
            className={cn(
              "flex min-w-14 flex-1 flex-col items-center rounded-chunk border px-2 py-2 fs-13 font-semibold transition-colors",
              d === day ? "border-brand bg-brand text-white shadow-[0_3px_0_var(--brand-deep)]" : "border-line-strong bg-canvas text-body hover:bg-paper",
            )}
          >
            {DAY[d].slice(0, 3)}
            {d === today ? <span className={cn("fs-11 font-medium", d === day ? "text-white/80" : "text-brand")}>Today</span> : null}
          </button>
        ))}
      </div>
      <Card className="divide-y divide-line">
        {periods.map((p) => {
          const s = slots.find((x) => x.day === day && x.periodId === p.id);
          if (p.kind !== "lesson") {
            return (
              <div key={p.id} className="flex items-center gap-3 bg-paper/60 px-4 py-2 fs-13 text-muted">
                <span className="tabular w-16 shrink-0">{to12(p.startsAt)}</span>
                <span className="font-medium uppercase tracking-[0.06em]">{p.label}</span>
              </div>
            );
          }
          return (
            <div key={p.id} className="flex items-start gap-3 px-4 py-3">
              <span className="tabular w-16 shrink-0 pt-0.5 fs-13.5 text-muted">{to12(p.startsAt)}</span>
              <span className="min-w-0">
                <span className={cn("block fs-15", s?.subjectName || s?.note ? "font-semibold text-ink" : "text-muted")}>{s?.subjectName ?? s?.note ?? "Free period"}</span>
                {s && (s.teacherName || s.room) ? <span className="block fs-13 text-muted">{[s.teacherName, s.room].filter(Boolean).join(" · ")}</span> : null}
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
