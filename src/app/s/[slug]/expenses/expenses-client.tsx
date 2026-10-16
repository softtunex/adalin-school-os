"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu, type MenuItem } from "@/components/ui/data";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { EXPENSE_CATEGORIES } from "@/lib/db/schema";
import { initialFormState } from "@/lib/form-state";
import { createExpenseAction, decideExpenseAction, deleteExpenseAction } from "./actions";

export function AddExpenseButton({ slug, today, approves }: { slug: string; today: string; approves: boolean }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        Record expense
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="Record an expense"
      >
        <ExpenseForm key={key} slug={slug} today={today} approves={approves} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function ExpenseForm({ slug, today, approves, onDone }: { slug: string; today: string; approves: boolean; onDone: () => void }) {
  const [state, action] = useActionState(createExpenseAction.bind(null, slug), initialFormState);
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
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {!approves ? <Alert tone="blue">The proprietor or principal approves expenses before they count in the accounts.</Alert> : null}
      <Field label="What was it for?" htmlFor="exp-desc" error={fe.description}>
        <Input id="exp-desc" name="description" defaultValue={state.values?.description} placeholder="e.g. Diesel for the generator, 200 litres" aria-invalid={!!fe.description} autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (₦)" htmlFor="exp-amount" error={fe.amount}>
          <Input id="exp-amount" name="amount" inputMode="decimal" defaultValue={state.values?.amount} aria-invalid={!!fe.amount} />
        </Field>
        <Field label="Date" htmlFor="exp-date" error={fe.spentOn}>
          <Input id="exp-date" name="spentOn" type="date" max={today} defaultValue={state.values?.spentOn ?? today} />
        </Field>
        <Field label="Category" htmlFor="exp-cat" error={fe.category}>
          <Select id="exp-cat" name="category" defaultValue={state.values?.category ?? ""}>
            <option value="" disabled>
              Choose…
            </option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid by" htmlFor="exp-method" error={fe.method}>
          <Select id="exp-method" name="method" defaultValue={state.values?.method ?? "transfer"}>
            <option value="transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="pos">POS</option>
            <option value="cheque">Cheque</option>
          </Select>
        </Field>
        <Field label="Vendor (optional)" htmlFor="exp-vendor">
          <Input id="exp-vendor" name="vendor" defaultValue={state.values?.vendor} placeholder="e.g. Total Energies" />
        </Field>
        <Field label="Reference (optional)" htmlFor="exp-ref">
          <Input id="exp-ref" name="reference" defaultValue={state.values?.reference} />
        </Field>
      </div>
      <SubmitButton pendingText="Saving…">Record expense</SubmitButton>
    </form>
  );
}

export function ExpenseActions({ slug, expense, canDecide, canDelete }: { slug: string; expense: { id: string; description: string; status: string }; canDecide: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"approve" | "reject" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const items: MenuItem[] = [];
  if (canDecide && expense.status === "pending") {
    items.push({ label: "Approve", icon: "checkCircle", onSelect: () => setDialog("approve") });
    items.push({ label: "Reject", icon: "ban", danger: true, onSelect: () => setDialog("reject") });
  }
  if (canDelete) items.push({ label: "Delete", icon: "trash", danger: true, onSelect: () => setDialog("delete") });
  if (!items.length) return null;
  const done = (r: { error?: string }) => {
    if (!r.error) {
      setDialog(null);
      router.refresh();
    }
    return r;
  };
  return (
    <>
      <RowMenu items={items} />
      <ConfirmDialog open={dialog === "approve"} onClose={() => setDialog(null)} title="Approve this expense?" confirmLabel="Approve" onConfirm={async () => done(await decideExpenseAction(slug, expense.id, true))}>
        {expense.description} will count in the school&apos;s accounts.
      </ConfirmDialog>
      <ConfirmDialog open={dialog === "reject"} onClose={() => setDialog(null)} title="Reject this expense?" confirmLabel="Reject" danger onConfirm={async () => done(await decideExpenseAction(slug, expense.id, false, reason))}>
        <Field label="Reason" htmlFor="rej-reason">
          <Input id="rej-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No receipt attached" />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === "delete"} onClose={() => setDialog(null)} title="Delete this expense?" confirmLabel="Delete" danger onConfirm={async () => done(await deleteExpenseAction(slug, expense.id))}>
        {expense.description} is removed from the records. This is logged in the audit trail.
      </ConfirmDialog>
    </>
  );
}
