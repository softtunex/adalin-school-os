"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";
import { checkDomainAction, removeDomainAction, setDomainAction } from "./domain-actions";

export function DomainForm({ slug, current }: { slug: string; current: string | null }) {
  const router = useRouter();
  const [domain, setDomain] = useState(current ?? "");
  const [result, setResult] = useState<FormState>({});
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-4">
      {result.error ? <Alert tone="danger">{result.error}</Alert> : result.success ? <Alert tone="success">{result.success}</Alert> : null}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setDomainAction(slug, domain));
        }}
      >
        <Field label="Your school's address" htmlFor="custom-domain" hint="A subdomain works best, e.g. portal.yourschool.edu.ng" className="min-w-[260px] flex-1">
          <Input id="custom-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="portal.yourschool.edu.ng" autoCapitalize="none" spellCheck={false} required />
        </Field>
        <Button type="submit" disabled={pending || domain.trim().toLowerCase() === current}>
          {current ? "Change" : "Save"}
        </Button>
      </form>
      {current ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending} onClick={() => run(() => checkDomainAction(slug))}>
            {pending ? "Checking…" : "Check now"}
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            Stop using it
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Stop using ${current}?`}
        confirmLabel="Stop using it"
        danger
        onConfirm={async () => {
          const r = await removeDomainAction(slug);
          if (!r.error) {
            setDomain("");
            router.refresh();
          }
          return r;
        }}
      >
        Anyone who bookmarked it will need the usual School OS address instead. Nothing else changes.
      </ConfirmDialog>
    </div>
  );
}
