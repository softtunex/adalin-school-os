"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { FileUploader, type ExistingFile } from "@/components/file-uploader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { staffUploadAction } from "../assignments/actions";
import { deleteMaterialAction, saveMaterialAction } from "./actions";
import { KIND } from "./kinds";

export type PlanOption = { levelId: string; levelName: string; subjectId: string; subjectName: string };
export type EditingMaterial = { id: string; levelId: string; subjectId: string; title: string; description: string; kind: "file" | "link" | "note"; url: string | null; body: string | null; files: ExistingFile[] };

export function AddMaterialButton({ slug, options }: { slug: string; options: PlanOption[] }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!options.length}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Share material
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="Share learning material"
      >
        <MaterialForm key={key} slug={slug} options={options} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function MaterialActions({ slug, options, editing }: { slug: string; options: PlanOption[]; editing: EditingMaterial }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  return (
    <>
      <RowMenu
        items={[
          { label: "Edit", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Remove", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "edit"} onClose={() => setMode(null)} title="Edit material">
        <MaterialForm slug={slug} options={options} editing={editing} onDone={() => setMode(null)} />
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title={`Remove "${editing.title}"?`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteMaterialAction(slug, editing.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        Students won&apos;t see it any more, and any attached files are deleted.
      </ConfirmDialog>
    </>
  );
}

function MaterialForm({ slug, options, editing, onDone }: { slug: string; options: PlanOption[]; editing?: EditingMaterial; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveMaterialAction.bind(null, slug), initialFormState);
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  const [kind, setKind] = useState<"file" | "link" | "note">((v?.kind as "file") ?? editing?.kind ?? "file");
  const [uploading, setUploading] = useState(false);
  const first = options[0];

  useEffect(() => {
    if (state.success) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type">
        {(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("flex flex-col items-start gap-1 rounded-chunk border-2 p-3 text-left", kind === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong text-body hover:bg-paper")}
          >
            <Icon name={KIND[k].icon} size={19} />
            <span className="fs-14 font-semibold">{KIND[k].label}</span>
            <span className="fs-12.5 text-muted">{KIND[k].hint}</span>
          </button>
        ))}
      </div>
      <Field label="Class and subject" htmlFor="mt-plan" error={fe.levelId ?? fe.subjectId}>
        <Select id="mt-plan" name="plan" defaultValue={v?.plan ?? (editing ? `${editing.levelId}:${editing.subjectId}` : first ? `${first.levelId}:${first.subjectId}` : "")}>
          {options.map((o) => (
            <option key={`${o.levelId}:${o.subjectId}`} value={`${o.levelId}:${o.subjectId}`}>
              {o.levelName} · {o.subjectName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title" htmlFor="mt-title" error={fe.title}>
        <Input id="mt-title" name="title" defaultValue={v?.title ?? editing?.title} placeholder="e.g. Fractions explained" aria-invalid={!!fe.title} />
      </Field>
      <Field label="Description (optional)" htmlFor="mt-desc" error={fe.description}>
        <Input id="mt-desc" name="description" defaultValue={v?.description ?? editing?.description} placeholder="What it covers, or what to do with it" />
      </Field>
      {kind === "link" ? (
        <Field label="Link" htmlFor="mt-url" error={fe.url} hint="YouTube videos play right in the student portal.">
          <Input id="mt-url" name="url" type="url" inputMode="url" defaultValue={v?.url ?? editing?.url ?? ""} placeholder="https://" aria-invalid={!!fe.url} />
        </Field>
      ) : null}
      {kind === "note" ? (
        <Field label="Note" htmlFor="mt-body" error={fe.body}>
          <Textarea id="mt-body" name="body" rows={10} defaultValue={v?.body ?? editing?.body ?? ""} aria-invalid={!!fe.body} />
        </Field>
      ) : null}
      {kind === "file" ? (
        <FileUploader request={(name, size) => staffUploadAction(slug, "material", name, size)} existing={editing?.kind === "file" ? editing.files : []} onBusyChange={setUploading} label="Attach files" />
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || uploading}>
          {pending ? "Saving…" : uploading ? "Uploading…" : editing ? "Save changes" : "Share with students"}
        </Button>
      </div>
    </form>
  );
}
