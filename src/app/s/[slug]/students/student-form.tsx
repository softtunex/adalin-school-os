"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { SubmitButton, buttonClass } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { initialFormState, type FormState } from "@/lib/form-state";
import { NIGERIAN_STATES } from "@/lib/nigeria";

export const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Aunt", "Uncle", "Sibling", "Other"];
const RELIGIONS = ["Christianity", "Islam", "Traditional", "Other"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENOTYPES = ["AA", "AS", "AC", "SS", "SC", "CC"];

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Section({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-line py-6 first:pt-0 last:border-b-0 last:pb-0 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 className="text-[15.5px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13.5px] text-muted">{text}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function GuardianFields({ prefix, v, fe, required }: { prefix: string; v: Record<string, string>; fe: Record<string, string>; required?: boolean }) {
  const f = (name: string) => `${prefix}_${name}`;
  return (
    <>
      <Field label={required ? "Full name" : "Full name (optional)"} htmlFor={f("name")} error={fe[f("name")]}>
        <Input id={f("name")} name={f("name")} defaultValue={v[f("name")]} aria-invalid={!!fe[f("name")]} />
      </Field>
      <Field label="Relationship" htmlFor={f("relationship")}>
        <Select id={f("relationship")} name={f("relationship")} defaultValue={v[f("relationship")] ?? (prefix === "g1" ? "Mother" : "Father")}>
          {RELATIONSHIPS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
      <Field label="Phone number" htmlFor={f("phone")} error={fe[f("phone")]} hint="Used to link siblings and send alerts.">
        <Input id={f("phone")} name={f("phone")} type="tel" inputMode="tel" placeholder="0803 123 4567" defaultValue={v[f("phone")]} aria-invalid={!!fe[f("phone")]} />
      </Field>
      <Field label="Email (optional)" htmlFor={f("email")} error={fe[f("email")]}>
        <Input id={f("email")} name={f("email")} type="email" defaultValue={v[f("email")]} aria-invalid={!!fe[f("email")]} />
      </Field>
      <Field label="Occupation (optional)" htmlFor={f("occupation")} className="sm:col-span-2">
        <Input id={f("occupation")} name={f("occupation")} defaultValue={v[f("occupation")]} />
      </Field>
    </>
  );
}

export function StudentForm({
  action,
  mode,
  defaults = {},
  classes,
  canMedical,
  cancelHref,
}: {
  action: Action;
  mode: "create" | "edit";
  defaults?: Record<string, string>;
  classes: { id: string; name: string }[];
  canMedical: boolean;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const v = { ...defaults, ...state.values };
  const fe = state.fieldErrors ?? {};
  const [second, setSecond] = useState(Boolean(v.g2_name));
  const [gender, setGender] = useState(v.gender ?? "");

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Card className="p-5 sm:p-7">
        <Section title="Student" text="As it should appear on report cards and certificates.">
          <Field label="First name" htmlFor="firstName" error={fe.firstName}>
            <Input id="firstName" name="firstName" defaultValue={v.firstName} aria-invalid={!!fe.firstName} autoComplete="off" />
          </Field>
          <Field label="Surname" htmlFor="lastName" error={fe.lastName}>
            <Input id="lastName" name="lastName" defaultValue={v.lastName} aria-invalid={!!fe.lastName} autoComplete="off" />
          </Field>
          <Field label="Middle name (optional)" htmlFor="middleName" error={fe.middleName}>
            <Input id="middleName" name="middleName" defaultValue={v.middleName} autoComplete="off" />
          </Field>
          <Field label="Date of birth" htmlFor="dateOfBirth" error={fe.dateOfBirth}>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={v.dateOfBirth} aria-invalid={!!fe.dateOfBirth} />
          </Field>
          <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
            <legend className="mb-1.5 text-[14px] font-medium text-ink">Gender</legend>
            <div className="flex gap-2">
              {[
                ["female", "Female"],
                ["male", "Male"],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-chunk border-2 text-[14.5px] font-semibold transition-colors sm:max-w-[160px]",
                    gender === value ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong text-body hover:bg-paper",
                  )}
                >
                  <input type="radio" name="gender" value={value} checked={gender === value} onChange={() => setGender(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
            {fe.gender ? <p className="text-[13.5px] font-medium text-danger">{fe.gender}</p> : null}
          </fieldset>
        </Section>

        <Section title="Class and admission" text="Leave the admission number empty and we'll generate the next one.">
          <Field label="Class" htmlFor="classId" error={fe.classId}>
            <Select id="classId" name="classId" defaultValue={v.classId ?? ""}>
              <option value="">Not in a class yet</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Admission number" htmlFor="admissionNo" error={fe.admissionNo}>
            <Input id="admissionNo" name="admissionNo" defaultValue={v.admissionNo} placeholder={mode === "create" ? "Generated automatically" : undefined} />
          </Field>
          <Field label="Date admitted" htmlFor="admittedOn" error={fe.admittedOn}>
            <Input id="admittedOn" name="admittedOn" type="date" defaultValue={v.admittedOn} />
          </Field>
        </Section>

        <Section title="Background" text="Optional, but often needed for exam registration.">
          <Field label="State of origin" htmlFor="stateOfOrigin" error={fe.stateOfOrigin}>
            <Select id="stateOfOrigin" name="stateOfOrigin" defaultValue={v.stateOfOrigin ?? ""}>
              <option value="">Choose…</option>
              {NIGERIAN_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="LGA" htmlFor="lga">
            <Input id="lga" name="lga" defaultValue={v.lga} />
          </Field>
          <Field label="Religion" htmlFor="religion">
            <Select id="religion" name="religion" defaultValue={v.religion ?? ""}>
              <option value="">Choose…</option>
              {RELIGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Home address" htmlFor="address" className="sm:col-span-2">
            <Input id="address" name="address" defaultValue={v.address} />
          </Field>
        </Section>

        {canMedical ? (
          <Section title="Health" text="Only visible to staff with permission to see medical details.">
            <Field label="Blood group" htmlFor="bloodGroup">
              <Select id="bloodGroup" name="bloodGroup" defaultValue={v.bloodGroup ?? ""}>
                <option value="">Unknown</option>
                {BLOOD_GROUPS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <Field label="Genotype" htmlFor="genotype">
              <Select id="genotype" name="genotype" defaultValue={v.genotype ?? ""}>
                <option value="">Unknown</option>
                {GENOTYPES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </Field>
            <Field label="Allergies and medical notes" htmlFor="medicalNotes" className="sm:col-span-2">
              <Textarea id="medicalNotes" name="medicalNotes" defaultValue={v.medicalNotes} rows={3} placeholder="e.g. Asthmatic, carries an inhaler" />
            </Field>
          </Section>
        ) : null}

        {mode === "create" ? (
          <>
            <Section title="Parent or guardian" text="The main contact for fees, results and alerts. Siblings are linked automatically by phone number.">
              <GuardianFields prefix="g1" v={v} fe={fe} required />
            </Section>
            {second ? (
              <Section title="Second parent or guardian" text="Optional.">
                <GuardianFields prefix="g2" v={v} fe={fe} />
              </Section>
            ) : (
              <div className="pt-4 lg:pl-[272px]">
                <button type="button" onClick={() => setSecond(true)} className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-blue hover:underline">
                  <Icon name="plus" size={17} strokeWidth={2.4} /> Add a second parent or guardian
                </button>
              </div>
            )}
          </>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Link href={cancelHref} className={buttonClass("ghost")}>
          Cancel
        </Link>
        {mode === "create" ? (
          <SubmitButton variant="secondary" name="intent" value="another" pendingText="Saving…">
            Save and add another
          </SubmitButton>
        ) : null}
        <SubmitButton pendingText="Saving…">{mode === "create" ? "Save student" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}
