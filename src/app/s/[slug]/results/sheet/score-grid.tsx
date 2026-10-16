"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { gradeFor, rank, type Band } from "@/lib/results/compute";
import { saveScoresAction, setSheetStatusAction } from "../actions";

type Component = { id: string; name: string; maxScore: number };
type Student = { id: string; name: string; admissionNo: string };
type Entry = { studentId: string; componentId: string; score: number | null };

const key = (studentId: string, componentId: string) => `${studentId}|${componentId}`;

function parse(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return "invalid";
  return Number(t);
}

export function ScoreGrid({
  slug,
  classId,
  subjectId,
  components,
  bands,
  students,
  initial,
  editable,
  canSubmit,
  canReopen,
}: {
  slug: string;
  classId: string;
  subjectId: string;
  components: Component[];
  bands: Band[];
  students: Student[];
  initial: Entry[];
  editable: boolean;
  canSubmit: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(initial.map((e) => [key(e.studentId, e.componentId), e.score === null ? "" : String(e.score)])));
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"submit" | "reopen" | null>(null);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const flush = useCallback(
    async (keys: Set<string>, vals: Record<string, string>) => {
      if (keys.size === 0) return;
      const entries: Entry[] = [];
      for (const k of keys) {
        const [studentId, componentId] = k.split("|");
        const p = parse(vals[k] ?? "");
        const comp = components.find((c) => c.id === componentId)!;
        if (p === "invalid" || (p !== null && p > comp.maxScore)) continue;
        entries.push({ studentId, componentId, score: p });
      }
      if (!entries.length) return;
      setSaveState("saving");
      try {
        const result = await saveScoresAction(slug, classId, subjectId, entries);
        if (result.error) {
          setSaveState("error");
          setError(result.error);
          return;
        }
        setPendingKeys((prev) => {
          const next = new Set(prev);
          for (const e of entries) next.delete(key(e.studentId, e.componentId));
          return next;
        });
        setSaveState("saved");
        setError(null);
      } catch {
        // Network dropped: keep the pending cells and retry when back online.
        setSaveState("offline");
      }
    },
    [slug, classId, subjectId, components],
  );

  // Save shortly after typing stops.
  useEffect(() => {
    if (pendingKeys.size === 0) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(pendingKeys, values), 700);
    return () => clearTimeout(timer.current);
  }, [pendingKeys, values, flush]);

  useEffect(() => {
    const retry = () => void flush(pendingKeys, values);
    window.addEventListener("online", retry);
    const warn = (e: BeforeUnloadEvent) => {
      if (pendingKeys.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("beforeunload", warn);
    };
  }, [pendingKeys, values, flush]);

  const totals = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const s of students) {
      let any = false;
      let t = 0;
      for (const c of components) {
        const p = parse(values[key(s.id, c.id)] ?? "");
        if (typeof p === "number" && p <= c.maxScore) {
          any = true;
          t += p;
        }
      }
      out.set(s.id, any ? Math.round(t * 100) / 100 : null);
    }
    return out;
  }, [students, components, values]);
  const positions = useMemo(() => rank(students, (s) => totals.get(s.id) ?? null), [students, totals]);

  const blanks = students.reduce((n, s) => n + components.filter((c) => !(values[key(s.id, c.id)] ?? "").trim()).length, 0);
  const invalid = students.some((s) => components.some((c) => {
    const p = parse(values[key(s.id, c.id)] ?? "");
    return p === "invalid" || (typeof p === "number" && p > c.maxScore);
  }));

  function move(row: number, col: number) {
    const s = students[row];
    const c = components[col];
    if (!s || !c) return;
    const el = inputs.current.get(key(s.id, c.id));
    el?.focus();
    el?.select();
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 fs-14.5">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-paper px-4 py-3 text-left fs-13.5 font-medium text-muted">Student</th>
                {components.map((c) => (
                  <th key={c.id} className="bg-paper px-2 py-3 text-center fs-13.5 font-medium text-muted">
                    {c.name}
                    <span className="block fs-12 font-normal">/ {c.maxScore}</span>
                  </th>
                ))}
                <th className="bg-paper px-3 py-3 text-center fs-13.5 font-medium text-muted">Total</th>
                <th className="bg-paper px-3 py-3 text-center fs-13.5 font-medium text-muted">Grade</th>
                <th className="bg-paper px-3 py-3 text-center fs-13.5 font-medium text-muted">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, row) => {
                const total = totals.get(s.id) ?? null;
                const band = total === null ? null : gradeFor(total, bands);
                const pos = positions.get(s) ?? null;
                return (
                  <tr key={s.id} className="group hover:bg-paper">
                    <td className="sticky left-0 z-10 border-b border-line bg-canvas px-4 py-2 group-hover:bg-paper">
                      <p className="max-w-[220px] truncate font-medium text-ink">{s.name}</p>
                      <p className="font-mono fs-12 text-muted">{s.admissionNo}</p>
                    </td>
                    {components.map((c, col) => {
                      const k = key(s.id, c.id);
                      const raw = values[k] ?? "";
                      const p = parse(raw);
                      const bad = p === "invalid" || (typeof p === "number" && p > c.maxScore);
                      return (
                        <td key={c.id} className="border-b border-line px-2 py-2 text-center">
                          <input
                            ref={(el) => {
                              if (el) inputs.current.set(k, el);
                              else inputs.current.delete(k);
                            }}
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`${c.name} for ${s.name}`}
                            aria-invalid={bad}
                            disabled={!editable}
                            value={raw}
                            onChange={(e) => {
                              const v = e.target.value;
                              setValues((prev) => ({ ...prev, [k]: v }));
                              setPendingKeys((prev) => new Set(prev).add(k));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "ArrowDown") {
                                e.preventDefault();
                                move(row + 1, col);
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                move(row - 1, col);
                              } else if (e.key === "ArrowRight" && (e.currentTarget.selectionStart ?? 0) >= raw.length) {
                                move(row, col + 1);
                              } else if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 0) === 0) {
                                move(row, col - 1);
                              }
                            }}
                            onFocus={(e) => e.currentTarget.select()}
                            className={cn(
                              "tabular h-10 w-[72px] rounded-[10px] border text-center fs-15 font-medium text-ink focus:outline-none disabled:bg-sunken disabled:text-body",
                              bad ? "border-danger bg-danger-wash focus:shadow-[0_0_0_3px_var(--danger-wash)]" : "border-line-strong bg-canvas focus:border-blue focus:shadow-[0_0_0_3px_var(--blue-wash)]",
                            )}
                          />
                        </td>
                      );
                    })}
                    <td className="tabular border-b border-line px-3 py-2 text-center font-semibold text-ink">{total ?? "—"}</td>
                    <td className="border-b border-line px-3 py-2 text-center">
                      {band ? <span className={cn("inline-grid h-7 min-w-9 place-items-center rounded-md px-1.5 fs-13 font-bold", band.passes ? "bg-success-wash text-success" : "bg-danger-wash text-danger")}>{band.grade}</span> : <span className="text-muted">—</span>}
                    </td>
                    <td className="tabular border-b border-line px-3 py-2 text-center text-body">{pos ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] backdrop-blur lg:left-[288px] sm:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 fs-14 text-body" aria-live="polite">
            {saveState === "saving" ? (
              <>
                <Icon name="refresh" size={16} className="animate-spin text-muted" /> Saving…
              </>
            ) : saveState === "offline" ? (
              <>
                <Icon name="alert" size={16} className="text-warning" /> No connection. Your scores are kept here and will save when you&apos;re back online.
              </>
            ) : saveState === "error" ? (
              <>
                <Icon name="alert" size={16} className="text-danger" /> Not saved
              </>
            ) : pendingKeys.size ? (
              <>Unsaved changes</>
            ) : saveState === "saved" ? (
              <>
                <Icon name="check" size={16} className="text-success" /> All changes saved
              </>
            ) : (
              <>Scores save automatically as you type.</>
            )}
            {invalid ? <span className="font-medium text-danger"> · Fix the red cells</span> : null}
          </p>
          <div className="flex gap-2">
            {canReopen ? (
              <Button variant="secondary" onClick={() => setConfirm("reopen")}>
                Reopen for teacher
              </Button>
            ) : null}
            {canSubmit ? (
              <Button onClick={() => setConfirm("submit")} disabled={invalid || pendingKeys.size > 0}>
                Submit scores
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "submit"}
        onClose={() => setConfirm(null)}
        title="Submit these scores?"
        confirmLabel="Submit scores"
        onConfirm={async () => {
          const result = await setSheetStatusAction(slug, classId, subjectId, "submitted");
          if (!result.error) startTransition(() => router.refresh());
          return result;
        }}
      >
        {blanks > 0
          ? `${blanks} score${blanks === 1 ? " is" : "s are"} still empty and will count as zero. After submitting, only your class teacher can reopen the sheet.`
          : "Every score is filled in. After submitting, only your class teacher can reopen the sheet."}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "reopen"}
        onClose={() => setConfirm(null)}
        title="Reopen this sheet?"
        confirmLabel="Reopen"
        onConfirm={async () => {
          const result = await setSheetStatusAction(slug, classId, subjectId, "draft");
          if (!result.error) startTransition(() => router.refresh());
          return result;
        }}
      >
        The subject teacher will be able to change scores again and must resubmit.
      </ConfirmDialog>
    </div>
  );
}
