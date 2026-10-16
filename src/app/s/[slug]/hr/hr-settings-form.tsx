"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { saveHrSettingsAction } from "./actions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HrSettingsForm({
  slug,
  settings,
  kinds,
  editable,
}: {
  slug: string;
  settings: { resumeAt: string; lateAfter: string; closeAt: string; workDays: number[]; allowances: Record<string, number | undefined> };
  kinds: { kind: string; label: string }[];
  editable: boolean;
}) {
  const [state, action] = useActionState(saveHrSettingsAction.bind(null, slug), initialFormState);
  return (
    <Card className="flex max-w-3xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Staff hours and leave</h2>
        <p className="mt-0.5 fs-14 text-muted">Staff who clock in after the late time are marked late. Anyone not in by closing time, and not on leave, is marked absent.</p>
      </div>
      <form action={action} className="flex flex-col gap-5">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="School resumes" htmlFor="hr-resume">
              <Input id="hr-resume" name="resumeAt" type="time" defaultValue={settings.resumeAt} />
            </Field>
            <Field label="Late after" htmlFor="hr-late">
              <Input id="hr-late" name="lateAfter" type="time" defaultValue={settings.lateAfter} />
            </Field>
            <Field label="Closing time" htmlFor="hr-close">
              <Input id="hr-close" name="closeAt" type="time" defaultValue={settings.closeAt} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 fs-14 font-semibold text-ink">Workdays</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name="workDays" value={i + 1} defaultChecked={settings.workDays.includes(i + 1)} className="peer sr-only" />
                  <span
                    className={cn(
                      "inline-flex h-10 min-w-14 items-center justify-center rounded-full border-2 px-3 fs-14 font-semibold",
                      "border-line-strong text-body peer-checked:border-brand peer-checked:bg-brand-wash peer-checked:text-brand-ink peer-focus-visible:ring-2 peer-focus-visible:ring-blue",
                    )}
                  >
                    {d}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 fs-14 font-semibold text-ink">Leave allowed each year (working days)</legend>
            <p className="mb-3 fs-13.5 text-muted">Leave 0 for no limit. Unpaid leave is never limited.</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {kinds
                .filter((k) => k.kind !== "unpaid")
                .map((k) => (
                  <Field key={k.kind} label={k.label} htmlFor={`al-${k.kind}`}>
                    <Input id={`al-${k.kind}`} name={`allow_${k.kind}`} type="number" min={0} max={365} defaultValue={settings.allowances[k.kind] ?? 0} />
                  </Field>
                ))}
            </div>
          </fieldset>
        </fieldset>
        {editable ? (
          <div>
            <SubmitButton>Save</SubmitButton>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
