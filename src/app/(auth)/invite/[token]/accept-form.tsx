"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { acceptInviteAction } from "../../actions";
import { PasswordInput } from "@/components/ui/password-input";

export function AcceptInviteForm({ token, mode, email, name }: { token: string; mode: "new" | "existing"; email?: string; name?: string }) {
  const [state, action] = useActionState(acceptInviteAction, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {mode === "new" ? (
        <>
          <Field label="Email" htmlFor="email">
            <Input id="email" value={email} disabled readOnly />
          </Field>
          <Field label="Your full name" htmlFor="name" error={fe.name}>
            <Input id="name" name="name" autoComplete="name" defaultValue={state.values?.name ?? name} aria-invalid={!!fe.name} required />
          </Field>
          <Field label="Create a password" htmlFor="password" error={fe.password} hint="At least 8 characters, with a letter and a number.">
            <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={!!fe.password} required />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={fe.confirm}>
            <PasswordInput id="confirm" name="confirm" autoComplete="new-password" aria-invalid={!!fe.confirm} required />
          </Field>
        </>
      ) : null}
      <SubmitButton size="lg" pendingText="Joining…">
        Accept and join
      </SubmitButton>
    </form>
  );
}
