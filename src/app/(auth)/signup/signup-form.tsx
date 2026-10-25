"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { TermsConsent } from "@/components/terms-consent";
import { initialFormState } from "@/lib/form-state";
import { signupAction } from "../actions";
import { PasswordInput } from "@/components/ui/password-input";

export function SignupForm() {
  const [state, action] = useActionState(signupAction, initialFormState);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="School name" htmlFor="schoolName" error={fe.schoolName}>
        <Input id="schoolName" name="schoolName" placeholder="e.g. Adalin College" defaultValue={state.values?.schoolName} aria-invalid={!!fe.schoolName} required />
      </Field>
      <Field label="Your full name" htmlFor="name" error={fe.name}>
        <Input id="name" name="name" autoComplete="name" defaultValue={state.values?.name} aria-invalid={!!fe.name} required />
      </Field>
      <Field label="Email" htmlFor="email" error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} aria-invalid={!!fe.email} required />
      </Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint="At least 8 characters, with a letter and a number.">
        <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={!!fe.password} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fe.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" aria-invalid={!!fe.confirm} required />
      </Field>
      <TermsConsent error={fe.terms} />
      <SubmitButton size="lg" pendingText="Creating your school…">
        Create school
      </SubmitButton>
    </form>
  );
}
