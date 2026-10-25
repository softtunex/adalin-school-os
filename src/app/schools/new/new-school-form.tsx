"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { TermsConsent } from "@/components/terms-consent";
import { initialFormState } from "@/lib/form-state";
import { addSchoolAction } from "./actions";

const TRIALS = [
  { value: "standard", name: "Standard", detail: "Homework, CBT, online fee payment, SMS alerts and admissions" },
  { value: "premium", name: "Premium", detail: "Everything in Standard, plus payroll, library, transport, hostel and more" },
];

/** `chooseTrial`: the proprietor already has a free school, so this one starts on a trial. */
export function NewSchoolForm({ chooseTrial = false }: { chooseTrial?: boolean }) {
  const [state, action] = useActionState(addSchoolAction, initialFormState);
  return (
    <form action={action} className="mt-8 flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="School name" htmlFor="schoolName" error={state.fieldErrors?.schoolName}>
        <Input id="schoolName" name="schoolName" defaultValue={state.values?.schoolName} aria-invalid={!!state.fieldErrors?.schoolName} required />
      </Field>
      {chooseTrial ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 fs-14 font-medium text-ink">Free trial of</legend>
          {TRIALS.map((t, i) => (
            <label key={t.value} className="flex cursor-pointer items-start gap-3 rounded-chunk border border-line bg-canvas p-3.5 has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
              <input type="radio" name="trialPlan" value={t.value} defaultChecked={i === 0} className="mt-1 accent-[var(--brand)]" />
              <span>
                <span className="block fs-15 font-semibold text-ink">{t.name}</span>
                <span className="block fs-13.5 text-muted">{t.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <TermsConsent error={state.fieldErrors?.terms} />
      <SubmitButton size="lg" pendingText="Creating…">
        {chooseTrial ? "Create school and start trial" : "Create school"}
      </SubmitButton>
    </form>
  );
}
