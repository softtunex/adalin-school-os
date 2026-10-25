"use client";

import { use, useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { resetPasswordAction } from "../../actions";
import { PasswordInput } from "@/components/ui/password-input";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <>
      <h1 className="font-display fs-32 font-black leading-tight tracking-[-0.02em]">Set a new password</h1>
      <p className="mt-1 fs-15.5 text-muted">You&apos;ll be logged out everywhere else.</p>
      <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
        <input type="hidden" name="token" value={token} />
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Field label="New password" htmlFor="password" error={fe.password} hint="At least 8 characters, with a letter and a number.">
          <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={!!fe.password} required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={fe.confirm}>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" aria-invalid={!!fe.confirm} required />
        </Field>
        <SubmitButton size="lg" pendingText="Saving…">
          Save password
        </SubmitButton>
      </form>
    </>
  );
}
