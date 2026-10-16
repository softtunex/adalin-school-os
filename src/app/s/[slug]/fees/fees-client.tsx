"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button, buttonClass, SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { generateInvoicesAction, recordPaymentAction, sendRemindersAction } from "./actions";

export function GenerateInvoicesButton({
  slug,
  term,
  classes,
  variant = "primary",
}: {
  slug: string;
  term: { id: string; label: string };
  classes: { id: string; name: string }[];
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Icon name="file" size={18} />
        Raise term invoices
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title={`Raise invoices for ${term.label}`}
      >
        <GenerateForm key={key} slug={slug} termId={term.id} classes={classes} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function GenerateForm({ slug, termId, classes, onDone }: { slug: string; termId: string; classes: { id: string; name: string }[]; onDone: () => void }) {
  const [state, action] = useActionState(generateInvoicesAction.bind(null, slug), initialFormState);
  const [scope, setScope] = useState<"all" | "some">("all");
  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Done">
          {state.success}
        </Alert>
        <Button variant="secondary" onClick={onDone}>
          Close
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="termId" value={termId} />
      <p className="fs-14.5 text-body">
        Every active student gets one invoice built from your fee structure for their class, less any discounts they have. Students who already have an invoice for this term are skipped, so you can run this again after new admissions.
      </p>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Payment due by (optional)" htmlFor="gen-due" hint="Invoices still unpaid after this date show as overdue.">
        <Input id="gen-due" name="dueOn" type="date" />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 fs-14 font-medium text-ink">Which classes</legend>
        <div className="flex gap-2">
          <Button size="sm" variant={scope === "all" ? "primary" : "secondary"} onClick={() => setScope("all")}>
            All classes
          </Button>
          <Button size="sm" variant={scope === "some" ? "primary" : "secondary"} onClick={() => setScope("some")}>
            Choose classes
          </Button>
        </div>
        {scope === "some" ? (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-chunk border border-line-strong px-3 py-2 fs-14 has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
                <input type="checkbox" name="classIds" value={c.id} className="size-4 accent-[var(--brand)]" />
                {c.name}
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
      <SubmitButton pendingText="Raising invoices…">Raise invoices</SubmitButton>
    </form>
  );
}

export function RecordPaymentButton({
  slug,
  invoice,
  today,
  size = "md",
}: {
  slug: string;
  invoice: { id: string; number: string; balance: number; balanceLabel: string; hasEmail: boolean };
  today: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button size={size} variant="success" onClick={() => setOpen(true)} disabled={invoice.balance <= 0}>
        <Icon name="banknote" size={18} />
        Record payment
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title={`Record a payment on ${invoice.number}`}
      >
        <PaymentForm key={key} slug={slug} invoice={invoice} today={today} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function PaymentForm({ slug, invoice, today, onDone }: { slug: string; invoice: { id: string; balance: number; balanceLabel: string; hasEmail: boolean }; today: string; onDone: () => void }) {
  const [state, action] = useActionState(recordPaymentAction.bind(null, slug), initialFormState);
  const fe = state.fieldErrors ?? {};
  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Payment recorded">
          {state.success}
        </Alert>
        <div className="flex flex-wrap gap-2.5">
          <a href={`/s/${slug}/fees/payments/${state.data?.paymentId}/receipt`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <Icon name="download" size={18} />
            Download receipt
          </a>
          <Button variant="ghost" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="invoiceId" value={invoice.id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (₦)" htmlFor="pay-amount" error={fe.amount} hint={`Balance: ${invoice.balanceLabel}`}>
          <Input id="pay-amount" name="amount" inputMode="decimal" defaultValue={state.values?.amount ?? String(invoice.balance / 100)} aria-invalid={!!fe.amount} autoFocus />
        </Field>
        <Field label="Date paid" htmlFor="pay-date" error={fe.paidOn}>
          <Input id="pay-date" name="paidOn" type="date" max={today} defaultValue={state.values?.paidOn ?? today} />
        </Field>
        <Field label="How they paid" htmlFor="pay-method" error={fe.method}>
          <Select id="pay-method" name="method" defaultValue={state.values?.method ?? "transfer"}>
            <option value="transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="pos">POS</option>
            <option value="cheque">Cheque</option>
          </Select>
        </Field>
        <Field label="Reference (optional)" htmlFor="pay-ref" hint="Teller, transfer or cheque number">
          <Input id="pay-ref" name="reference" defaultValue={state.values?.reference} />
        </Field>
      </div>
      <Field label="Paid by (optional)" htmlFor="pay-payer">
        <Input id="pay-payer" name="payerName" defaultValue={state.values?.payerName} placeholder="e.g. Mrs Okafor" />
      </Field>
      <Field label="Note (optional)" htmlFor="pay-note">
        <Textarea id="pay-note" name="note" rows={2} className="min-h-16" defaultValue={state.values?.note} />
      </Field>
      {invoice.hasEmail ? (
        <label className="flex items-center gap-2 fs-14.5 text-body">
          <input type="checkbox" name="sendReceipt" defaultChecked className="size-4 accent-[var(--brand)]" />
          Email the receipt to the parent
        </label>
      ) : null}
      <SubmitButton variant="success" pendingText="Recording…">
        Record payment
      </SubmitButton>
    </form>
  );
}

export function SendRemindersButton({ slug, invoiceIds, termId, label = "Send reminders", size = "md", variant = "secondary" }: { slug: string; invoiceIds?: string[]; termId?: string; label?: string; size?: "sm" | "md"; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        size={size}
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await sendRemindersAction(slug, { invoiceIds, termId });
            setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.success ?? "Done." });
            router.refresh();
          })
        }
      >
        <Icon name="send" size={17} />
        {pending ? "Sending…" : label}
      </Button>
      {message ? <p className={message.ok ? "fs-13.5 text-success" : "fs-13.5 text-danger"}>{message.text}</p> : null}
    </div>
  );
}
