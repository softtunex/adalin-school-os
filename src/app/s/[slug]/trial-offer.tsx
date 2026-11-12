"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { startTrialAction } from "./settings/billing-actions";

/** What Premium adds over Free, in the words a proprietor would use. */
const UNLOCKS = [
  "Parent portal, online fee payment and debtor reminders",
  "SMS and WhatsApp alerts to parents",
  "Result approval, checker PINs and report cards without the watermark",
  "CBT exams, assignments and lesson notes",
  "Payroll, expenses and staff attendance",
  "Online admissions, library, transport and hostel",
  "Unlimited students and staff",
];

/**
 * Tells a school on Free (or Basic) that a month of Premium is free. Opens itself once per school
 * on each browser; after "Not now" the card on the Overview stays as the way back in.
 */
export function TrialOffer({ slug, schoolId, days }: { slug: string; schoolId: string; days: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const seenKey = `trial-offer-seen:${schoolId}`;

  useEffect(() => {
    // After the first paint, so the page matches what the server sent.
    const show = setTimeout(() => {
      try {
        if (!localStorage.getItem(seenKey)) setOpen(true);
      } catch {
        // Storage blocked (private window): the card below is still there.
      }
    }, 400);
    return () => clearTimeout(show);
  }, [seenKey]);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(seenKey, "1");
    } catch {}
    if (result?.tone === "success") router.refresh();
    setResult(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-card border border-brand/30 bg-brand-wash p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-brand text-white shadow-[0_3px_0_var(--brand-deep)]">
          <Icon name="sparkle" size={22} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="fs-16 font-semibold text-ink">Your first month of Premium is free</p>
          <p className="fs-14.5 text-body">Try every feature for {days} days. No card needed, and you can stay on Free afterwards.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="max-sm:w-full">
          See what&apos;s included
        </Button>
      </div>

      <Modal open={open} onClose={close} title={`Try Premium free for ${days} days`}>
        <div className="flex flex-col gap-4">
          {result ? (
            <Alert tone={result.tone}>{result.text}</Alert>
          ) : (
            <>
              <p className="fs-15 text-body">Your school is on the Free plan. Start your free month and everything below opens up straight away:</p>
              <ul className="flex flex-col gap-2">
                {UNLOCKS.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 fs-15 text-ink">
                    <Icon name="checkCircle" size={18} className="mt-0.5 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="fs-14 text-muted">
                No card and no bill. When the {days} days are up, your school goes back to Free unless you choose a plan, and everything you entered stays. SMS credits are bought separately.
              </p>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button variant="secondary" onClick={close}>
              {result?.tone === "success" ? "Let's go" : "Not now"}
            </Button>
            {result?.tone === "success" ? null : (
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await startTrialAction(slug, "premium");
                    setResult(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Your Premium trial has started." });
                  })
                }
              >
                {pending ? "Starting…" : "Start my free month"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
