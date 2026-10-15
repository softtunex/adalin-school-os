"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { changePasswordAction, signOutEverywhereAction, updateNameAction } from "./actions";

export function NameForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateNameAction, initialFormState);
  return (
    <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <Field label="Full name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={name} autoComplete="name" aria-invalid={!!state.fieldErrors?.name} />
      </Field>
      <div>
        <SubmitButton variant="secondary">Save name</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <Field label="Current password" htmlFor="current" error={fe.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" aria-invalid={!!fe.current} />
      </Field>
      <Field label="New password" htmlFor="next" error={fe.next} hint="At least 8 characters, with a letter and a number.">
        <Input id="next" name="next" type="password" autoComplete="new-password" aria-invalid={!!fe.next} />
      </Field>
      <div>
        <SubmitButton variant="secondary">Change password</SubmitButton>
      </div>
    </form>
  );
}

export function SignOutEverywhere() {
  return (
    <form action={signOutEverywhereAction} className="mt-4">
      <SubmitButton variant="danger" pendingText="Signing out…">
        Sign out everywhere
      </SubmitButton>
    </form>
  );
}
