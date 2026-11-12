"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { KOLA_SVG } from "@/lib/kola-svg";

const KOLA_IMG = `data:image/svg+xml;utf8,${encodeURIComponent(KOLA_SVG)}`;

/** What a school gets with Kola and the AI helpers. Each line matches a helper that exists (see services/ai-*.ts and kola.ts). */
const PERKS = [
  { title: "Ask Kola anything about SchoolHub", text: "Any time, on any page. Kola gives the steps and a short video for what you're doing." },
  { title: "Report card comments, drafted for you", text: "A fitting comment for every student from their scores. Teachers read, edit and approve." },
  { title: "CBT questions in minutes", text: "Type a topic, or snap a page of the textbook, and get questions ready to review." },
  { title: "Import your Excel sheet as it is", text: "Kola matches your own column headings, like \"Pupil's Name\" or \"Father's GSM\"." },
];

/**
 * Stands where "Ask Kola" sits on plans without AI (Free and Basic): an advert, not a chat. Opens a
 * showcase of Kola and the AI helpers, then sends whoever pays to upgrade (no free trial from here),
 * or tells other staff who can switch it on.
 */
export function TryKola({ slug, canBill }: { slug: string; canBill: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div aria-hidden className="h-16" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Try Kola, the SchoolHub AI helper"
        className={cn(
          "fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 z-40 flex items-center gap-2 rounded-full border border-brand/40 bg-canvas py-1.5 pl-1.5 pr-4 shadow-lg transition-transform hover:-translate-y-0.5 sm:right-6",
          "[body:has([data-action-bar])_&]:bottom-[calc(6rem+env(safe-area-inset-bottom,0px))]",
        )}
      >
        <span className="grid size-10 place-items-center rounded-full bg-brand-wash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={KOLA_IMG} alt="" className="size-9" />
        </span>
        <span className="fs-14.5 font-semibold text-ink">Try Kola</span>
        <Icon name="sparkle" size={16} className="text-brand" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Meet Kola, your SchoolHub helper"
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-end gap-3 rounded-card bg-brand-wash p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={KOLA_IMG} alt="" className="size-14 shrink-0" />
            <div className="flex min-w-0 flex-col gap-2">
              <p className="self-end rounded-[14px] rounded-br-sm bg-brand px-3 py-2 fs-14 text-white">How do I send fee reminders to parents?</p>
              <p className="rounded-[14px] rounded-bl-sm border border-line bg-canvas px-3 py-2 fs-14 text-body">
                Open Fees, then Debtors. Tick the parents you want to remind and press Email reminders. They each get what they owe and a link to pay.
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {PERKS.map((p) => (
              <li key={p.title} className="flex items-start gap-3">
                <Icon name="checkCircle" size={20} className="mt-0.5 shrink-0 text-success" />
                <span>
                  <span className="block fs-15 font-semibold text-ink">{p.title}</span>
                  <span className="block fs-14 text-body">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>

          {canBill ? (
            <>
              <p className="fs-14 text-muted">Kola and the AI helpers come with the Standard and Premium plans. Upgrade to switch them on for your whole school.</p>
              <div className="flex flex-wrap justify-end gap-2.5">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Not now
                </Button>
                <ButtonLink href={`/s/${slug}/settings?tab=plan`} onClick={() => setOpen(false)}>
                  Upgrade to try Kola
                </ButtonLink>
              </div>
            </>
          ) : (
            <>
              <p className="fs-14 text-muted">Kola comes with the Standard and Premium plans. Ask your school&apos;s proprietor or bursar to switch it on in Settings.</p>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Got it
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
