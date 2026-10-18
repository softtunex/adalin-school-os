"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { cancelLeaveAction, clockAction, decideLeaveAction, markStaffAction, requestLeaveAction } from "./actions";

/** Big friendly clock-in card: live time, then the clock-in and clock-out times. */
export function ClockCard({
  slug,
  clockedIn,
  clockedOut,
  status,
  onLeave,
  workday,
  holiday = null,
  closed,
  resumeAt,
  compact,
}: {
  slug: string;
  clockedIn: string | null;
  clockedOut: string | null;
  status: string | null;
  onLeave: string | null;
  workday: boolean;
  /** The school calendar's holiday today, if that's why there's no school. */
  holiday?: string | null;
  closed: boolean;
  resumeAt: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);
  const go = (d: "in" | "out") =>
    start(async () => {
      const r = await clockAction(slug, d);
      setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Done." });
      if (!r.error) router.refresh();
    });
  return (
    <Card className={cn("flex flex-wrap items-center gap-4", compact ? "p-4" : "p-5 sm:p-6")}>
      <span
        className={cn("grid shrink-0 place-items-center rounded-chunk", clockedIn ? "bg-success-wash text-success" : "bg-brand-wash text-brand", compact ? "size-11" : "size-14")}
      >
        <Icon name={clockedIn ? "userCheck" : "clock"} size={compact ? 22 : 26} />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="fs-13.5 font-semibold text-muted">{now ?? " "}</p>
        <p className={cn("font-bold text-ink", compact ? "fs-16" : "fs-19")}>
          {onLeave
            ? `You're on ${onLeave.toLowerCase()} today`
            : clockedOut
              ? `Done for today: in ${clockedIn}, out ${clockedOut}`
              : clockedIn
                ? `In since ${clockedIn}${status === "late" ? " (late)" : ""}`
                : !workday
                  ? holiday
                    ? `No school today: ${holiday}`
                    : "No school today"
                  : closed
                    ? "The school day is over"
                    : `Not clocked in yet · school resumes ${resumeAt}`}
        </p>
        {msg ? <p className={cn("mt-1 fs-13.5", msg.tone === "danger" ? "text-danger" : "text-success-deep")}>{msg.text}</p> : null}
      </div>
      {onLeave ? null : !clockedIn ? (
        closed || !workday ? null : (
          <Button size={compact ? "md" : "lg"} disabled={pending} onClick={() => go("in")}>
            <Icon name="check" size={18} strokeWidth={2.6} /> {pending ? "Clocking in…" : "Clock in"}
          </Button>
        )
      ) : !clockedOut ? (
        <Button variant="secondary" size={compact ? "md" : "lg"} disabled={pending} onClick={() => go("out")}>
          {pending ? "Clocking out…" : "Clock out"}
        </Button>
      ) : null}
    </Card>
  );
}

export function RequestLeaveButton({ slug, kinds, today }: { slug: string; kinds: { kind: string; label: string; left: number | null }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Request leave
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="Request leave"
      >
        <LeaveForm key={key} slug={slug} kinds={kinds} today={today} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function LeaveForm({ slug, kinds, today, onDone }: { slug: string; kinds: { kind: string; label: string; left: number | null }[]; today: string; onDone: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(requestLeaveAction.bind(null, slug), initialFormState);
  const fe = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.success) {
      router.refresh();
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
  }, [state, router, onDone]);
  if (state.success) return <Alert tone="success">{state.success}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Type of leave" htmlFor="lv-kind" error={fe.kind}>
        <Select id="lv-kind" name="kind" defaultValue={state.values?.kind ?? "annual"}>
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
              {k.left !== null ? ` (${k.left} day${k.left === 1 ? "" : "s"} left)` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" htmlFor="lv-start" error={fe.startsOn}>
          <Input id="lv-start" name="startsOn" type="date" min={today} defaultValue={state.values?.startsOn} />
        </Field>
        <Field label="Last day" htmlFor="lv-end" error={fe.endsOn}>
          <Input id="lv-end" name="endsOn" type="date" min={today} defaultValue={state.values?.endsOn} />
        </Field>
      </div>
      <Field label="Reason" htmlFor="lv-reason" hint="Your manager sees this.">
        <Textarea id="lv-reason" name="reason" rows={3} defaultValue={state.values?.reason} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>Send request</SubmitButton>
      </div>
    </form>
  );
}

export function CancelLeave({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await cancelLeaveAction(slug, id);
          router.refresh();
        })
      }
    >
      Cancel
    </Button>
  );
}

export function LeaveDecision({ slug, id, name }: { slug: string; id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideLeaveAction(slug, { id, approve, note });
      if (r.error) return setError(r.error);
      setDeclining(false);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? <span className="fs-13 text-danger">{error}</span> : null}
      <Button size="sm" variant="success" disabled={pending} onClick={() => decide(true)}>
        Approve
      </Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDeclining(true)}>
        Decline
      </Button>
      <Modal open={declining} onClose={() => setDeclining(false)} title={`Decline ${name}'s leave?`}>
        <div className="flex flex-col gap-4">
          <Field label="Reason" htmlFor={`dl-${id}`} hint="They'll see this.">
            <Textarea id={`dl-${id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeclining(false)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={pending || !note.trim()} onClick={() => decide(false)}>
              Decline
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const MARKS = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "On leave" },
];

/** Lets a manager set someone's day (forgot to clock in, out on school business, sick). */
export function MarkDay({ slug, membershipId, date, status }: { slug: string; membershipId: string; date: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center justify-end gap-2">
      {error ? <span className="fs-12.5 text-danger">{error}</span> : null}
      <Select
        aria-label="Set status"
        className="h-9 w-32 fs-13.5"
        value={["present", "late", "absent", "leave"].includes(status) ? status : ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await markStaffAction(slug, { membershipId, date, status: e.target.value, note: "" });
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        <option value="" disabled>
          Mark…
        </option>
        {MARKS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
