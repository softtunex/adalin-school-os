"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { studentLoginAction } from "./actions";

export function StudentLoginForm({ school }: { school: string }) {
  const [state, action] = useActionState(studentLoginAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="School code" htmlFor="school" hint="e.g. adalin-college">
        <Input id="school" name="school" required autoCapitalize="none" autoCorrect="off" defaultValue={state.values?.school ?? school} className="h-12 font-mono" />
      </Field>
      <Field label="Admission number" htmlFor="admissionNo">
        <Input id="admissionNo" name="admissionNo" required autoCapitalize="characters" autoCorrect="off" defaultValue={state.values?.admissionNo} placeholder="ADC/2026/0001" className="h-12 font-mono" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" required autoComplete="current-password" className="h-12" />
      </Field>
      <SubmitButton size="lg" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
