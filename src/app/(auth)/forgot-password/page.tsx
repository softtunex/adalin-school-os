"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { forgotPasswordAction } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);
  return (
    <>
      <h1 className="text-[32px] font-black tracking-[-0.03em]">Forgot your password?</h1>
      <p className="mt-1 text-[15.5px] text-muted">Enter your email and we&apos;ll send a link to set a new one.</p>
      <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? (
          <Alert tone="success" title="Check your email">
            {state.success}
            {state.data?.devLink ? (
              <a href={state.data.devLink} className="mt-2 block break-all font-mono text-[12.5px] text-blue underline">
                Development only: {state.data.devLink}
              </a>
            ) : null}
          </Alert>
        ) : null}
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} aria-invalid={!!state.fieldErrors?.email} required />
        </Field>
        <SubmitButton size="lg" pendingText="Sending…">
          Send reset link
        </SubmitButton>
      </form>
      <Link href="/login" className="mt-8 text-center text-[15px] font-bold text-blue hover:underline">
        Back to log in
      </Link>
    </>
  );
}
