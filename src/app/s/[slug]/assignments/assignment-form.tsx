"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { FileUploader, type ExistingFile } from "@/components/file-uploader";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { saveAssignmentAction, staffUploadAction } from "./actions";

export type Target = { classId: string; className: string; subjects: { id: string; name: string }[] };
export type Component = { id: string; name: string; maxScore: number };
export type Editing = {
  id: string;
  classId: string;
  subjectId: string;
  title: string;
  instructions: string;
  dueAt: string;
  maxScore: number | null;
  componentId: string | null;
  allowLate: boolean;
  status: string;
  files: ExistingFile[];
};

export function NewAssignmentButton(props: { slug: string; targets: Target[]; components: Component[]; defaultDue: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={props.targets.length === 0}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        New assignment
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="Set an assignment"
      >
        <AssignmentForm key={key} {...props} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditAssignmentButton(props: { slug: string; targets: Target[]; components: Component[]; editing: Editing }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Icon name="edit" size={16} /> Edit
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="Edit assignment"
      >
        <AssignmentForm key={key} {...props} defaultDue={props.editing.dueAt} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function AssignmentForm({
  slug,
  targets,
  components,
  defaultDue,
  editing,
  onDone,
}: {
  slug: string;
  targets: Target[];
  components: Component[];
  defaultDue: string;
  editing?: Editing;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveAssignmentAction.bind(null, slug), initialFormState);
  const v = state.values;
  const [classId, setClassId] = useState(v?.classId ?? editing?.classId ?? targets[0]?.classId ?? "");
  const [maxScore, setMaxScore] = useState(v?.maxScore ?? (editing?.maxScore ? String(editing.maxScore) : ""));
  const [uploading, setUploading] = useState(false);
  const fe = state.fieldErrors ?? {};
  const subjects = targets.find((t) => t.classId === classId)?.subjects ?? [];

  useEffect(() => {
    if (!state.success) return;
    if (editing) {
      onDone();
      router.refresh();
    } else if (state.data?.id) {
      router.push(`/s/${slug}/assignments/${state.data.id}`);
    }
  }, [state, editing, onDone, router, slug]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Class" htmlFor="as-class" error={fe.classId}>
          <Select id="as-class" name="classId" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {targets.map((t) => (
              <option key={t.classId} value={t.classId}>
                {t.className}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject" htmlFor="as-subject" error={fe.subjectId}>
          <Select id="as-subject" name="subjectId" key={classId} defaultValue={v?.subjectId ?? editing?.subjectId ?? subjects[0]?.id}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Title" htmlFor="as-title" error={fe.title}>
        <Input id="as-title" name="title" defaultValue={v?.title ?? editing?.title} placeholder="e.g. Fractions: exercise 4B" aria-invalid={!!fe.title} autoFocus />
      </Field>
      <Field label="Instructions" htmlFor="as-ins" error={fe.instructions} hint="What students should do, and how to hand it in.">
        <Textarea id="as-ins" name="instructions" rows={4} defaultValue={v?.instructions ?? editing?.instructions} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Due" htmlFor="as-due" error={fe.dueAt}>
          <Input id="as-due" name="dueAt" type="datetime-local" defaultValue={v?.dueAt ?? defaultDue} />
        </Field>
        <Field label="Marked out of (optional)" htmlFor="as-max" error={fe.maxScore}>
          <Input id="as-max" name="maxScore" inputMode="numeric" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder="e.g. 20" aria-invalid={!!fe.maxScore} />
        </Field>
      </div>
      <Field label="Counts towards (optional)" htmlFor="as-comp" error={fe.componentId} hint="Marks are scaled into this CA column when you send them to the score sheet.">
        <Select id="as-comp" name="componentId" defaultValue={v?.componentId ?? editing?.componentId ?? ""} disabled={!maxScore}>
          <option value="">Not part of CA</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (out of {c.maxScore})
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox name="allowLate" defaultChecked={editing?.allowLate ?? true} label="Accept late work" description="Late work is still flagged as late." />
      <FileUploader request={(name, size) => staffUploadAction(slug, "assignment", name, size)} existing={editing?.files} onBusyChange={setUploading} label="Attach worksheets" />
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {!editing || editing.status === "draft" ? (
          <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending || uploading}>
            Save as draft
          </Button>
        ) : null}
        <Button type="submit" name="intent" value="publish" disabled={pending || uploading}>
          {pending ? "Saving…" : uploading ? "Uploading…" : editing && editing.status !== "draft" ? "Save changes" : "Set assignment"}
        </Button>
      </div>
    </form>
  );
}
