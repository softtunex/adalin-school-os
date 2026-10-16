"use client";

import { useActionState, useState } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { saveAdmissionSettingsAction } from "./actions";

export function AdmissionSettingsForm({
  slug,
  link,
  levels,
  settings,
  editable,
  payNote,
}: {
  slug: string;
  link: string;
  levels: { id: string; name: string }[];
  settings: { open: boolean; levelIds: string[]; fee: string; intro: string; examInfo: string; assessment: "exam" | "interview" | "both" | "none" };
  editable: boolean;
  payNote: string | null;
}) {
  const [state, action] = useActionState(saveAdmissionSettingsAction.bind(null, slug), initialFormState);
  const [copied, setCopied] = useState(false);
  const [all, setAll] = useState(settings.levelIds.length === 0);
  const [assessment, setAssessment] = useState(settings.assessment);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="fs-16 font-semibold">Admission form</h2>
          <p className="mt-0.5 fs-14 text-muted">Parents apply online, pay the form fee, and follow their application on their own page.</p>
        </div>
        <form action={action} className="flex flex-col gap-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{state.success}</Alert> : null}
          <fieldset disabled={!editable} className="flex flex-col gap-4">
            <Checkbox name="open" defaultChecked={settings.open} label="Taking applications" description="When this is off, the form shows that admissions are closed." />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 fs-14 font-semibold text-ink">Classes taking applications</legend>
              <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} label="Every class" />
              {!all ? (
                <div className="grid gap-2 pl-1 sm:grid-cols-3">
                  {levels.map((l) => (
                    <Checkbox key={l.id} name="levelIds" value={l.id} defaultChecked={settings.levelIds.includes(l.id)} label={l.name} />
                  ))}
                </div>
              ) : null}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 fs-14 font-semibold text-ink">How do you assess applicants?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["exam", "Entrance exam", "Invite applicants to sit an exam and record their scores."],
                    ["interview", "Interview", "Invite applicants for an interview and keep notes."],
                    ["both", "Exam and interview", "Use either or both for each applicant."],
                    ["none", "No assessment", "Go straight from application to offer."],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer gap-2.5 rounded-chunk border-2 p-3",
                      assessment === value ? "border-brand bg-brand-wash" : "border-line-strong hover:bg-paper",
                    )}
                  >
                    <input
                      type="radio"
                      name="assessment"
                      value={value}
                      checked={assessment === value}
                      onChange={() => setAssessment(value)}
                      className="mt-1 accent-[var(--brand)]"
                    />
                    <span>
                      <span className="block fs-14.5 font-semibold text-ink">{label}</span>
                      <span className="block fs-13 text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Application form fee (₦)" htmlFor="adm-fee" hint={payNote ?? "Leave empty for a free application."}>
              <Input id="adm-fee" name="fee" inputMode="decimal" defaultValue={settings.fee} placeholder="e.g. 5,000" className="sm:w-48" />
            </Field>
            <Field label="Welcome message (optional)" htmlFor="adm-intro" hint="Shown at the top of the form.">
              <Textarea id="adm-intro" name="intro" rows={3} defaultValue={settings.intro} />
            </Field>
            {assessment === "exam" || assessment === "both" ? (
              <Field label="Entrance exam details (optional)" htmlFor="adm-exam" hint="Date, venue and what to bring. Sent to parents when you invite them to the exam.">
                <Textarea
                  id="adm-exam"
                  name="examInfo"
                  rows={2}
                  defaultValue={settings.examInfo}
                  placeholder="e.g. Saturday 14 March, 9am at the school hall. Bring a pencil and eraser."
                />
              </Field>
            ) : null}
          </fieldset>
          {editable ? (
            <div>
              <SubmitButton>Save</SubmitButton>
            </div>
          ) : null}
        </form>
      </Card>
      <Card className="flex flex-col gap-3 self-start p-5 sm:p-6">
        <h2 className="fs-16 font-semibold">Your admission link</h2>
        <p className="fs-14 text-muted">Share it on WhatsApp, your website or flyers.</p>
        <div className="flex items-center gap-2 rounded-chunk border border-line bg-paper p-2 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono fs-13.5 text-ink">{link}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <a href={link} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-brand-ink hover:underline">
          Open the form <Icon name="arrowRight" size={15} />
        </a>
      </Card>
    </div>
  );
}
