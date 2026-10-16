"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { markTheoryAction } from "../../actions";

type Q = { id: string; number: number; body: string; marks: number; answer: string; given: number | null };

export function TheoryMarks({ slug, attemptId, examId, nextToMark, questions }: { slug: string; attemptId: string; examId: string; nextToMark: string | null; questions: Q[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marks, setMarks] = useState<Record<string, string>>(() => Object.fromEntries(questions.map((q) => [q.id, q.given === null ? "" : String(q.given)])));
  const [error, setError] = useState<string | null>(null);
  const total = questions.reduce((t, q) => t + (Number(marks[q.id]) || 0), 0);

  function save() {
    const out: Record<string, number> = {};
    for (const q of questions) {
      const v = marks[q.id].trim();
      const n = Number(v);
      if (v === "" || !Number.isFinite(n) || n < 0 || n > q.marks) return setError(`Question ${q.number}: give a mark from 0 to ${q.marks}.`);
      out[q.id] = n;
    }
    setError(null);
    start(async () => {
      const r = await markTheoryAction(slug, { attemptId, marks: out });
      if (r.error) return setError(r.error);
      router.push(nextToMark ? `/s/${slug}/cbt/scripts/${nextToMark}` : `/s/${slug}/cbt/exams/${examId}`);
      router.refresh();
    });
  }

  return (
    <>
      {questions.map((q) => (
        <Card key={q.id} className="flex flex-col gap-3 border-blue/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="whitespace-pre-wrap fs-14.5 text-ink">
              <span className="mr-2 font-semibold text-muted">{q.number}.</span>
              {q.body}
            </p>
            <span className="shrink-0 fs-13 text-muted">{q.marks} marks</span>
          </div>
          <div className="rounded-chunk bg-paper p-3.5">
            {q.answer ? <p className="whitespace-pre-wrap fs-15 leading-relaxed text-ink">{q.answer}</p> : <p className="fs-14 italic text-muted">No answer written.</p>}
          </div>
          <label className="flex items-center gap-2 self-end">
            <span className="fs-14 font-semibold text-ink">Mark</span>
            <span className="w-20">
              <Input inputMode="decimal" className="h-10 text-center tabular" value={marks[q.id]} onChange={(e) => setMarks((m) => ({ ...m, [q.id]: e.target.value }))} aria-label={`Mark for question ${q.number}`} />
            </span>
            <span className="whitespace-nowrap fs-14 text-muted">/ {q.marks}</span>
          </label>
        </Card>
      ))}
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-canvas/95 py-3 backdrop-blur">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex items-center justify-between gap-3">
          <span className="fs-14 text-muted">
            Theory total <span className="tabular font-semibold text-ink">{total}</span>
          </span>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : nextToMark ? "Save and next script" : "Save marks"}
          </Button>
        </div>
      </div>
    </>
  );
}
