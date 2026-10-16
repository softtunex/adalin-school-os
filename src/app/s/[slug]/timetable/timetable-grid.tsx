"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { setSlotAction, swapSlotsAction } from "./actions";

type Period = { id: string; label: string; startsAt: string; endsAt: string; kind: string };
type Slot = { day: number; periodId: string; subjectId: string | null; subjectName: string | null; subjectCode: string | null; teacherId: string | null; teacherName: string | null; room: string | null; note: string | null; className?: string };
type Subject = { id: string; name: string; code: string | null; teacherId: string | null };

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TINTS = ["bg-blue-wash", "bg-success-wash", "bg-violet-wash", "bg-warning-wash", "bg-brand-wash", "bg-[color-mix(in_srgb,var(--blue-wash)_50%,var(--success-wash))]"];

function tint(id: string | null) {
  if (!id) return "bg-sunken";
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

/** A subject's code if it has one, else its name (the cell trims it to fit, with the full name on hover). */
function shortName(name: string | null, code: string | null) {
  return code || name || "";
}

function surname(name: string | null) {
  if (!name) return "";
  const parts = name.replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, "").split(" ");
  return parts[parts.length - 1];
}

/**
 * A week as days by periods. Staff who manage the timetable click a cell to set the lesson
 * and drag a lesson onto another cell to swap them. Read-only otherwise.
 */
export function TimetableGrid({
  slug,
  termId,
  classId,
  days,
  periods,
  slots,
  subjects,
  staff,
  editable,
  mode = "class",
}: {
  slug: string;
  termId: string;
  classId?: string;
  days: number[];
  periods: Period[];
  slots: Slot[];
  subjects: Subject[];
  staff: { id: string; name: string }[];
  editable: boolean;
  mode?: "class" | "teacher";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ day: number; period: Period } | null>(null);
  const [dragFrom, setDragFrom] = useState<{ day: number; periodId: string } | null>(null);
  const [swapClash, setSwapClash] = useState<{ a: { day: number; periodId: string }; b: { day: number; periodId: string }; clashes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const at = (day: number, periodId: string) => slots.find((s) => s.day === day && s.periodId === periodId);
  const canEdit = editable && mode === "class" && !!classId;

  function swap(a: { day: number; periodId: string }, b: { day: number; periodId: string }, force = false) {
    start(async () => {
      const r = await swapSlotsAction(slug, { termId, classId: classId!, a, b, force });
      if (r.error) setError(r.error);
      else if (!r.ok) setSwapClash({ a, b, clashes: r.clashes });
      else {
        setSwapClash(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      {error ? (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      ) : null}
      <div className="overflow-x-auto rounded-card border border-line bg-canvas">
        <table className={cn("w-full min-w-[860px] table-fixed border-collapse fs-13.5", pending && "opacity-70")}>
          <thead>
            <tr>
              <th className="w-16 border-b border-line bg-paper px-2 py-2 text-left fs-12.5 font-medium text-muted" />
              {periods.map((p) => (
                <th key={p.id} className={cn("border-b border-l border-line bg-paper px-1.5 py-2 text-center font-medium", p.kind === "lesson" ? "text-ink" : "w-14 text-muted")}>
                  <span className="block truncate fs-12.5">{p.kind === "lesson" ? `Period ${p.label}` : p.label}</span>
                  <span className="tabular block fs-11.5 font-normal text-muted">{p.startsAt}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day}>
                <th scope="row" className="border-b border-line bg-paper px-2 py-2 text-left fs-13 font-semibold text-ink">
                  {DAY[day]}
                </th>
                {periods.map((p) => {
                  if (p.kind !== "lesson") {
                    return (
                      <td key={p.id} className="border-b border-l border-line bg-[repeating-linear-gradient(135deg,var(--paper),var(--paper)_6px,var(--sunken)_6px,var(--sunken)_7px)] px-1 text-center">
                        {day === days[Math.floor(days.length / 2)] ? <span className="block fs-11 font-medium uppercase tracking-[0.06em] text-muted [writing-mode:vertical-rl]">{p.kind === "assembly" ? "Assembly" : "Break"}</span> : null}
                      </td>
                    );
                  }
                  const s = at(day, p.id);
                  const filled = !!(s && (s.subjectId || s.note));
                  return (
                    <td
                      key={p.id}
                      className={cn("h-16 border-b border-l border-line p-1 align-top", dragFrom && canEdit && "bg-blue-wash/40")}
                      onDragOver={(e) => {
                        if (canEdit && dragFrom) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragFrom && (dragFrom.day !== day || dragFrom.periodId !== p.id)) swap(dragFrom, { day, periodId: p.id });
                        setDragFrom(null);
                      }}
                    >
                      <button
                        type="button"
                        disabled={!canEdit}
                        draggable={canEdit && filled}
                        onDragStart={() => setDragFrom({ day, periodId: p.id })}
                        onDragEnd={() => setDragFrom(null)}
                        onClick={() => canEdit && setEditing({ day, period: p })}
                        aria-label={`${DAY[day]} period ${p.label}: ${s?.subjectName ?? s?.note ?? "free"}`}
                        className={cn(
                          "flex h-full w-full flex-col items-start justify-center overflow-hidden rounded-[10px] px-2 py-1 text-left transition-colors",
                          filled ? tint(s?.subjectId ?? null) : "border border-dashed border-line-strong",
                          canEdit ? (filled ? "cursor-grab hover:ring-2 hover:ring-blue/40 active:cursor-grabbing" : "text-muted hover:border-blue hover:text-blue") : "cursor-default",
                        )}
                      >
                        {filled ? (
                          <>
                            <span className="block w-full truncate font-semibold text-ink" title={s?.subjectName ?? s?.note ?? ""}>
                              {mode === "teacher" ? s?.className : shortName(s?.subjectName ?? null, s?.subjectCode ?? null) || s?.note}
                            </span>
                            <span className="block w-full truncate fs-12 text-body">
                              {mode === "teacher" ? shortName(s?.subjectName ?? null, s?.subjectCode ?? null) : surname(s?.teacherName ?? null)}
                              {s?.room ? ` · ${s.room}` : ""}
                            </span>
                          </>
                        ) : canEdit ? (
                          <Icon name="plus" size={16} className="mx-auto" />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? <p className="mt-2 fs-13 text-muted">Click a period to set the lesson. Drag a lesson onto another period to swap them.</p> : null}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${DAY[editing.day]}, period ${editing.period.label} (${editing.period.startsAt}–${editing.period.endsAt})` : ""}>
        {editing ? (
          <SlotForm
            key={`${editing.day}:${editing.period.id}`}
            slug={slug}
            termId={termId}
            classId={classId!}
            day={editing.day}
            periodId={editing.period.id}
            current={at(editing.day, editing.period.id) ?? null}
            subjects={subjects}
            staff={staff}
            onDone={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        ) : null}
      </Modal>

      <Modal open={!!swapClash} onClose={() => setSwapClash(null)} title="That swap causes a clash">
        {swapClash ? (
          <div className="flex flex-col gap-4">
            <Alert tone="warning">
              {swapClash.clashes.map((c) => (
                <p key={c}>{c}</p>
              ))}
            </Alert>
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setSwapClash(null)}>
                Cancel
              </Button>
              <Button onClick={() => swap(swapClash.a, swapClash.b, true)}>Swap anyway</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function SlotForm({ slug, termId, classId, day, periodId, current, subjects, staff, onDone }: { slug: string; termId: string; classId: string; day: number; periodId: string; current: Slot | null; subjects: Subject[]; staff: { id: string; name: string }[]; onDone: () => void }) {
  const [subjectId, setSubjectId] = useState(current?.subjectId ?? "");
  const [teacherId, setTeacherId] = useState(current?.teacherId ?? "");
  const [room, setRoom] = useState(current?.room ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const [clashes, setClashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(opts: { force?: boolean; clear?: boolean } = {}) {
    setError(null);
    start(async () => {
      const r = await setSlotAction(slug, {
        termId,
        classId,
        day,
        periodId,
        subjectId: opts.clear ? null : subjectId || null,
        teacherId: opts.clear ? null : teacherId || null,
        room: opts.clear ? null : room || null,
        note: opts.clear ? null : note || null,
        force: !!opts.force,
      });
      if (r.error) setError(r.error);
      else if (!r.ok) setClashes(r.clashes);
      else onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Subject" htmlFor="slot-subject">
        <Select
          id="slot-subject"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setClashes([]);
            const assigned = subjects.find((s) => s.id === e.target.value)?.teacherId;
            if (assigned) setTeacherId(assigned);
          }}
        >
          <option value="">Free period</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Teacher" htmlFor="slot-teacher" hint="Filled in from the subject teacher for this class.">
        <Select
          id="slot-teacher"
          value={teacherId}
          onChange={(e) => {
            setTeacherId(e.target.value);
            setClashes([]);
          }}
        >
          <option value="">No teacher</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room (optional)" htmlFor="slot-room">
          <Input id="slot-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Science lab" maxLength={40} />
        </Field>
        <Field label="Note (optional)" htmlFor="slot-note">
          <Input id="slot-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Library period" maxLength={60} />
        </Field>
      </div>
      {clashes.length ? (
        <Alert tone="warning" title="This clashes with another class">
          {clashes.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </Alert>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2">
        {current ? (
          <Button variant="ghost" className="text-danger" disabled={pending} onClick={() => save({ clear: true })}>
            <Icon name="trash" size={16} /> Clear
          </Button>
        ) : (
          <span />
        )}
        {clashes.length ? (
          <Button disabled={pending} onClick={() => save({ force: true })}>
            Save anyway
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => save()}>
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}
