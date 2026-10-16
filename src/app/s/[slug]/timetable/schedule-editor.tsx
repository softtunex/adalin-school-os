"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { saveScheduleAction, setLevelScheduleAction } from "./actions";

type Period = { id?: string; label: string; startsAt: string; endsAt: string; kind: "lesson" | "break" | "assembly" | "other" };
type Schedule = { id?: string; name: string; days: number[]; periods: Period[] };

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
] as const;

function addMinutes(t: string, m: number) {
  const total = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + m;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function ScheduleEditor({ slug, schedule, editable }: { slug: string; schedule: Schedule; editable: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<Schedule>(schedule);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const lessons = s.periods.filter((p) => p.kind === "lesson").length;

  function update(i: number, patch: Partial<Period>) {
    setMessage(null);
    setS((prev) => ({ ...prev, periods: prev.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Schedule name" htmlFor={`sch-${schedule.id ?? "new"}`}>
          <Input id={`sch-${schedule.id ?? "new"}`} value={s.name} disabled={!editable} onChange={(e) => setS({ ...s, name: e.target.value })} className="sm:w-64" />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 fs-14 font-medium text-ink">School days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(([d, label]) => (
              <label key={d} className="flex items-center gap-1.5 rounded-chunk border border-line-strong px-2.5 py-1.5 fs-13.5 has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={s.days.includes(d)}
                  onChange={(e) => setS({ ...s, days: e.target.checked ? [...s.days, d].sort() : s.days.filter((x) => x !== d) })}
                  className="size-4 accent-[var(--brand)]"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="ml-auto fs-13.5 text-muted">
          {lessons} lessons a day · {lessons * s.days.length} a week
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 fs-14">
          <thead>
            <tr>
              {["Label", "Starts", "Ends", "Type", ""].map((h) => (
                <th key={h} className="bg-paper px-2 py-2 text-left fs-12.5 font-medium text-muted first:rounded-l-[10px] last:rounded-r-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.periods.map((p, i) => (
              <tr key={p.id ?? `new-${i}`}>
                <td className="border-b border-line px-2 py-1.5">
                  <Input aria-label="Period label" value={p.label} disabled={!editable} onChange={(e) => update(i, { label: e.target.value })} className="h-10" />
                </td>
                <td className="border-b border-line px-2 py-1.5">
                  <Input aria-label="Start time" type="time" value={p.startsAt} disabled={!editable} onChange={(e) => update(i, { startsAt: e.target.value })} className="tabular h-10 w-32" />
                </td>
                <td className="border-b border-line px-2 py-1.5">
                  <Input aria-label="End time" type="time" value={p.endsAt} disabled={!editable} onChange={(e) => update(i, { endsAt: e.target.value })} className="tabular h-10 w-32" />
                </td>
                <td className="border-b border-line px-2 py-1.5">
                  <Select aria-label="Period type" value={p.kind} disabled={!editable} onChange={(e) => update(i, { kind: e.target.value as Period["kind"] })} className="h-10 w-36">
                    <option value="lesson">Lesson</option>
                    <option value="break">Break</option>
                    <option value="assembly">Assembly</option>
                    <option value="other">Other</option>
                  </Select>
                </td>
                <td className="border-b border-line px-2 py-1.5 text-right">
                  {editable ? (
                    <button type="button" aria-label={`Remove ${p.label}`} onClick={() => setS({ ...s, periods: s.periods.filter((_, j) => j !== i) })} className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-danger">
                      <Icon name="trash" size={16} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert> : null}
      {editable ? (
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              const last = s.periods[s.periods.length - 1];
              const startsAt = last?.endsAt ?? "08:00";
              setS({ ...s, periods: [...s.periods, { label: String(lessons + 1), startsAt, endsAt: addMinutes(startsAt, 40), kind: "lesson" }] });
            }}
          >
            <Icon name="plus" size={17} /> Add period
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveScheduleAction(slug, s);
                setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.success ?? "Saved." });
                if (!r.error) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function LevelScheduleSelect({ slug, levelId, value, schedules, editable }: { slug: string; levelId: string; value: string | null; schedules: { id: string; name: string; isDefault: boolean }[]; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fallback = schedules.find((x) => x.isDefault)?.name ?? schedules[0]?.name;
  return (
    <Select
      aria-label="Bell schedule"
      value={value ?? ""}
      disabled={!editable || pending}
      onChange={(e) =>
        start(async () => {
          await setLevelScheduleAction(slug, levelId, e.target.value || null);
          router.refresh();
        })
      }
      className="h-10 w-56"
    >
      <option value="">{fallback} (default)</option>
      {schedules
        .filter((x) => !x.isDefault)
        .map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
    </Select>
  );
}
