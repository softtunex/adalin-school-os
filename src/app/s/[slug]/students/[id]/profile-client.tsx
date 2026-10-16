"use client";

import { useActionState, useState } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { addGuardianAction, setPrimaryGuardianAction, unlinkGuardianAction } from "../actions";
import { RELATIONSHIPS } from "../student-form";
import { StudentStatusDialog, statusMenuItems } from "../students-client";

type Status = "active" | "graduated" | "withdrawn" | "suspended";

export function StudentStatusMenu({ slug, student }: { slug: string; student: { id: string; name: string; status: Status } }) {
  const [pending, setPending] = useState<Status | null>(null);
  return (
    <>
      <RowMenu items={statusMenuItems(student.status, setPending)} label="Change status" />
      <StudentStatusDialog slug={slug} student={student} status={pending} open={pending !== null} onClose={() => setPending(null)} />
    </>
  );
}

function AddGuardianForm({ slug, studentId, onDone }: { slug: string; studentId: string; onDone: () => void }) {
  const [state, action] = useActionState(addGuardianAction.bind(null, slug, studentId), initialFormState);
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};
  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{state.success}</Alert>
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <p className="fs-14 text-muted">If this parent already has a child in the school, enter the same phone number and they&apos;ll be linked as one parent.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="g-name" error={fe.name}>
          <Input id="g-name" name="name" defaultValue={v.name} aria-invalid={!!fe.name} />
        </Field>
        <Field label="Relationship" htmlFor="g-rel">
          <Select id="g-rel" name="relationship" defaultValue={v.relationship ?? "Mother"}>
            {RELATIONSHIPS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Phone number" htmlFor="g-phone" error={fe.phone}>
          <Input id="g-phone" name="phone" type="tel" inputMode="tel" placeholder="0803 123 4567" defaultValue={v.phone} aria-invalid={!!fe.phone} />
        </Field>
        <Field label="Email (optional)" htmlFor="g-email" error={fe.email}>
          <Input id="g-email" name="email" type="email" defaultValue={v.email} aria-invalid={!!fe.email} />
        </Field>
        <Field label="Occupation (optional)" htmlFor="g-occ" className="sm:col-span-2">
          <Input id="g-occ" name="occupation" defaultValue={v.occupation} />
        </Field>
      </div>
      <SubmitButton>Link parent</SubmitButton>
    </form>
  );
}

export function AddGuardianButton({ slug, studentId }: { slug: string; studentId: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={17} strokeWidth={2.4} /> Add parent or guardian
      </Button>
      <Modal open={open} onClose={close} title="Add a parent or guardian">
        <AddGuardianForm key={key} slug={slug} studentId={studentId} onDone={close} />
      </Modal>
    </>
  );
}

export function GuardianActions({ slug, studentId, guardian, isPrimary }: { slug: string; studentId: string; guardian: { id: string; name: string }; isPrimary: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const items = [];
  if (!isPrimary) items.push({ label: "Make primary contact", icon: "star" as const, onSelect: () => void setPrimaryGuardianAction(slug, studentId, guardian.id) });
  items.push({ label: "Remove from student", icon: "trash" as const, danger: true, onSelect: () => setConfirm(true) });
  return (
    <>
      <RowMenu items={items} label={`Actions for ${guardian.name}`} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Remove ${guardian.name}?`} confirmLabel="Remove" danger onConfirm={() => unlinkGuardianAction(slug, studentId, guardian.id)}>
        They&apos;ll no longer be linked to this student. Their link to any siblings stays.
      </ConfirmDialog>
    </>
  );
}
