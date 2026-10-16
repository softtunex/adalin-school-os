"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Avatar, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { saveRegisterAction } from "../actions";

type Status = "present" | "late" | "absent" | "excused";
type Row = { id: string; name: string; admissionNo: string; status: Status; note: string | null };
type Queued = { slug: string; classId: string; className: string; date: string; records: { studentId: string; status: Status; note: string | null }[]; savedAt: number };

const QUEUE_KEY = "sos-attendance-queue";

const OPTIONS: { value: Status; label: string; short: string; on: string }[] = [
  { value: "present", label: "Present", short: "P", on: "border-success bg-success text-white shadow-[0_3px_0_var(--success-deep)]" },
  { value: "late", label: "Late", short: "L", on: "border-warning bg-warning text-white shadow-[0_3px_0_var(--warning-deep)]" },
  { value: "absent", label: "Absent", short: "A", on: "border-danger bg-danger text-white shadow-[0_3px_0_var(--danger-deep)]" },
  { value: "excused", label: "Excused", short: "E", on: "border-blue bg-blue text-white shadow-[0_3px_0_var(--blue-deep)]" },
];

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(q: Queued[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // Storage full or blocked: nothing more we can do offline.
  }
}

/** Sends any registers saved while offline. Safe to call repeatedly. */
async function flushQueue(): Promise<number> {
  const queue = readQueue();
  if (!queue.length) return 0;
  const remaining: Queued[] = [];
  let sent = 0;
  for (const item of queue) {
    try {
      const result = await saveRegisterAction(item.slug, item.classId, item.date, item.records);
      if (result.error) remaining.push(item);
      else sent++;
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return sent;
}

export function Register({ slug, classId, className, date, readOnly, initial }: { slug: string; classId: string; className: string; date: string; readOnly: boolean; initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const syncQueued = useCallback(async () => {
    const sent = await flushQueue();
    if (sent) {
      setMessage({ tone: "success", text: `Synced ${sent} register${sent > 1 ? "s" : ""} saved while offline.` });
      router.refresh();
    }
  }, [router]);

  // Send anything saved offline once the page is up, and again whenever the connection returns.
  useEffect(() => {
    const timer = setTimeout(syncQueued, 0);
    window.addEventListener("online", syncQueued);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", syncQueued);
    };
  }, [syncQueued]);

  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {} as Record<Status, number>);

  function setStatus(id: string, status: Status) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status, note: status === "absent" || status === "excused" ? r.note : null } : r)));
    setDirty(true);
    setMessage(null);
  }

  function save() {
    const records = rows.map((r) => ({ studentId: r.id, status: r.status, note: r.note }));
    startTransition(async () => {
      try {
        const result = await saveRegisterAction(slug, classId, date, records);
        if (result.error) setMessage({ tone: "danger", text: result.error });
        else {
          setDirty(false);
          setMessage({ tone: "success", text: `Register saved: ${result.present} in school, ${result.absent} absent.` });
          router.refresh();
        }
      } catch {
        // No network: keep it on this phone and send it when the connection returns.
        writeQueue([...readQueue().filter((q) => !(q.classId === classId && q.date === date)), { slug, classId, className, date, records, savedAt: Date.now() }]);
        setDirty(false);
        setMessage({ tone: "warning", text: "No connection. The register is saved on this device and will send automatically when you're back online." });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {!readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-muted">Everyone starts as present. Tap the few who aren&apos;t.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRows((prev) => prev.map((r) => ({ ...r, status: "present", note: null })));
              setDirty(true);
            }}
          >
            <Icon name="checkCircle" size={16} /> Mark all present
          </Button>
        </div>
      ) : null}

      <Card className="divide-y divide-line">
        {rows.map((r, i) => (
          <div key={r.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5", r.status === "absent" && "bg-danger-wash/60")}>
            <span className="tabular w-6 text-right text-[13px] text-muted">{i + 1}</span>
            <Avatar name={r.name} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{r.name}</p>
              <p className="font-mono text-[12px] text-muted">{r.admissionNo}</p>
            </div>
            <div role="radiogroup" aria-label={`Attendance for ${r.name}`} className="flex gap-1.5">
              {OPTIONS.map((o) => {
                const on = r.status === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={o.label}
                    title={o.label}
                    disabled={readOnly}
                    onClick={() => setStatus(r.id, o.value)}
                    className={cn(
                      "grid size-11 place-items-center rounded-[12px] border-2 text-[14px] font-extrabold transition-[transform,box-shadow] active:translate-y-[3px] active:shadow-none disabled:cursor-default disabled:active:translate-y-0",
                      on ? o.on : "border-line-strong bg-canvas text-muted shadow-[0_3px_0_var(--line-strong)] hover:text-ink",
                    )}
                  >
                    {o.short}
                  </button>
                );
              })}
            </div>
            {(r.status === "absent" || r.status === "excused") && !readOnly ? (
              <input
                type="text"
                value={r.note ?? ""}
                maxLength={200}
                placeholder="Reason (optional)"
                aria-label={`Reason for ${r.name}`}
                onChange={(e) => {
                  const note = e.target.value;
                  setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, note } : x)));
                  setDirty(true);
                }}
                className="h-10 w-full rounded-chunk border border-line-strong bg-canvas px-3 text-[14px] sm:ml-[92px]"
              />
            ) : null}
          </div>
        ))}
      </Card>

      {!readOnly ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] backdrop-blur lg:left-[288px] sm:px-8">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
            <p className="tabular text-[14px] text-body">
              <span className="font-semibold text-success">{(counts.present ?? 0) + (counts.late ?? 0)} in</span>
              {" · "}
              <span className={counts.absent ? "font-semibold text-danger" : undefined}>{counts.absent ?? 0} absent</span>
              {counts.late ? ` · ${counts.late} late` : ""}
              {counts.excused ? ` · ${counts.excused} excused` : ""}
            </p>
            <Button onClick={save} disabled={pending} size="lg">
              {pending ? "Saving…" : dirty ? "Save register" : "Save register again"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
