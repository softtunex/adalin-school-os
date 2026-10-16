"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { deleteDiscountAction, saveDiscountAction } from "../actions";

export type SchemeView = { id: string; name: string; kind: "percent" | "fixed"; percent: string; amount: string; itemId: string | null };

function SchemeForm({ slug, scheme, items, onDone }: { slug: string; scheme?: SchemeView; items: { id: string; name: string }[]; onDone: () => void }) {
  const [state, action] = useActionState(saveDiscountAction.bind(null, slug), initialFormState);
  const [kind, setKind] = useState<"percent" | "fixed">((state.values?.kind as "percent" | "fixed") ?? scheme?.kind ?? "percent");
  const fe = state.fieldErrors ?? {};
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
      {scheme ? <input type="hidden" name="id" value={scheme.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Name" htmlFor="sch-name" error={fe.name} hint="Parents see this on the invoice, e.g. Sibling discount, Staff child, Scholarship.">
        <Input id="sch-name" name="name" defaultValue={state.values?.name ?? scheme?.name} aria-invalid={!!fe.name} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" variant={kind === "percent" ? "primary" : "secondary"} onClick={() => setKind("percent")}>
          Percentage
        </Button>
        <Button size="sm" variant={kind === "fixed" ? "primary" : "secondary"} onClick={() => setKind("fixed")}>
          Fixed amount
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "percent" ? (
          <Field label="Percentage off" htmlFor="sch-pct" error={fe.percent}>
            <Input id="sch-pct" name="percent" inputMode="numeric" defaultValue={state.values?.percent ?? scheme?.percent} placeholder="10" aria-invalid={!!fe.percent} />
          </Field>
        ) : (
          <Field label="Amount off (₦)" htmlFor="sch-amt" error={fe.amount}>
            <Input id="sch-amt" name="amount" inputMode="decimal" defaultValue={state.values?.amount ?? scheme?.amount} placeholder="25,000" aria-invalid={!!fe.amount} />
          </Field>
        )}
        <Field label="Applies to" htmlFor="sch-item">
          <Select id="sch-item" name="itemId" defaultValue={state.values?.itemId ?? scheme?.itemId ?? ""}>
            <option value="">All compulsory fees</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} only
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <SubmitButton>{scheme ? "Save discount" : "Create discount"}</SubmitButton>
    </form>
  );
}

export function NewSchemeButton({ slug, items }: { slug: string; items: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        New discount
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="New discount or scholarship"
      >
        <SchemeForm key={key} slug={slug} items={items} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function SchemeActions({ slug, scheme, items }: { slug: string; scheme: SchemeView; items: { id: string; name: string }[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  return (
    <>
      <RowMenu
        items={[
          { label: "Edit", icon: "edit", onSelect: () => setDialog("edit") },
          { label: "Delete", icon: "trash", danger: true, onSelect: () => setDialog("delete") },
        ]}
      />
      <Modal open={dialog === "edit"} onClose={() => setDialog(null)} title={`Edit ${scheme.name}`}>
        {dialog === "edit" ? <SchemeForm slug={slug} scheme={scheme} items={items} onDone={() => setDialog(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title={`Delete ${scheme.name}?`}
        confirmLabel="Delete discount"
        danger
        onConfirm={async () => {
          const r = await deleteDiscountAction(slug, scheme.id);
          if (!r.error) {
            setDialog(null);
            router.refresh();
          }
          return r;
        }}
      >
        Students lose this discount on invoices raised from now on. Invoices already raised keep it.
      </ConfirmDialog>
    </>
  );
}
