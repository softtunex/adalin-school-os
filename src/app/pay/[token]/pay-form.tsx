"use client";

import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { startPaymentAction } from "./actions";

export function PayForm({ token, balance, balanceLabel }: { token: string; balance: number; balanceLabel: string }) {
  const [state, action] = useActionState(startPaymentAction.bind(null, token), initialFormState);
  useEffect(() => {
    if (state.data?.url) window.location.assign(state.data.url);
  }, [state.data?.url]);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Amount to pay (₦)" htmlFor="pay-amount" hint={`You can pay part now. Balance: ${balanceLabel}`}>
        <Input id="pay-amount" name="amount" inputMode="decimal" defaultValue={state.values?.amount ?? String(balance / 100)} className="tabular fs-17 font-semibold" />
      </Field>
      <Field label="Your email" htmlFor="pay-email" hint="Your receipt is sent here.">
        <Input id="pay-email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email ?? ""} required />
      </Field>
      <SubmitButton size="lg" pendingText="Opening checkout…">
        Pay now
      </SubmitButton>
    </form>
  );
}
