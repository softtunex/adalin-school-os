"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { CURRICULA, NIGERIAN_STATES, SCHOOL_TYPES } from "@/lib/nigeria";
import { saveProfileAction } from "./actions";

type Profile = Record<"name" | "motto" | "schoolType" | "curriculum" | "email" | "phone" | "address" | "city" | "state" | "country", string>;

export function ProfileForm({ slug, profile, readOnly }: { slug: string; profile: Profile; readOnly: boolean }) {
  const [state, action] = useActionState(saveProfileAction.bind(null, slug), initialFormState);
  const v = { ...profile, ...state.values };
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <fieldset disabled={readOnly} className="grid gap-5 sm:grid-cols-2">
        <Field label="School name" htmlFor="name" error={fe.name} className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={v.name} aria-invalid={!!fe.name} required />
        </Field>
        <Field label="Motto" htmlFor="motto" error={fe.motto} className="sm:col-span-2" hint="Printed under the school name on report cards.">
          <Input id="motto" name="motto" defaultValue={v.motto} />
        </Field>
        <Field label="School type" htmlFor="schoolType" error={fe.schoolType}>
          <Select id="schoolType" name="schoolType" defaultValue={v.schoolType}>
            <option value="">Choose…</option>
            {SCHOOL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Curriculum" htmlFor="curriculum" error={fe.curriculum}>
          <Select id="curriculum" name="curriculum" defaultValue={v.curriculum}>
            <option value="">Choose…</option>
            {CURRICULA.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="School email" htmlFor="email" error={fe.email}>
          <Input id="email" name="email" type="email" defaultValue={v.email} aria-invalid={!!fe.email} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={fe.phone}>
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={v.phone} placeholder="0803 000 0000" />
        </Field>
        <Field label="Address" htmlFor="address" error={fe.address} className="sm:col-span-2">
          <Input id="address" name="address" defaultValue={v.address} />
        </Field>
        <Field label="City / town" htmlFor="city" error={fe.city}>
          <Input id="city" name="city" defaultValue={v.city} />
        </Field>
        {v.country === "Nigeria" || !v.country ? (
          <Field label="State" htmlFor="state" error={fe.state}>
            <Select id="state" name="state" defaultValue={v.state}>
              <option value="">Choose…</option>
              {NIGERIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="State / region" htmlFor="state" error={fe.state}>
            <Input id="state" name="state" defaultValue={v.state} />
          </Field>
        )}
        <Field label="Country" htmlFor="country" error={fe.country}>
          <Input id="country" name="country" defaultValue={v.country || "Nigeria"} />
        </Field>
      </fieldset>
      {readOnly ? null : (
        <div>
          <SubmitButton>Save profile</SubmitButton>
        </div>
      )}
    </form>
  );
}
