"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { saveFeeSettingsAction, saveSettlementAction } from "../fees/actions";

export function SettlementForm({
  slug,
  banks,
  current,
  mode,
  editable,
}: {
  slug: string;
  banks: { name: string; code: string }[];
  current: { name: string; code?: string; accountNumber: string; accountName: string } | null;
  mode: "live" | "test" | "off";
  editable: boolean;
}) {
  const [state, action] = useActionState(saveSettlementAction.bind(null, slug), initialFormState);
  const [bankCode, setBankCode] = useState(state.values?.bankCode ?? current?.code ?? "");
  const fe = state.fieldErrors ?? {};
  const live = mode === "live" && banks.length > 0;

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Where fees are paid into</h2>
        <p className="mt-0.5 fs-14 text-muted">Printed on invoices for bank transfers. Online payments settle straight into this account; School OS never holds your money.</p>
      </div>
      {current ? (
        <div className="rounded-chunk border border-line bg-paper px-4 py-3">
          <p className="fs-15 font-semibold text-ink">{current.accountName}</p>
          <p className="tabular fs-14 text-body">
            {current.name} · {current.accountNumber}
          </p>
        </div>
      ) : null}
      {editable ? (
        <form action={action} className="flex flex-col gap-4" noValidate>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{state.success}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {live ? (
              <Field label="Bank" htmlFor="set-bank" error={fe.bankName}>
                <Select id="set-bank" name="bankCode" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                  <option value="">Choose your bank</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </Select>
                <input type="hidden" name="bankName" value={banks.find((b) => b.code === bankCode)?.name ?? ""} />
              </Field>
            ) : (
              <Field label="Bank" htmlFor="set-bank" error={fe.bankName}>
                <Input id="set-bank" name="bankName" defaultValue={state.values?.bankName ?? current?.name} placeholder="e.g. GTBank" />
              </Field>
            )}
            <Field label="Account number" htmlFor="set-acct" error={fe.accountNumber}>
              <Input id="set-acct" name="accountNumber" inputMode="numeric" maxLength={10} defaultValue={state.values?.accountNumber ?? current?.accountNumber} className="tabular font-mono" />
            </Field>
          </div>
          {live ? (
            <p className="fs-13.5 text-muted">We confirm the account name with your bank before saving.</p>
          ) : (
            <Field label="Account name" htmlFor="set-name" error={fe.accountName} hint="Exactly as the bank has it.">
              <Input id="set-name" name="accountName" defaultValue={state.values?.accountName ?? current?.accountName} />
            </Field>
          )}
          <div>
            <SubmitButton pendingText="Saving…">{current ? "Update account" : "Save account"}</SubmitButton>
          </div>
        </form>
      ) : (
        <p className="fs-14 text-muted">Only the proprietor can change where fees are paid into.</p>
      )}
    </Card>
  );
}

export function FeeRulesForm({
  slug,
  settings,
  standard,
  editable,
}: {
  slug: string;
  settings: { withholdResults: boolean; autoReminders: boolean; reminderEveryDays: number; invoiceNote: string };
  standard: boolean;
  editable: boolean;
}) {
  const [state, action] = useActionState(saveFeeSettingsAction.bind(null, slug), initialFormState);
  const [auto, setAuto] = useState(settings.autoReminders);
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Collection rules</h2>
        <p className="mt-0.5 fs-14 text-muted">How firmly the school follows up on unpaid fees.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-3">
          <Checkbox
            name="withholdResults"
            defaultChecked={settings.withholdResults}
            disabled={!standard || !editable}
            label="Hold results until fees are paid"
            description={standard ? "Parents who still owe for a term can't check that term's result online. Staff can still print report cards." : "Available on the Standard plan."}
          />
          <Checkbox
            name="autoReminders"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            disabled={!standard || !editable}
            label="Send reminders automatically"
            description={standard ? "We email parents who owe on weekday mornings, no more often than you choose below." : "Available on the Standard plan."}
          />
          {auto && standard ? (
            <Field label="Remind each family at most every" htmlFor="rem-days">
              <Select id="rem-days" name="reminderEveryDays" defaultValue={String(settings.reminderEveryDays)} className="sm:w-60">
                {[3, 5, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="reminderEveryDays" value={settings.reminderEveryDays} />
          )}
          <Field label="Note at the bottom of invoices (optional)" htmlFor="inv-note">
            <Textarea id="inv-note" name="invoiceNote" rows={2} maxLength={300} defaultValue={settings.invoiceNote} placeholder="e.g. Fees once paid are not refundable." />
          </Field>
        </fieldset>
        {editable ? (
          <div>
            <SubmitButton>Save rules</SubmitButton>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
