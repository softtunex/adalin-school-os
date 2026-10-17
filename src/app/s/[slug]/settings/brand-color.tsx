"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { BRAND_PRESETS, brandProblem, brandStyle, DEFAULT_BRAND, normalizeHex } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { setBrandColorAction } from "./actions";

/** Pick the school's colour, see it on a button, a badge and a letterhead, then save. */
export function BrandColorCard({ slug, current, allowed, editable }: { slug: string; current: string | null; allowed: boolean; editable: boolean }) {
  const router = useRouter();
  const [color, setColor] = useState(current ?? DEFAULT_BRAND);
  const [text, setText] = useState(current ?? DEFAULT_BRAND);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const problem = brandProblem(color);
  const pick = (hex: string) => {
    setColor(hex);
    setText(hex);
    setMsg(null);
  };
  const changed = (normalizeHex(color) ?? color) !== (current ?? DEFAULT_BRAND);
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="fs-16 font-semibold">School colour</h2>
          <p className="mt-0.5 max-w-xl fs-14 text-muted">Your colour on ID cards, certificates, letters, report cards, receipts, the admissions form, the document check page and across this app.</p>
        </div>
        {!allowed ? <Badge tone="violet">Premium</Badge> : null}
      </div>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <fieldset disabled={!allowed || !editable || pending} className="flex flex-col gap-4 disabled:opacity-70">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colours">
          {BRAND_PRESETS.map(([name, hex]) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={normalizeHex(color) === hex}
              aria-label={name}
              title={name}
              onClick={() => pick(hex)}
              className={cn("grid size-10 place-items-center rounded-full border-2 transition-transform hover:scale-105", normalizeHex(color) === hex ? "border-ink" : "border-transparent")}
              style={{ background: hex }}
            >
              {normalizeHex(color) === hex ? <Icon name="check" size={18} strokeWidth={3} className="text-white" /> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="color" aria-label="Choose any colour" value={normalizeHex(color) ?? DEFAULT_BRAND} onChange={(e) => pick(e.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-chunk border border-line-strong bg-canvas p-1" />
          <div className="w-32">
          <Input
            aria-label="Colour code"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const h = normalizeHex(e.target.value);
              if (h) setColor(h);
            }}
            className="font-mono"
          />
          </div>
          {problem ? <span className="fs-13.5 text-danger">{problem}</span> : null}
        </div>
        {/* A small likeness of the school's things in the chosen colour. */}
        <div className="grid gap-3 rounded-chunk border border-line bg-paper p-4 sm:grid-cols-2" style={problem ? undefined : brandStyle(normalizeHex(color) ?? DEFAULT_BRAND)}>
          <div className="flex flex-col gap-3">
            <span className="fs-12.5 font-semibold uppercase tracking-wider text-muted">In the app</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-10 items-center rounded-chunk bg-brand px-4 fs-14 font-bold text-white shadow-[0_3px_0_var(--brand-deep)]">Save</span>
              <span className="inline-flex h-7 items-center rounded-full bg-brand-wash px-2.5 fs-13 font-semibold text-brand-ink">Approved</span>
              <span className="fs-14 font-semibold text-brand-ink underline">A link</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="fs-12.5 font-semibold uppercase tracking-wider text-muted">On documents</span>
            <div className="rounded-md bg-white p-2.5 shadow-card">
              <div className="flex items-center gap-2 border-b-2 border-brand pb-1.5">
                <span className="size-5 rounded-full bg-brand" />
                <span className="text-[11px] font-bold text-[#1D1D1F]">Letterhead</span>
              </div>
              <div className="mt-1.5 h-1.5 w-3/4 rounded bg-[#E4E2DE]" />
              <div className="mt-1 h-1.5 w-1/2 rounded bg-[#E4E2DE]" />
            </div>
          </div>
        </div>
      </fieldset>
      {!allowed ? (
        <p className="fs-14 text-body">
          School colours come with the Premium plan.{" "}
          <Link href={`/s/${slug}/settings?tab=plan`} className="font-semibold text-brand-ink hover:underline">
            See plans
          </Link>
        </p>
      ) : editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || !!problem || !changed}
            onClick={() =>
              start(async () => {
                const r = await setBrandColorAction(slug, normalizeHex(color) === DEFAULT_BRAND ? null : normalizeHex(color));
                setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Saved." });
                if (!r.error) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save colour"}
          </Button>
          {current ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                pick(DEFAULT_BRAND);
                start(async () => {
                  const r = await setBrandColorAction(slug, null);
                  setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Saved." });
                  if (!r.error) router.refresh();
                });
              }}
            >
              Use the standard colour
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
