"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { saveParentAccountAction } from "../actions";

export function AccountForm({ name, contact, prefs }: { name: string; contact: string; prefs: { sms?: boolean; whatsapp?: boolean; email?: boolean } }) {
  const [state, action] = useActionState(saveParentAccountAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <Field label="Your name" htmlFor="acc-name">
        <Input id="acc-name" name="name" defaultValue={name} required />
      </Field>
      <p className="fs-14 text-muted">You sign in with {contact}.</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 fs-14 font-medium text-ink">How should schools reach you?</legend>
        <Checkbox name="sms" defaultChecked={prefs.sms !== false} label="Text messages" description="Absences, results and receipts by SMS, when the school sends them." />
        <Checkbox name="whatsapp" defaultChecked={!!prefs.whatsapp} label="WhatsApp instead of SMS" description="Send those messages to WhatsApp on the same number." />
        <Checkbox name="email" defaultChecked={prefs.email !== false} label="Email" description="Receipts, results and announcements by email." />
      </fieldset>
      <div>
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}
