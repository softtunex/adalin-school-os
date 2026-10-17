"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { PrintSheet } from "@/components/print-sheet";
import { generatePinsAction } from "../actions";

type Batch = { batch: string; term: string; pins: { serial: string; pin: string }[] };

function download(batch: Batch, schoolName: string, checkUrl: string) {
  const rows = [["School", "Term", "Serial", "PIN", "Check results at"], ...batch.pins.map((p) => [schoolName, batch.term, p.serial, p.pin, checkUrl])];
  const csv = rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `result-pins-${batch.batch}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export function PinGenerator({ slug, schoolName, checkUrl }: { slug: string; schoolName: string; checkUrl: string }) {
  const [count, setCount] = useState(50);
  const [uses, setUses] = useState(5);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Generate PINs</h2>
        <p className="mt-0.5 fs-14 text-muted">For the current term. Each PIN locks to the first student it&apos;s used for.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How many PINs" htmlFor="pin-count" hint="Up to 1,000 at a time">
          <Input id="pin-count" type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </Field>
        <Field label="Checks allowed per PIN" htmlFor="pin-uses" hint="Usually 5">
          <Input id="pin-uses" type="number" min={1} max={10} value={uses} onChange={(e) => setUses(Number(e.target.value))} />
        </Field>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await generatePinsAction(slug, count, uses);
              if (result.error || !result.pins) setError(result.error ?? "Something went wrong.");
              else {
                setError(undefined);
                setBatch({ batch: result.batch!, term: result.term!, pins: result.pins });
              }
            })
          }
        >
          <Icon name="key" size={17} /> {pending ? "Generating…" : `Generate ${count} PINs`}
        </Button>
      </div>

      {batch ? (
        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <Alert tone="warning" title="Save these PINs now">
            For security, PINs are only shown once. Download or print them before leaving this page.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => download(batch, schoolName, checkUrl)}>
              <Icon name="download" size={17} /> Download CSV
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Icon name="clipboard" size={17} /> Print cards
            </Button>
          </div>
          <PrintSheet>
          <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-3 print:gap-2">
            {batch.pins.map((p) => (
              <div key={p.serial} className="break-inside-avoid rounded-chunk border-2 border-dashed border-line-strong p-3 print:border-black">
                <p className="fs-12 font-semibold uppercase tracking-[0.05em] text-brand-ink">{schoolName}</p>
                <p className="fs-11.5 text-muted">Result checker · {batch.term}</p>
                <p className="mt-2 font-mono fs-18 font-bold tracking-[0.06em] text-ink">{p.pin}</p>
                <p className="font-mono fs-11.5 text-muted">Serial {p.serial}</p>
                <p className="mt-1 break-all fs-11 text-body">{checkUrl}</p>
              </div>
            ))}
          </div>
          </PrintSheet>
        </div>
      ) : null}
    </Card>
  );
}
