"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { TermsConsent } from "@/components/terms-consent";
import { initialFormState } from "@/lib/form-state";
import { addSchoolAction } from "./actions";

export function NewSchoolForm() {
  const [state, action] = useActionState(addSchoolAction, initialFormState);
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="School name" htmlFor="schoolName" error={state.fieldErrors?.schoolName}>
        <Input id="schoolName" name="schoolName" defaultValue={state.values?.schoolName} aria-invalid={!!state.fieldErrors?.schoolName} required />
      </Field>
      <TermsConsent error={state.fieldErrors?.terms} />
      <SubmitButton size="lg" pendingText="Creating…">
        Create school
      </SubmitButton>
    </form>
  );
}
