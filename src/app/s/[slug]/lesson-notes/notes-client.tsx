"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FileUploader, type ExistingFile } from "@/components/file-uploader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { initialFormState } from "@/lib/form-state";
import { staffUploadAction } from "../assignments/actions";
import { deleteNoteAction, plannedTopicAction, reviewNoteAction, saveNoteAction, saveSchemeAction, withdrawNoteAction } from "./actions";
import { NOTE_STATUS } from "./status";

export type PlanOption = { levelId: string; levelName: string; subjectId: string; subjectName: string };
export type NoteDraft = { id: string; levelId: string; subjectId: string; week: number; topic: string; objectives: string; content: string; files: ExistingFile[]; returned: string | null };

export function NoteEditor({ slug, options, weeks, defaultWeek, note }: { slug: string; options: PlanOption[]; weeks: number; defaultWeek: number; note?: NoteDraft }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveNoteAction.bind(null, slug), initialFormState);
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  const first = options[0];
  const [plan, setPlan] = useState(note ? `${note.levelId}:${note.subjectId}` : first ? `${first.levelId}:${first.subjectId}` : "");
  const [week, setWeek] = useState(String(v?.week ?? note?.week ?? defaultWeek));
  const [topic, setTopic] = useState(v?.topic ?? note?.topic ?? "");
  const [planned, setPlanned] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const touched = useRef(!!note);
  const [levelId, subjectId] = plan.split(":");

  useEffect(() => {
    if (!levelId || !subjectId) return;
    let live = true;
    plannedTopicAction(slug, levelId, subjectId, Number(week)).then((t) => {
      if (!live) return;
      setPlanned(t);
      if (t && !touched.current) setTopic(t);
    });
    return () => {
      live = false;
    };
  }, [slug, levelId, subjectId, week]);

  useEffect(() => {
    if (state.success && state.data?.id) router.push(`/s/${slug}/lesson-notes/${state.data.id}?saved=1`);
  }, [state, router, slug]);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {note?.returned ? (
        <Alert tone="warning" title="Returned for changes">
          {note.returned}
        </Alert>
      ) : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {note ? <input type="hidden" name="id" value={note.id} /> : null}
      <input type="hidden" name="levelId" value={levelId ?? ""} />
      <input type="hidden" name="subjectId" value={subjectId ?? ""} />
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="Class and subject" htmlFor="ln-plan" error={fe.levelId ?? fe.subjectId}>
            <Select id="ln-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              {options.map((o) => (
                <option key={`${o.levelId}:${o.subjectId}`} value={`${o.levelId}:${o.subjectId}`}>
                  {o.levelName} · {o.subjectName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Week" htmlFor="ln-week" error={fe.week}>
            <Select id="ln-week" name="week" value={week} onChange={(e) => setWeek(e.target.value)}>
              {Array.from({ length: weeks }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Week {i + 1}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Topic"
          htmlFor="ln-topic"
          error={fe.topic}
          hint={planned ? `Scheme of work for week ${week}: ${planned}` : "No topic planned for this week in the scheme of work."}
        >
          <Input
            id="ln-topic"
            name="topic"
            value={topic}
            onChange={(e) => {
              touched.current = true;
              setTopic(e.target.value);
            }}
            aria-invalid={!!fe.topic}
          />
        </Field>
        <Field label="Objectives" htmlFor="ln-obj" error={fe.objectives} hint="By the end of the lesson, students should be able to…">
          <Textarea id="ln-obj" name="objectives" rows={3} defaultValue={v?.objectives ?? note?.objectives} />
        </Field>
        <Field label="Lesson note" htmlFor="ln-content" error={fe.content} hint="Introduction, presentation steps, evaluation and assignment. Or attach your written note below.">
          <Textarea id="ln-content" name="content" rows={14} defaultValue={v?.content ?? note?.content} />
        </Field>
        <FileUploader request={(name, size) => staffUploadAction(slug, "lesson_note", name, size)} existing={note?.files} onBusyChange={setUploading} label="Attach a scanned or typed note" />
      </Card>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending || uploading}>
          Save draft
        </Button>
        <Button type="submit" name="intent" value="submit" disabled={pending || uploading}>
          <Icon name="send" size={16} /> {pending ? "Sending…" : "Send for approval"}
        </Button>
      </div>
    </form>
  );
}

export function ReviewPanel({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  function decide(decision: "approved" | "returned") {
    setError(null);
    start(async () => {
      const r = await reviewNoteAction(slug, { id, decision, comment });
      if (r.error) setError(r.error);
      else router.push(`/s/${slug}/lesson-notes`);
    });
  }
  return (
    <Card className="flex flex-col gap-3 border-brand/40 p-5">
      <h2 className="fs-16 font-semibold">Your review</h2>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Comment for the teacher" htmlFor="rv-comment" hint="Needed when you return a note.">
        <Textarea id="rv-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => decide("returned")}>
          <Icon name="undo" size={16} /> Return for changes
        </Button>
        <Button variant="success" disabled={pending} onClick={() => decide("approved")}>
          <Icon name="check" size={16} strokeWidth={2.6} /> Approve
        </Button>
      </div>
    </Card>
  );
}

export function OwnerNoteActions({ slug, id, canWithdraw, canDelete }: { slug: string; id: string; canWithdraw: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {canWithdraw ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await withdrawNoteAction(slug, id);
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        >
          <Icon name="undo" size={16} /> Withdraw to edit
        </Button>
      ) : null}
      {canDelete ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={16} /> Delete
          </Button>
          <ConfirmDialog
            open={confirm}
            onClose={() => setConfirm(false)}
            title="Delete this lesson note?"
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              const r = await deleteNoteAction(slug, id);
              if (!r.error) router.push(`/s/${slug}/lesson-notes`);
              return r;
            }}
          >
            The note and its attachments are removed for good.
          </ConfirmDialog>
        </>
      ) : null}
    </div>
  );
}

export function SchemeEditor({
  slug,
  termId,
  levelId,
  subjectId,
  weeks,
  editable,
  currentWeek,
}: {
  slug: string;
  termId: string;
  levelId: string;
  subjectId: string;
  weeks: { week: number; topic: string; notes: { id: string; status: string }[] }[];
  editable: boolean;
  currentWeek: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [topics, setTopics] = useState(() => weeks.map((w) => w.topic));
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const dirty = topics.some((t, i) => t !== weeks[i].topic);

  return (
    <div className="flex flex-col">
      {msg ? (
        <div className="px-4 pt-3 sm:px-5">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}
      <ol className="flex flex-col">
        {weeks.map((w, i) => {
          const note = w.notes[0];
          return (
            <li key={w.week} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 sm:flex-nowrap sm:px-5">
              <span className="flex w-20 shrink-0 items-center gap-1.5 fs-13.5 font-semibold text-muted">
                Week {w.week}
                {currentWeek === w.week ? <span className="h-2 w-2 rounded-full bg-brand" title="This week" /> : null}
              </span>
              {editable ? (
                <Input
                  className="h-10 min-w-0 flex-1"
                  value={topics[i]}
                  onChange={(e) => setTopics((t) => t.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i === weeks.length - 1 ? "Revision and examination" : "Topic"}
                  aria-label={`Week ${w.week} topic`}
                />
              ) : (
                <span className="min-w-0 flex-1 fs-14.5 text-ink">{w.topic || <span className="text-muted">Not planned</span>}</span>
              )}
              {note ? (
                <a href={`/s/${slug}/lesson-notes/${note.id}`} className="shrink-0">
                  <Badge tone={NOTE_STATUS[note.status]?.tone ?? "neutral"} dot>
                    Note {NOTE_STATUS[note.status]?.label.toLowerCase() ?? note.status}
                  </Badge>
                </a>
              ) : (
                <span className="w-0 sm:w-[7.5rem]" />
              )}
            </li>
          );
        })}
      </ol>
      {editable ? (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:px-5">
          <span className="fs-13.5 text-muted">{dirty ? "Unsaved changes" : "Saved"}</span>
          <Button
            disabled={pending || !dirty}
            onClick={() =>
              start(async () => {
                const r = await saveSchemeAction(slug, { termId, levelId, subjectId, items: topics.map((topic, i) => ({ week: weeks[i].week, topic })) });
                setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Saved." });
                if (!r.error) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save scheme"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
