"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { addLineAction, removeLineAction, reversePaymentAction, voidInvoiceAction } from "../../actions";

export function AddLineButton({ slug, invoiceId, kind, items }: { slug: string; invoiceId: string; kind: "charge" | "discount"; items: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Icon name={kind === "charge" ? "plus" : "percent"} size={16} />
        {kind === "charge" ? "Add charge" : "Give discount"}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title={kind === "charge" ? "Add a charge" : "Give a discount"}
      >
        <LineForm key={key} slug={slug} invoiceId={invoiceId} kind={kind} items={items} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function LineForm({ slug, invoiceId, kind, items, onDone }: { slug: string; invoiceId: string; kind: "charge" | "discount"; items: { id: string; name: string }[]; onDone: () => void }) {
  const [state, action] = useActionState(addLineAction.bind(null, slug), initialFormState);
  const [description, setDescription] = useState(state.values?.description ?? "");
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
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="kind" value={kind} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {kind === "charge" && items.length ? (
        <Field label="Fee item (optional)" htmlFor="line-item">
          <Select
            id="line-item"
            name="itemId"
            defaultValue=""
            onChange={(e) => {
              const item = items.find((i) => i.id === e.target.value);
              if (item) setDescription(item.name);
            }}
          >
            <option value="">Something else</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Description" htmlFor="line-desc" error={fe.description}>
        <Input id="line-desc" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === "charge" ? "e.g. Excursion to Badagry" : "e.g. Early payment discount"} aria-invalid={!!fe.description} />
      </Field>
      <Field label="Amount (₦)" htmlFor="line-amount" error={fe.amount}>
        <Input id="line-amount" name="amount" inputMode="decimal" defaultValue={state.values?.amount} aria-invalid={!!fe.amount} />
      </Field>
      <SubmitButton>{kind === "charge" ? "Add charge" : "Apply discount"}</SubmitButton>
    </form>
  );
}

export function RemoveLineButton({ slug, lineId, label }: { slug: string; lineId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={`Remove ${label}`} onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-sunken hover:text-danger">
        <Icon name="trash" size={15} />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Remove this line?"
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await removeLineAction(slug, lineId);
          if (!r.error) {
            setOpen(false);
            router.refresh();
          }
          return r;
        }}
      >
        {label} comes off the invoice and the total is recalculated.
      </ConfirmDialog>
    </>
  );
}

export function VoidInvoiceButton({ slug, invoiceId, disabledReason }: { slug: string; invoiceId: string; disabledReason?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen(true)} disabled={!!disabledReason} title={disabledReason}>
        <Icon name="ban" size={16} />
        Void invoice
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Void this invoice?"
        confirmLabel="Void invoice"
        danger
        onConfirm={async () => {
          const r = await voidInvoiceAction(slug, invoiceId, reason);
          if (!r.error) {
            setOpen(false);
            router.refresh();
          }
          return r;
        }}
      >
        <div className="flex flex-col gap-3">
          <p>A void invoice stays on record but no longer counts towards what the family owes. You can raise a new one afterwards.</p>
          <Field label="Reason" htmlFor="void-reason">
            <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Raised for the wrong class" />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

export function ReversePaymentButton({ slug, paymentId, receiptNo, online }: { slug: string; paymentId: string; receiptNo: string; online: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 fs-13.5 font-medium text-muted hover:bg-sunken hover:text-danger">
        <Icon name="undo" size={15} />
        Reverse
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reverse receipt ${receiptNo}?`}
        confirmLabel="Reverse payment"
        danger
        onConfirm={async () => {
          const r = await reversePaymentAction(slug, paymentId, reason);
          if (!r.error) {
            setOpen(false);
            router.refresh();
          }
          return r;
        }}
      >
        <div className="flex flex-col gap-3">
          <p>Use this for a bounced cheque, a refund or a payment recorded by mistake. The amount goes back onto the balance and the receipt is marked reversed.</p>
          {online ? <Alert tone="warning">This was paid online. Reversing it here doesn&apos;t refund the parent; do that from your Paystack dashboard first.</Alert> : null}
          <Field label="Reason" htmlFor="reverse-reason">
            <Input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cheque returned unpaid" />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}
