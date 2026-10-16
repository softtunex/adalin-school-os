"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { deleteQuestionAction, importQuestionsAction, saveQuestionAction } from "./actions";

export type Opt = { id: string; name: string };
export type BankQuestion = { id: string; subjectId: string; levelId: string | null; topic: string | null; kind: "objective" | "theory"; body: string; options: string[]; answer: number | null; marks: number };

const LETTERS = "ABCDEF";

export function BankButtons({ slug, subjects, levels }: { slug: string; subjects: Opt[]; levels: Opt[] }) {
  const [open, setOpen] = useState<null | "add" | "import">(null);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(null);
    setKey((k) => k + 1);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setOpen("import")} disabled={!subjects.length}>
        <Icon name="upload" size={17} /> Paste questions
      </Button>
      <Button onClick={() => setOpen("add")} disabled={!subjects.length}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Add question
      </Button>
      <Modal open={open === "add"} onClose={close} title="Add a question">
        <QuestionForm key={`a${key}`} slug={slug} subjects={subjects} levels={levels} onDone={close} />
      </Modal>
      <Modal open={open === "import"} onClose={close} title="Paste questions">
        <ImportForm key={`i${key}`} slug={slug} subjects={subjects} levels={levels} onDone={close} />
      </Modal>
    </div>
  );
}

export function QuestionActions({ slug, question, subjects, levels, locked }: { slug: string; question: BankQuestion; subjects: Opt[]; levels: Opt[]; locked: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  return (
    <>
      <RowMenu
        items={[
          { label: locked ? "Used in an exam (locked)" : "Edit", icon: "edit", onSelect: () => setMode("edit"), disabled: locked },
          { label: "Delete", icon: "trash", danger: true, onSelect: () => setMode("delete"), disabled: locked },
        ]}
      />
      <Modal open={mode === "edit"} onClose={() => setMode(null)} title="Edit question">
        <QuestionForm slug={slug} subjects={subjects} levels={levels} editing={question} onDone={() => setMode(null)} />
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title="Delete this question?"
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          const r = await deleteQuestionAction(slug, question.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        It&apos;s removed from the bank and from any draft exam that uses it.
      </ConfirmDialog>
    </>
  );
}

function QuestionForm({ slug, subjects, levels, editing, onDone }: { slug: string; subjects: Opt[]; levels: Opt[]; editing?: BankQuestion; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"objective" | "theory">(editing?.kind ?? "objective");
  const [subjectId, setSubjectId] = useState(editing?.subjectId ?? subjects[0]?.id ?? "");
  const [levelId, setLevelId] = useState(editing?.levelId ?? "");
  const [topic, setTopic] = useState(editing?.topic ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [options, setOptions] = useState<string[]>(editing?.options.length ? editing.options : ["", "", "", ""]);
  const [answer, setAnswer] = useState<number | null>(editing?.answer ?? null);
  const [marks, setMarks] = useState(String(editing?.marks ?? (kind === "theory" ? 5 : 1)));
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  function save(again: boolean) {
    setError(null);
    start(async () => {
      const r = await saveQuestionAction(slug, { id: editing?.id, subjectId, levelId, topic, kind, body, options: kind === "objective" ? options.map((o) => o.trim()) : [], answer: kind === "objective" ? answer : null, marks: Number(marks) });
      if (r.error) return setError(r.error);
      router.refresh();
      if (again) {
        setAdded((n) => n + 1);
        setBody("");
        setOptions(["", "", "", ""]);
        setAnswer(null);
      } else onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {added ? <Alert tone="success">{added} added. Keep going, or close when you&apos;re done.</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" htmlFor="q-subject">
          <Select id="q-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Class level (optional)" htmlFor="q-level">
          <Select id="q-level" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            <option value="">Any level</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label="Question type">
        {(["objective", "theory"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
              if (!editing) setMarks(k === "theory" ? "5" : "1");
            }}
            className={cn("flex-1 rounded-chunk border-2 px-3 py-2.5 text-left fs-14", kind === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong text-body hover:bg-paper")}
          >
            <span className="block font-semibold">{k === "objective" ? "Objective" : "Theory"}</span>
            <span className="block fs-13 text-muted">{k === "objective" ? "Options, marked automatically" : "Written answer, you mark it"}</span>
          </button>
        ))}
      </div>
      <Field label="Question" htmlFor="q-body">
        <Textarea id="q-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
      </Field>
      {kind === "objective" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 fs-14 font-semibold text-ink">Options · tap the letter of the correct one</legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAnswer(i)}
                aria-label={`Option ${LETTERS[i]} is correct`}
                aria-pressed={answer === i}
                className={cn("grid size-10 shrink-0 place-items-center rounded-full border-2 fs-14 font-bold", answer === i ? "border-success bg-success text-white" : "border-line-strong text-muted hover:border-success")}
              >
                {answer === i ? <Icon name="check" size={17} strokeWidth={3} /> : LETTERS[i]}
              </button>
              <Input value={o} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Option ${LETTERS[i]}`} />
              {options.length > 2 ? (
                <button
                  type="button"
                  aria-label={`Remove option ${LETTERS[i]}`}
                  className="rounded-full p-1.5 text-muted hover:bg-sunken"
                  onClick={() => {
                    setOptions((all) => all.filter((_, j) => j !== i));
                    setAnswer((a) => (a === null ? null : a === i ? null : a > i ? a - 1 : a));
                  }}
                >
                  <Icon name="x" size={16} />
                </button>
              ) : null}
            </div>
          ))}
          {options.length < 6 ? (
            <button type="button" className="self-start fs-14 font-semibold text-brand-ink hover:underline" onClick={() => setOptions((all) => [...all, ""])}>
              + Add option
            </button>
          ) : null}
        </fieldset>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marks" htmlFor="q-marks">
          <Input id="q-marks" inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value)} />
        </Field>
        <Field label="Topic (optional)" htmlFor="q-topic">
          <Input id="q-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Fractions" />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {!editing ? (
          <Button variant="secondary" disabled={pending} onClick={() => save(true)}>
            Save and add another
          </Button>
        ) : null}
        <Button disabled={pending} onClick={() => save(false)}>
          {pending ? "Saving…" : "Save question"}
        </Button>
      </div>
    </div>
  );
}

const SAMPLE = `1. What is 3/4 as a decimal?
A. 0.34
B. 0.75 *
C. 0.43
D. 7.5

2. Simplify 6/8.
A. 3/4 *
B. 2/3
C. 6/8

3. Explain how to add 1/2 and 1/3. [4 marks]`;

function ImportForm({ slug, subjects, levels, onDone }: { slug: string; subjects: Opt[]; levels: Opt[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [levelId, setLevelId] = useState("");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="fs-14 text-muted">
        Copy questions from Word or WhatsApp and paste them here. Leave a blank line between questions, start options with A. B. C., and put <strong className="text-ink">*</strong> after the correct one. A question
        without options is theory; add <strong className="text-ink">[4 marks]</strong> to set its marks.
      </p>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Subject" htmlFor="im-subject">
          <Select id="im-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Level" htmlFor="im-level">
          <Select id="im-level" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            <option value="">Any level</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Topic" htmlFor="im-topic">
          <Input id="im-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Questions" htmlFor="im-text">
        <Textarea id="im-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} className="font-mono fs-13.5" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              const r = await importQuestionsAction(slug, { subjectId, levelId, topic, text });
              if (r.error) return setMsg({ tone: "danger", text: r.error });
              router.refresh();
              setMsg({ tone: "success", text: r.success ?? "Added." });
              setText("");
              setTimeout(onDone, 900);
            })
          }
        >
          {pending ? "Adding…" : "Add to the bank"}
        </Button>
      </div>
    </div>
  );
}
