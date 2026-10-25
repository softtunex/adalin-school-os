"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { saveAiSettingsAction } from "./ai-actions";

export function AiSettingsForm({ slug, settings, editable, used, limit }: { slug: string; settings: { enabled: boolean; kolaForFamilies: boolean }; editable: boolean; used: number; limit: number }) {
  const [state, action] = useActionState(saveAiSettingsAction.bind(null, slug), initialFormState);
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">AI helpers and Kola</h2>
        <p className="mt-0.5 fs-14 text-muted">AI drafts exam questions, reads questions from a photo, suggests report card comments and answers questions as Kola. Teachers always check what it writes before anything is saved.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-3">
          <Checkbox name="enabled" defaultChecked={settings.enabled} label="Use AI helpers" description="Switch off to hide every AI button in your school." />
          <Checkbox name="kolaForFamilies" defaultChecked={settings.kolaForFamilies} label="Let parents ask Kola" description="Parents can ask Kola how to use the app. Kola only sees what the parent can already see." />
        </fieldset>
        {editable ? (
          <div>
            <SubmitButton>Save</SubmitButton>
          </div>
        ) : null}
      </form>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-baseline justify-between gap-3 fs-14">
          <span className="font-medium text-ink">Used today</span>
          <span className="tabular-nums text-muted">
            {used} of {limit} requests
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-label="AI requests used today" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="fs-13.5 text-muted">The allowance resets at midnight. We only send what each helper needs, never student phone numbers or addresses.</p>
      </div>
    </Card>
  );
}
