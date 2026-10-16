"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { deleteEventAction, saveEventAction } from "../announcements/actions";

export type CalEvent = { id: string; title: string; kind: string; startsOn: string; endsOn: string; details: string | null; forParents: boolean };

export const KIND_LABEL: Record<string, string> = { event: "Event", holiday: "Holiday", exam: "Exams", meeting: "Meeting", sports: "Sports", other: "Other" };
export const KIND_CLASS: Record<string, string> = {
  event: "bg-blue-wash text-blue border-blue/25",
  holiday: "bg-success-wash text-success border-success/25",
  exam: "bg-violet-wash text-violet border-violet/25",
  meeting: "bg-warning-wash text-warning border-warning/30",
  sports: "bg-brand-wash text-brand-ink border-brand/30",
  other: "bg-sunken text-body border-line-strong",
};

function EventForm({ slug, event, day, onDone }: { slug: string; event?: CalEvent; day?: string; onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(saveEventAction.bind(null, slug), initialFormState);
  const [removing, setRemoving] = useState(false);
  const fe = state.fieldErrors ?? {};
  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{state.success}</Alert>
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="What's happening" htmlFor="ev-title" error={fe.title}>
        <Input id="ev-title" name="title" defaultValue={state.values?.title ?? event?.title} placeholder="e.g. PTA meeting" aria-invalid={!!fe.title} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type" htmlFor="ev-kind">
          <Select id="ev-kind" name="kind" defaultValue={state.values?.kind ?? event?.kind ?? "event"}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="ev-start" error={fe.startsOn}>
          <Input id="ev-start" name="startsOn" type="date" defaultValue={state.values?.startsOn ?? event?.startsOn ?? day} />
        </Field>
        <Field label="To (optional)" htmlFor="ev-end" error={fe.endsOn}>
          <Input id="ev-end" name="endsOn" type="date" defaultValue={state.values?.endsOn ?? (event && event.endsOn !== event.startsOn ? event.endsOn : "")} />
        </Field>
      </div>
      <Field label="Details (optional)" htmlFor="ev-details">
        <Textarea id="ev-details" name="details" rows={3} defaultValue={state.values?.details ?? event?.details ?? ""} />
      </Field>
      <Checkbox name="forParents" defaultChecked={event ? event.forParents : true} label="Show parents" description="Untick for staff-only dates such as training days." />
      <div className="flex flex-wrap justify-between gap-2">
        {event ? (
          <Button
            variant="ghost"
            className="text-danger"
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              const r = await deleteEventAction(slug, event.id);
              setRemoving(false);
              if (!r.error) {
                onDone();
                router.refresh();
              }
            }}
          >
            <Icon name="trash" size={16} /> Remove
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton>{event ? "Save event" : "Add to calendar"}</SubmitButton>
      </div>
    </form>
  );
}

/** The month grid. Days and event chips open the add/edit dialog for people who can edit. */
export function MonthGrid({ slug, month, today, events, editable }: { slug: string; month: string; today: string; events: CalEvent[]; editable: boolean }) {
  const [dialog, setDialog] = useState<{ event?: CalEvent; day?: string } | null>(null);
  const [key, setKey] = useState(0);
  const first = new Date(`${month}-01T12:00:00Z`);
  const startPad = (first.getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((startPad + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = i - startPad + 1;
    return d >= 1 && d <= daysInMonth ? `${month}-${String(d).padStart(2, "0")}` : null;
  });
  const open = (v: { event?: CalEvent; day?: string }) => {
    if (!editable) return;
    setKey((k) => k + 1);
    setDialog(v);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 overflow-hidden rounded-card border border-line">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="border-b border-line bg-paper px-2 py-2 text-center fs-12.5 font-semibold text-muted">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            const items = day ? events.filter((e) => e.startsOn <= day && e.endsOn >= day) : [];
            const weekend = i % 7 >= 5;
            return (
              <div
                key={i}
                className={cn("min-h-24 border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0", !day && "bg-paper/60", weekend && day && "bg-paper/40")}
                onClick={() => day && open({ day })}
                role={editable && day ? "button" : undefined}
                aria-label={editable && day ? `Add an event on ${day}` : undefined}
              >
                {day ? (
                  <span className={cn("tabular grid size-7 place-items-center rounded-full fs-13 font-semibold", day === today ? "bg-brand text-white" : "text-body")}>{Number(day.slice(8))}</span>
                ) : null}
                <div className="mt-1 flex flex-col gap-1">
                  {items.slice(0, 3).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        open({ event: e });
                      }}
                      className={cn("truncate rounded-md border px-1.5 py-0.5 text-left fs-12 font-medium", KIND_CLASS[e.kind])}
                      title={e.title}
                    >
                      {!e.forParents ? <Icon name="lock" size={11} className="mr-1 inline" /> : null}
                      {e.title}
                    </button>
                  ))}
                  {items.length > 3 ? <span className="px-1 fs-11.5 text-muted">+{items.length - 3} more</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Modal open={!!dialog} onClose={() => setDialog(null)} title={dialog?.event ? "Edit event" : "Add to calendar"}>
        {dialog ? <EventForm key={key} slug={slug} event={dialog.event} day={dialog.day} onDone={() => setDialog(null)} /> : null}
      </Modal>
    </>
  );
}

export function AddEventButton({ slug, today }: { slug: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Icon name="plus" size={18} strokeWidth={2.4} /> Add event
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add to calendar">
        <EventForm key={key} slug={slug} day={today} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
