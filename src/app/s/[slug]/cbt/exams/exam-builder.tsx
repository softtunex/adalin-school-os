"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { bankAction, saveExamAction } from "../actions";

type SubjectOption = { subjectId: string; subjectName: string; classes: { id: string; name: string; levelId: string }[] };
type BankItem = { id: string; kind: "objective" | "theory"; body: string; marks: number; topic: string | null; levelId: string | null; options: string[]; answer: number | null };
export type ExamDraft = {
  id: string;
  subjectId: string;
  classIds: string[];
  title: string;
  instructions: string;
  durationMins: number;
  opensAt: string;
  closesAt: string;
  shuffle: boolean;
  showScore: boolean;
  componentId: string | null;
  questionIds: string[];
  status: string;
};

export function ExamBuilder({
  slug,
  subjects,
  components,
  defaults,
  editing,
  initialBank,
}: {
  slug: string;
  subjects: SubjectOption[];
  components: { id: string; name: string; maxScore: number }[];
  defaults: { opensAt: string; closesAt: string };
  editing?: ExamDraft;
  initialBank: BankItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subjectId, setSubjectId] = useState(editing?.subjectId ?? subjects[0]?.subjectId ?? "");
  const [classIds, setClassIds] = useState<string[]>(editing?.classIds ?? []);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [instructions, setInstructions] = useState(editing?.instructions ?? "Answer all questions. Your answers save as you go.");
  const [duration, setDuration] = useState(String(editing?.durationMins ?? 40));
  const [opensAt, setOpensAt] = useState(editing?.opensAt ?? defaults.opensAt);
  const [closesAt, setClosesAt] = useState(editing?.closesAt ?? defaults.closesAt);
  const [shuffle, setShuffle] = useState(editing?.shuffle ?? true);
  const [showScore, setShowScore] = useState(editing?.showScore ?? true);
  const [componentId, setComponentId] = useState(editing?.componentId ?? "");
  const [picked, setPicked] = useState<string[]>(editing?.questionIds ?? []);
  const [bank, setBank] = useState<BankItem[]>(initialBank);
  const [loadedFor, setLoadedFor] = useState(editing?.subjectId ?? subjects[0]?.subjectId ?? "");
  const [kind, setKind] = useState<"" | "objective" | "theory">("");
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});

  const subject = subjects.find((s) => s.subjectId === subjectId);
  const levels = new Set(subject?.classes.filter((c) => classIds.includes(c.id)).map((c) => c.levelId));

  useEffect(() => {
    if (!subjectId || subjectId === loadedFor) return;
    let live = true;
    bankAction(slug, subjectId).then((rows) => {
      if (!live) return;
      setBank(rows as BankItem[]);
      setLoadedFor(subjectId);
    });
    return () => {
      live = false;
    };
  }, [slug, subjectId, loadedFor]);

  const shown = bank.filter((q) => (!kind || q.kind === kind) && (!q.levelId || levels.size === 0 || levels.has(q.levelId)));
  const chosen = bank.filter((q) => picked.includes(q.id));
  const totalMarks = chosen.reduce((t, q) => t + q.marks, 0);

  function save(publish: boolean) {
    setError(null);
    setFe({});
    start(async () => {
      const r = await saveExamAction(slug, {
        id: editing?.id,
        subjectId,
        classIds,
        title,
        instructions,
        durationMins: Number(duration),
        opensAt,
        closesAt,
        shuffle,
        showScore,
        componentId,
        questionIds: picked,
        publish,
      });
      if (r.fieldErrors) setFe(r.fieldErrors);
      if (r.error) return setError(r.error);
      router.push(`/s/${slug}/cbt/exams/${r.data?.id}`);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="fs-16 font-semibold">Exam details</h2>
          <Field label="Subject" htmlFor="ex-subject" error={fe.subjectId}>
            <Select
              id="ex-subject"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setClassIds([]);
                setPicked([]);
              }}
              disabled={!!editing}
            >
              {subjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset>
            <legend className="mb-2 fs-14 font-semibold text-ink">Classes</legend>
            <div className="flex flex-wrap gap-2">
              {subject?.classes.map((c) => {
                const on = classIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setClassIds((all) => (on ? all.filter((x) => x !== c.id) : [...all, c.id]))}
                    className={cn("inline-flex h-10 items-center gap-1.5 rounded-full border-2 px-3.5 fs-14 font-medium", on ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong text-body hover:bg-paper")}
                  >
                    {on ? <Icon name="check" size={15} strokeWidth={3} /> : null}
                    {c.name}
                  </button>
                );
              })}
            </div>
            {fe.classIds ? <p className="mt-1.5 fs-13.5 text-danger">{fe.classIds}</p> : null}
          </fieldset>
          <Field label="Title" htmlFor="ex-title" error={fe.title}>
            <Input id="ex-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. First CA test" />
          </Field>
          <Field label="Instructions" htmlFor="ex-ins">
            <Textarea id="ex-ins" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Time allowed (min)" htmlFor="ex-dur" error={fe.durationMins}>
              <Input id="ex-dur" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
            <Field label="Opens" htmlFor="ex-open" error={fe.opensAt}>
              <Input id="ex-open" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </Field>
            <Field label="Closes" htmlFor="ex-close" error={fe.closesAt}>
              <Input id="ex-close" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </Field>
          </div>
          <Field label="Counts towards (optional)" htmlFor="ex-comp" hint="Scores are scaled into this CA column when you send them.">
            <Select id="ex-comp" value={componentId} onChange={(e) => setComponentId(e.target.value)}>
              <option value="">Not part of CA</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (out of {c.maxScore})
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} label="Shuffle questions and options" description="Every student gets a different order, so copying from a neighbour doesn't help." />
          <Checkbox checked={showScore} onChange={(e) => setShowScore(e.target.checked)} label="Show students their score" description="Objective scores show straight away; theory once you've marked it." />
        </Card>
      </div>

      <Card className="flex flex-col overflow-hidden p-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="fs-16 font-semibold">Questions</h2>
            <p className="fs-13.5 text-muted">
              <span className="tabular font-semibold text-ink">{picked.length}</span> picked · <span className="tabular font-semibold text-ink">{totalMarks}</span> marks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select aria-label="Show" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10 w-36">
              <option value="">All types</option>
              <option value="objective">Objective</option>
              <option value="theory">Theory</option>
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const ids = shown.map((q) => q.id);
                const all = ids.every((id) => picked.includes(id));
                setPicked((p) => (all ? p.filter((id) => !ids.includes(id)) : [...new Set([...p, ...ids])]));
              }}
              disabled={!shown.length}
            >
              {shown.length && shown.every((q) => picked.includes(q.id)) ? "Clear" : "Pick all"}
            </Button>
          </div>
        </div>
        {fe.questionIds ? (
          <div className="px-5 pt-3">
            <Alert tone="danger">{fe.questionIds}</Alert>
          </div>
        ) : null}
        <ul className="flex-1 overflow-y-auto">
          {loadedFor !== subjectId ? <li className="px-5 py-10 text-center fs-14 text-muted">Loading the bank…</li> : null}
          {loadedFor === subjectId && shown.length === 0 ? (
            <li className="flex flex-col items-center gap-2 px-5 py-10 text-center fs-14 text-muted">
              No {kind || ""} questions for {subject?.subjectName ?? "this subject"} yet.
              <Link href={`/s/${slug}/cbt?tab=bank`} className="font-semibold text-brand-ink hover:underline">
                Add some to the bank
              </Link>
            </li>
          ) : null}
          {loadedFor === subjectId &&
            shown.map((q) => {
              const on = picked.includes(q.id);
              return (
                <li key={q.id} className="border-b border-line last:border-b-0">
                  <label className={cn("flex cursor-pointer gap-3 px-5 py-3.5", on ? "bg-brand-wash/50" : "hover:bg-paper")}>
                    <input type="checkbox" className="mt-1 size-4 accent-[var(--brand)]" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== q.id) : [...p, q.id]))} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block fs-14.5 text-ink">{q.body}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 fs-13 text-muted">
                        <Badge tone={q.kind === "objective" ? "success" : "blue"}>{q.kind === "objective" ? "Objective" : "Theory"}</Badge>
                        {q.marks} mark{q.marks === 1 ? "" : "s"}
                        {q.topic ? ` · ${q.topic}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
        </ul>
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {!editing || editing.status === "draft" ? (
              <Button variant="secondary" disabled={pending} onClick={() => save(false)}>
                Save draft
              </Button>
            ) : null}
            <Button disabled={pending} onClick={() => save(true)}>
              <Icon name="send" size={16} /> {pending ? "Saving…" : editing && editing.status !== "draft" ? "Save changes" : "Schedule exam"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
