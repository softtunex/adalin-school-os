"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { buyCreditsAction, saveCommsSettingsAction } from "../announcements/actions";

export function BuyCredits({ slug, packs, canBuy }: { slug: string; packs: { key: string; credits: number; price: string; each: string }[]; canBuy: boolean }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {packs.map((p) => (
          <div key={p.key} className="flex flex-col gap-2 rounded-chunk border border-line p-3.5">
            <p className="tabular fs-20 font-semibold leading-none text-ink">{p.credits.toLocaleString()}</p>
            <p className="fs-13 text-muted">credits · {p.each} each</p>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canBuy || pending}
              onClick={() => {
                setBusy(p.key);
                setError(null);
                start(async () => {
                  const r = await buyCreditsAction(slug, p.key);
                  if (r.error) setError(r.error);
                  else if (r.data?.url) window.location.assign(r.data.url);
                  setBusy(null);
                });
              }}
            >
              {busy === p.key ? "Opening…" : `Buy for ${p.price}`}
            </Button>
          </div>
        ))}
      </div>
      {!canBuy ? <p className="fs-13.5 text-muted">Only the proprietor can buy credits.</p> : null}
    </div>
  );
}

export function CommsSettingsForm({
  slug,
  settings,
  sms,
  editable,
}: {
  slug: string;
  settings: { senderId: string; absenceAlerts: boolean; resultAlerts: boolean; paymentAlerts: boolean; smsAlerts: boolean; parentMessaging: boolean; studentResults: boolean; hours: { start: string; end: string } | null };
  sms: boolean;
  editable: boolean;
}) {
  const [state, action] = useActionState(saveCommsSettingsAction.bind(null, slug), initialFormState);
  const [limit, setLimit] = useState(!!settings.hours);
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Alerts and messaging</h2>
        <p className="mt-0.5 fs-14 text-muted">What parents hear automatically. Parents on the app and with an email on file get these for free; SMS copies use credits.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-3">
          <Checkbox name="absenceAlerts" defaultChecked={settings.absenceAlerts} label="Absence alerts" description="When a child is marked absent today, their parents are told within minutes." />
          <Checkbox name="resultAlerts" defaultChecked={settings.resultAlerts} label="Results published" description="Parents are told when their child's report card is ready." />
          <Checkbox name="paymentAlerts" defaultChecked={settings.paymentAlerts} label="Payment receipts" description="Every payment, cash or online, gets a receipt message." />
          <Checkbox
            name="smsAlerts"
            defaultChecked={settings.smsAlerts}
            disabled={!sms || !editable}
            label="Also send these alerts by SMS"
            description={sms ? "Reaches parents who aren't on the app or don't use email. Uses credits." : "SMS is on the Standard plan."}
          />
          <Checkbox name="parentMessaging" defaultChecked={settings.parentMessaging} label="Parents can message teachers" description="Parents write to their child's class teacher from the parent app." />
          <Checkbox name="studentResults" defaultChecked={settings.studentResults} label="Students can see their own results" description="Published report cards also show in the student portal (still held back when fees are owed, if you hold results)." />
          <Checkbox name="limitHours" checked={limit} onChange={(e) => setLimit(e.target.checked)} label="Only during set hours" description="Outside these hours parents can read messages but not send new ones." />
          {limit ? (
            <div className="grid gap-3 sm:w-80 sm:grid-cols-2">
              <Field label="From" htmlFor="hours-start">
                <Input id="hours-start" name="start" type="time" defaultValue={settings.hours?.start ?? "07:00"} />
              </Field>
              <Field label="To" htmlFor="hours-end">
                <Input id="hours-end" name="end" type="time" defaultValue={settings.hours?.end ?? "18:00"} />
              </Field>
            </div>
          ) : null}
          {sms ? (
            <Field label="SMS sender name (optional)" htmlFor="sender" hint="Up to 11 letters, e.g. ADALIN. It must be registered with our SMS provider before use; until then texts come from SchoolOS.">
              <Input id="sender" name="senderId" maxLength={11} defaultValue={settings.senderId} className="sm:w-60" />
            </Field>
          ) : null}
        </fieldset>
        {editable ? (
          <div>
            <SubmitButton>Save settings</SubmitButton>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
