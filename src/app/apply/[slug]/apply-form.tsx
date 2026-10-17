"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { applyAction } from "./actions";

export function ApplyForm({ slug, levels, feeLabel }: { slug: string; levels: { id: string; name: string }[]; feeLabel: string | null }) {
  const [state, action] = useActionState(applyAction.bind(null, slug), initialFormState);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {/* Honeypot: hidden from people, filled in by bots. */}
      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="fs-17 font-bold">About the child</h2>
        <Field label="Class applying for" htmlFor="ap-level" error={fe.levelId}>
          <Select id="ap-level" name="levelId" defaultValue={v.levelId ?? ""} aria-invalid={!!fe.levelId}>
            <option value="" disabled>
              Choose a class…
            </option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" htmlFor="ap-first" error={fe.firstName}>
            <Input id="ap-first" name="firstName" autoComplete="off" defaultValue={v.firstName} aria-invalid={!!fe.firstName} />
          </Field>
          <Field label="Middle name" htmlFor="ap-middle" error={fe.middleName}>
            <Input id="ap-middle" name="middleName" autoComplete="off" defaultValue={v.middleName} />
          </Field>
          <Field label="Surname" htmlFor="ap-last" error={fe.lastName}>
            <Input id="ap-last" name="lastName" autoComplete="off" defaultValue={v.lastName} aria-invalid={!!fe.lastName} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Boy or girl" htmlFor="ap-gender" error={fe.gender}>
            <Select id="ap-gender" name="gender" defaultValue={v.gender ?? ""} aria-invalid={!!fe.gender}>
              <option value="" disabled>
                Choose…
              </option>
              <option value="male">Boy</option>
              <option value="female">Girl</option>
            </Select>
          </Field>
          <Field label="Date of birth" htmlFor="ap-dob" error={fe.dateOfBirth}>
            <Input id="ap-dob" name="dateOfBirth" type="date" defaultValue={v.dateOfBirth} />
          </Field>
        </div>
        <Field label="Current or last school (optional)" htmlFor="ap-prev" error={fe.previousSchool}>
          <Input id="ap-prev" name="previousSchool" defaultValue={v.previousSchool} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="fs-17 font-bold">Parent or guardian</h2>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="Your full name" htmlFor="ap-gname" error={fe.guardianName}>
            <Input id="ap-gname" name="guardianName" autoComplete="name" defaultValue={v.guardianName} aria-invalid={!!fe.guardianName} />
          </Field>
          <Field label="Relationship" htmlFor="ap-rel">
            <Select id="ap-rel" name="guardianRelationship" defaultValue={v.guardianRelationship ?? "Mother"}>
              {["Mother", "Father", "Guardian", "Grandparent", "Uncle", "Aunt", "Sibling"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" htmlFor="ap-phone" error={fe.guardianPhone} hint="We'll text you about the application.">
            <Input id="ap-phone" name="guardianPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={v.guardianPhone} placeholder="0803 123 4567" aria-invalid={!!fe.guardianPhone} />
          </Field>
          <Field label="Email (optional)" htmlFor="ap-email" error={fe.guardianEmail}>
            <Input id="ap-email" name="guardianEmail" type="email" autoComplete="email" defaultValue={v.guardianEmail} aria-invalid={!!fe.guardianEmail} />
          </Field>
        </div>
        <Field label="Home address (optional)" htmlFor="ap-address" error={fe.address}>
          <Input id="ap-address" name="address" autoComplete="street-address" defaultValue={v.address} />
        </Field>
        <Field label="Anything the school should know (optional)" htmlFor="ap-notes" error={fe.notes} hint="Health needs, siblings at the school, and so on.">
          <Textarea id="ap-notes" name="notes" rows={3} defaultValue={v.notes} />
        </Field>
      </Card>

      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-start gap-3 fs-14.5 text-body">
          <input type="checkbox" name="consent" required aria-invalid={!!fe.consent} aria-describedby={fe.consent ? "ap-consent-error" : undefined} className="mt-1 size-[18px] shrink-0 accent-[var(--brand)]" />
          <span>
            I&apos;m this child&apos;s parent or guardian, and I agree to the school keeping these details to consider the application and, if the child joins, for their schooling. See the{" "}
            <a href="/privacy" target="_blank" className="font-semibold text-blue hover:underline">
              privacy notice
            </a>
            .
          </span>
        </label>
        {fe.consent ? (
          <p id="ap-consent-error" className="fs-13.5 font-medium text-danger">
            {fe.consent}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <SubmitButton size="lg">Send application</SubmitButton>
        {feeLabel ? <p className="text-center fs-13.5 text-muted">After you apply, you can pay the {feeLabel} application fee online.</p> : null}
      </div>
    </form>
  );
}
