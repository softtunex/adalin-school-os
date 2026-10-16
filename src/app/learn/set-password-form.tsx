"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { setPasswordAction } from "./actions";

export function SetPasswordForm() {
  const [state, action] = useActionState(setPasswordAction, initialFormState);
  return (
    <form action={action} className="mt-5 flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="New password" htmlFor="pw" hint="At least 6 characters.">
        <Input id="pw" name="password" type="password" autoComplete="new-password" required minLength={6} />
      </Field>
      <Field label="Type it again" htmlFor="pw2">
        <Input id="pw2" name="confirm" type="password" autoComplete="new-password" required minLength={6} />
      </Field>
      <SubmitButton pendingText="Saving…">Save password</SubmitButton>
    </form>
  );
}
