"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!state.fieldErrors?.password} />
      </Field>
      <Link href="/forgot-password" className="-mt-2 self-end fs-14 font-bold text-blue hover:underline">
        Forgot password?
      </Link>
      <SubmitButton size="lg" pendingText="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}
