"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { initialFormState } from "@/lib/form-state";
import { payFeeAction, respondAction } from "../../actions";

export function PayFee({ slug, token, email, amount }: { slug: string; token: string; email: string | null; amount: string }) {
  const [state, action] = useActionState(payFeeAction.bind(null, slug, token), initialFormState);
  useEffect(() => {
    if (state.data?.url) window.location.assign(state.data.url);
  }, [state]);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Email for the receipt" htmlFor="fee-email">
        <Input id="fee-email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? email ?? ""} />
      </Field>
      <SubmitButton size="lg">
        <Icon name="creditCard" size={19} /> Pay {amount}
      </SubmitButton>
      <p className="text-center fs-13 text-muted">Card, bank transfer or USSD, through Paystack. The money goes straight to the school.</p>
    </form>
  );
}

export function OfferResponse({ slug, token }: { slug: string; token: string }) {
  const [pending, start] = useTransition();
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = (accept: boolean) =>
    start(async () => {
      const r = await respondAction(slug, token, accept);
      if (r?.error) setError(r.error);
    });
  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {confirmDecline ? (
        <div className="flex flex-col gap-3 rounded-chunk border border-line p-4">
          <p className="fs-15 text-body">Decline the offer? The place will go to another child, and this can&apos;t be undone online.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDecline(false)} disabled={pending}>
              Keep the offer
            </Button>
            <Button variant="danger" onClick={() => go(false)} disabled={pending}>
              Decline
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <Button variant="success" size="lg" onClick={() => go(true)} disabled={pending}>
            <Icon name="check" size={19} strokeWidth={2.6} /> {pending ? "Accepting…" : "Accept the offer"}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setConfirmDecline(true)} disabled={pending}>
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}
