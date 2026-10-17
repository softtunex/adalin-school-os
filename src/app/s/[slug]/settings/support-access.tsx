"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { grantSupportAction, revokeSupportAction } from "./billing-actions";

/** The proprietor lets Adalin support into the school for a set time, and can close it again at once. */
export function SupportAccess({ slug, openUntil }: { slug: string; openUntil: string | null }) {
  const router = useRouter();
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const run = (fn: () => Promise<{ error?: string; success?: string }>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (!r.error) {
        setReason("");
        router.refresh();
      }
    });
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="fs-16 font-semibold text-ink">Let Adalin support in</h2>
        <p className="mt-1 fs-14 text-body">
          Adalin can&apos;t see inside your school unless you open it. When you do, our support team can sign in as a proprietor until the time runs out, and everything they do shows in your activity log.
        </p>
      </div>
      {result.error ? <Alert tone="danger">{result.error}</Alert> : result.success ? <Alert tone="success">{result.success}</Alert> : null}
      {openUntil ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-chunk bg-blue-wash p-4">
          <p className="fs-14.5 text-ink">
            Open until <strong>{openUntil}</strong>.
          </p>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => revokeSupportAction(slug))}>
            {pending ? "Closing…" : "Close it now"}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => grantSupportAction(slug, hours, reason));
          }}
        >
          <div className="flex flex-col gap-1.5">
            <span className="fs-14 font-medium text-ink">For how long</span>
            <div className="flex gap-2" role="radiogroup" aria-label="For how long">
              {[24, 72].map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={hours === h}
                  onClick={() => setHours(h)}
                  className={cn("rounded-chunk border-2 px-4 py-2 fs-14.5 font-semibold", hours === h ? "border-brand bg-brand-wash text-ink" : "border-line-strong text-body hover:bg-paper")}
                >
                  {h === 24 ? "24 hours" : "3 days"}
                </button>
              ))}
            </div>
          </div>
          <Field label="What do you need help with?" htmlFor="sup-reason" hint="Optional. It helps us get straight to it.">
            <Input id="sup-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Our report cards are showing the wrong position" />
          </Field>
          <Button type="submit" className="self-start" disabled={pending}>
            {pending ? "Opening…" : "Let support in"}
          </Button>
        </form>
      )}
    </Card>
  );
}
