"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { focusLossAction, saveAnswerAction, submitExamAction } from "../../learn/actions";

type Question = { id: string; kind: "objective" | "theory"; body: string; marks: number; options: { i: number; text: string }[] };
type Answer = number | string;
const LETTERS = "ABCDEF";

function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ExamRoom({
  exam,
  questions,
  initialAnswers,
  deadline,
  serverNow,
  initialFocusLosses,
}: {
  exam: { id: string; title: string; subjectName: string };
  questions: Question[];
  initialAnswers: Record<string, Answer>;
  deadline: string;
  serverNow: string;
  initialFocusLosses: number;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(initialAnswers);
  const [saving, setSaving] = useState<"saved" | "saving" | "retrying">("saved");
  const [left, setLeft] = useState<number | null>(null);
  const [warnings, setWarnings] = useState(initialFocusLosses);
  const [showWarning, setShowWarning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const offset = useRef(0);
  const pending = useRef(new Map<string, Answer | null>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const flushing = useRef(false);
  const submitted = useRef(false);

  // Server time minus browser time, so a wrong phone clock can't change the timer.
  useEffect(() => {
    offset.current = Date.parse(serverNow) - Date.now();
  }, [serverNow]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (pending.current.size) {
        const [questionId, answer] = pending.current.entries().next().value as [string, Answer | null];
        setSaving("saving");
        const r = await saveAnswerAction({ examId: exam.id, questionId, answer }).catch(() => ({ ok: false as const, error: "offline", closed: false }));
        if (r.ok) {
          if (pending.current.get(questionId) === answer) pending.current.delete(questionId);
        } else if (r.closed) {
          pending.current.clear();
          setClosed(r.error ?? "This exam has ended.");
          return;
        } else {
          setSaving("retrying");
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
      setSaving("saved");
    } finally {
      flushing.current = false;
    }
  }, [exam.id]);

  const record = useCallback(
    (questionId: string, answer: Answer | null, debounce = 0) => {
      setAnswers((a) => {
        const next = { ...a };
        if (answer === null || answer === "") delete next[questionId];
        else next[questionId] = answer;
        return next;
      });
      const old = timers.current.get(questionId);
      if (old) clearTimeout(old);
      const go = () => {
        pending.current.set(questionId, answer);
        void flush();
      };
      if (debounce) {
        setSaving("saving");
        timers.current.set(questionId, setTimeout(go, debounce));
      } else go();
    },
    [flush],
  );

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    startSubmit(async () => {
      for (const t of timers.current.values()) clearTimeout(t);
      for (const [q, a] of Object.entries(answers)) if (!pending.current.has(q) && initialAnswers[q] !== a) pending.current.set(q, a);
      await flush();
      const r = await submitExamAction(exam.id);
      if (r?.error) {
        submitted.current = false;
        setClosed(r.error);
      }
    });
  }, [answers, exam.id, flush, initialAnswers]);

  // Timer, from the server's deadline.
  useEffect(() => {
    const end = Date.parse(deadline);
    const tick = () => {
      const ms = end - (Date.now() + offset.current);
      setLeft(ms);
      if (ms <= 0) submit();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [deadline, submit]);

  // Leaving the exam screen is recorded and the teacher can see it.
  useEffect(() => {
    let last = 0;
    const lost = () => {
      if (submitted.current || Date.now() - last < 2000) return;
      last = Date.now();
      setShowWarning(true);
      focusLossAction(exam.id).then((n) => n !== null && setWarnings(n));
    };
    const onVis = () => document.visibilityState === "hidden" && lost();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", lost);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!submitted.current && pending.current.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", lost);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [exam.id]);

  const q = questions[index];
  const answered = questions.filter((x) => answers[x.id] !== undefined && answers[x.id] !== "").length;
  const unanswered = questions.length - answered;
  const low = left !== null && left < 5 * 60_000;

  if (closed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-4">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-chunk border-2 border-line bg-canvas p-8 text-center">
          <Icon name="clock" size={36} className="text-brand" />
          <h1 className="fs-22 font-bold">{closed}</h1>
          <p className="fs-15 text-muted">Everything you answered before this was saved.</p>
          <a href={`/learn/exams/${exam.id}`} className="font-semibold text-brand-ink hover:underline">
            See your exam
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate fs-13 font-semibold text-muted">{exam.subjectName}</p>
            <p className="truncate fs-16 font-bold text-ink">{exam.title}</p>
          </div>
          <div
            className={cn("tabular flex items-center gap-1.5 rounded-full px-3.5 py-1.5 fs-17 font-bold", low ? "animate-pulse bg-danger-wash text-danger" : "bg-brand-wash text-brand-ink")}
            role="timer"
            aria-live="off"
            aria-label="Time left"
          >
            <Icon name="clock" size={17} />
            {left === null ? "–:––" : clock(left)}
          </div>
        </div>
        <div className="mx-auto mt-2.5 flex max-w-3xl items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${(answered / questions.length) * 100}%` }} />
          </div>
          <span className="tabular shrink-0 fs-13 font-semibold text-muted">
            {answered}/{questions.length} answered
          </span>
          <span className={cn("shrink-0 fs-12.5 font-medium", saving === "retrying" ? "text-danger" : "text-muted")}>
            {saving === "saved" ? "Saved" : saving === "saving" ? "Saving…" : "Offline, retrying…"}
          </span>
        </div>
      </header>

      {showWarning ? (
        <div className="mx-auto mt-3 w-full max-w-3xl px-4">
          <div role="alert" className="flex items-start gap-3 rounded-chunk border-2 border-warning bg-warning-wash p-3.5 text-warning-deep">
            <Icon name="alert" size={20} className="mt-0.5 shrink-0" />
            <p className="flex-1 fs-14.5">
              You left the exam screen. Your teacher can see this ({warnings} time{warnings === 1 ? "" : "s"}). Stay on this page until you submit.
            </p>
            <button type="button" onClick={() => setShowWarning(false)} aria-label="Dismiss" className="rounded-full p-1 hover:bg-warning/20">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5">
        <div className="flex items-center justify-between">
          <span className="fs-14 font-bold text-muted">
            Question {index + 1} of {questions.length}
          </span>
          <span className="fs-13.5 text-muted">
            {q.marks} mark{q.marks === 1 ? "" : "s"}
          </span>
        </div>
        <p className="whitespace-pre-wrap fs-19 font-semibold leading-snug text-ink">{q.body}</p>
        {q.kind === "objective" ? (
          <ul className="flex flex-col gap-2.5" role="radiogroup" aria-label={`Question ${index + 1} options`}>
            {q.options.map((o, pos) => {
              const on = answers[q.id] === o.i;
              return (
                <li key={o.i}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => record(q.id, on ? null : o.i)}
                    className={cn(
                      "flex w-full items-center gap-3.5 rounded-chunk border-2 bg-canvas p-3.5 text-left transition active:translate-y-[2px]",
                      on ? "border-brand bg-brand-wash shadow-[0_3px_0_var(--brand-deep)] active:shadow-none" : "border-line shadow-[0_3px_0_var(--line)] hover:border-brand/50 active:shadow-none",
                    )}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border-2 fs-14 font-bold", on ? "border-brand bg-brand text-white" : "border-line-strong text-muted")}>{LETTERS[pos]}</span>
                    <span className="fs-16 text-ink">{o.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Textarea
            rows={10}
            value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
            onChange={(e) => record(q.id, e.target.value, 1200)}
            placeholder="Write your answer here. It saves as you type."
            aria-label={`Answer to question ${index + 1}`}
            className="fs-16 leading-relaxed"
          />
        )}
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-line bg-canvas/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button variant="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label="Previous question">
            <Icon name="chevronLeft" size={18} />
          </Button>
          <Button variant="secondary" onClick={() => setMapOpen(true)} className="flex-1 sm:flex-none">
            <Icon name="grid" size={17} /> All questions
          </Button>
          <div className="hidden flex-1 sm:block" />
          {index < questions.length - 1 ? (
            <Button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} className="flex-1 sm:flex-none">
              Next <Icon name="chevronRight" size={18} />
            </Button>
          ) : (
            <Button variant="success" onClick={() => setConfirm(true)} className="flex-1 sm:flex-none">
              <Icon name="check" size={18} strokeWidth={2.6} /> Submit
            </Button>
          )}
        </div>
      </footer>

      <Modal open={mapOpen} onClose={() => setMapOpen(false)} title="All questions">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {questions.map((x, i) => {
              const done = answers[x.id] !== undefined && answers[x.id] !== "";
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    setMapOpen(false);
                  }}
                  aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
                  className={cn(
                    "tabular grid aspect-square place-items-center rounded-chunk border-2 fs-14 font-bold",
                    i === index ? "border-brand text-brand-ink" : done ? "border-success bg-success text-white" : "border-line-strong text-muted",
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="fs-14 text-muted">
            <span className="font-semibold text-ink">{answered}</span> answered · <span className="font-semibold text-ink">{unanswered}</span> left
          </p>
          <Button
            variant="success"
            onClick={() => {
              setMapOpen(false);
              setConfirm(true);
            }}
          >
            Submit exam
          </Button>
        </div>
      </Modal>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit your exam?">
        <div className="flex flex-col gap-4">
          <p className="fs-15 text-body">
            {unanswered ? (
              <>
                You haven&apos;t answered <strong className="text-danger">{unanswered}</strong> question{unanswered === 1 ? "" : "s"}. You can&apos;t change anything after you submit.
              </>
            ) : (
              "You've answered every question. You can't change anything after you submit."
            )}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Keep working
            </Button>
            <Button variant="success" disabled={submitting} onClick={submit}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
