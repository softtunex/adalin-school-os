"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { createOtherInvoiceAction, setStudentDiscountsAction } from "../../fees/actions";

export function StudentDiscounts({ slug, studentId, schemes, assigned, editable }: { slug: string; studentId: string; schemes: { id: string; name: string; description: string }[]; assigned: string[]; editable: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState(new Set(assigned));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = picked.size !== assigned.length || assigned.some((a) => !picked.has(a));
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div>
        <h3 className="fs-15.5 font-semibold">Discounts and scholarships</h3>
        <p className="mt-0.5 fs-14 text-muted">Applied automatically to term invoices raised from now on.</p>
      </div>
      {schemes.length === 0 ? (
        <p className="fs-14.5 text-muted">No discounts set up yet. Create them under Fees → Discounts.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {schemes.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-chunk border border-line-strong p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
              <input
                type="checkbox"
                checked={picked.has(s.id)}
                disabled={!editable}
                onChange={() => {
                  setMessage(null);
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  });
                }}
                className="mt-0.5 size-[18px] shrink-0 accent-[var(--brand)]"
              />
              <span>
                <span className="block fs-14.5 font-medium text-ink">{s.name}</span>
                <span className="block fs-13.5 text-muted">{s.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {message ? <p className={message.ok ? "fs-13.5 text-success" : "fs-13.5 text-danger"}>{message.text}</p> : null}
      {editable && schemes.length ? (
        <div>
          <Button
            size="sm"
            disabled={!dirty || pending}
            onClick={() =>
              startTransition(async () => {
                const r = await setStudentDiscountsAction(slug, studentId, [...picked]);
                setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.success ?? "Saved." });
                if (!r.error) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save discounts"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function OneOffInvoiceButton({ slug, studentId, termId, items }: { slug: string; studentId: string; termId: string; items: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} />
        One-off invoice
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="Raise a one-off invoice"
      >
        <OneOffForm key={key} slug={slug} studentId={studentId} termId={termId} items={items} />
      </Modal>
    </>
  );
}

function OneOffForm({ slug, studentId, termId, items }: { slug: string; studentId: string; termId: string; items: { id: string; name: string }[] }) {
  const router = useRouter();
  const [state, action] = useActionState(createOtherInvoiceAction.bind(null, slug), initialFormState);
  const [title, setTitle] = useState(state.values?.title ?? "");
  const fe = state.fieldErrors ?? {};
  if (state.success && state.data?.invoiceId) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{state.success}</Alert>
        <Button onClick={() => router.push(`/s/${slug}/fees/invoices/${state.data!.invoiceId}`)}>Open the invoice</Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="termId" value={termId} />
      <input type="hidden" name="description" value={title} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <p className="fs-14.5 text-body">For things outside the term fees: uniforms, books, an excursion, the school bus.</p>
      {items.length ? (
        <Field label="Fee item (optional)" htmlFor="oo-item">
          <Select id="oo-item" name="itemId" defaultValue="" onChange={(e) => setTitle(items.find((i) => i.id === e.target.value)?.name ?? title)}>
            <option value="">Something else</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="What it's for" htmlFor="oo-title" error={fe.title}>
        <Input id="oo-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Two sets of uniform" aria-invalid={!!fe.title} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (₦)" htmlFor="oo-amount" error={fe["lines.0.amount"] ?? fe.amount}>
          <Input id="oo-amount" name="amount" inputMode="decimal" defaultValue={state.values?.amount} />
        </Field>
        <Field label="Due by (optional)" htmlFor="oo-due">
          <Input id="oo-due" name="dueOn" type="date" defaultValue={state.values?.dueOn} />
        </Field>
      </div>
      <SubmitButton>Raise invoice</SubmitButton>
    </form>
  );
}
