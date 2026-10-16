"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { requestCodeAction, verifyCodeAction } from "./actions";

export function ParentLogin() {
  const [sent, send] = useActionState(requestCodeAction, initialFormState);
  const [checked, check] = useActionState(verifyCodeAction, initialFormState);
  const [restart, setRestart] = useState(0);
  const onCode = !!sent.data?.step && restart === 0;
  const destination = sent.data?.destination ?? "";

  if (onCode) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="fs-28 font-black tracking-[-0.03em]">Enter your code</h1>
          <p className="mt-1 fs-15 text-muted">{sent.success}</p>
        </div>
        {sent.data?.testCode ? (
          <Alert tone="blue" title="Test mode">
            No SMS or email provider is connected yet, so here&apos;s the code: <span className="tabular font-mono font-bold text-ink">{sent.data.testCode}</span>
          </Alert>
        ) : null}
        <form action={check} className="flex flex-col gap-5">
          <input type="hidden" name="destination" value={destination} />
          {checked.error ? <Alert tone="danger">{checked.error}</Alert> : null}
          <Field label="6-digit code" htmlFor="code">
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus placeholder="000000" className="tabular h-14 text-center font-mono fs-24 tracking-[0.4em]" />
          </Field>
          <SubmitButton size="lg" pendingText="Checking…">
            Continue
          </SubmitButton>
        </form>
        <button type="button" onClick={() => setRestart((n) => n + 1)} className="self-start fs-14 font-bold text-blue">
          Use a different number or email
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="fs-28 font-black tracking-[-0.03em]">Parent sign in</h1>
        <p className="mt-1 fs-15 text-muted">Use the phone number or email your child&apos;s school has for you. No password needed.</p>
      </div>
      <form
        action={(fd) => {
          setRestart(0);
          send(fd);
        }}
        className="flex flex-col gap-5"
      >
        {sent.error ? <Alert tone="danger">{sent.error}</Alert> : null}
        <Field label="Phone number or email" htmlFor="destination">
          <Input id="destination" name="destination" required autoComplete="tel" defaultValue={sent.values?.destination} placeholder="0803 123 4567" className="h-12 fs-17" />
        </Field>
        <SubmitButton size="lg" pendingText="Sending code…">
          Send me a code
        </SubmitButton>
      </form>
      <p className="fs-14 text-muted">
        School staff?{" "}
        <Link href="/login" className="font-bold text-blue">
          Log in here
        </Link>
      </p>
    </div>
  );
}
