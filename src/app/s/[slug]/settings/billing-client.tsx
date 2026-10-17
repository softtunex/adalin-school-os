"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Modal } from "@/components/ui/modal";
import { changePlanAction, payBillAction, startTrialAction } from "./billing-actions";

type Msg = { tone: "success" | "danger"; text: string } | null;

/** A plan card's button: start a trial, upgrade now, or move down from next term. Always confirms first. */
export function PlanButton({
  slug,
  planKey,
  planName,
  mode,
  quote,
}: {
  slug: string;
  planKey: string;
  planName: string;
  mode: "trial" | "upgrade" | "downgrade" | "switch";
  /** What it costs now, already worked out on the server. */
  quote: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const label = { trial: "Start free trial", upgrade: `Upgrade to ${planName}`, downgrade: `Move to ${planName}`, switch: `Choose ${planName}` }[mode];
  return (
    <>
      <Button variant={mode === "downgrade" ? "secondary" : "primary"} size="sm" onClick={() => setOpen(true)} className="w-full">
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setMsg(null);
        }}
        title={label}
      >
        <div className="flex flex-col gap-4">
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : <p className="fs-15 text-body">{quote}</p>}
          <div className="flex justify-end gap-2.5">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setMsg(null);
              }}
            >
              {msg?.tone === "success" ? "Done" : "Cancel"}
            </Button>
            {msg?.tone === "success" ? null : (
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = mode === "trial" ? await startTrialAction(slug, planKey) : await changePlanAction(slug, planKey);
                    setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Done." });
                    if (!r.error) router.refresh();
                  })
                }
              >
                {pending ? "Working…" : mode === "trial" ? "Start the trial" : "Confirm"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

export function PayBillButton({ slug, billId, amount }: { slug: string; billId: string; amount: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await payBillAction(slug, billId);
            if (r.error || !r.url) return setError(r.error ?? "Payment didn't start.");
            window.location.href = r.url;
          })
        }
      >
        {pending ? "Opening…" : `Pay ${amount}`}
      </Button>
      {error ? <span className="max-w-60 text-right fs-12.5 text-danger">{error}</span> : null}
    </span>
  );
}
