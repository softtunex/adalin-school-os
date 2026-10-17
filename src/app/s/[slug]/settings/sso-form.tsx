"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";
import { saveSsoAction } from "./sso-actions";

type Provider = "google" | "microsoft";

export function SsoSettingsForm({ slug, initial, providers }: { slug: string; initial: { required: boolean; providers: Provider[] }; providers: { key: Provider; name: string; ready: boolean }[] }) {
  const router = useRouter();
  const [required, setRequired] = useState(initial.required);
  const [chosen, setChosen] = useState<Provider[]>(initial.providers);
  const [result, setResult] = useState<FormState>({});
  const [pending, start] = useTransition();
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="fs-16 font-semibold text-ink">Staff sign-in</h2>
        <p className="mt-1 fs-14 text-body">Anyone can log in with Google or Microsoft once they&apos;ve connected it. Switch this on to make staff use it instead of a password.</p>
      </div>
      {result.error ? <Alert tone="danger">{result.error}</Alert> : result.success ? <Alert tone="success">{result.success}</Alert> : null}
      <Checkbox label="Staff must log in with their work account" description="Proprietors can always use their password, so you can't be locked out." checked={required} onChange={() => setRequired(!required)} />
      <fieldset className="flex flex-col gap-2" disabled={!required}>
        <legend className="mb-1.5 fs-14 font-medium text-ink">Which accounts</legend>
        {providers.map((p) => (
          <Checkbox
            key={p.key}
            label={p.name}
            description={p.ready ? undefined : "Not available yet"}
            checked={chosen.includes(p.key)}
            onChange={() => setChosen((c) => (c.includes(p.key) ? c.filter((x) => x !== p.key) : [...c, p.key]))}
          />
        ))}
      </fieldset>
      <p className="fs-13.5 text-muted">Before you switch it on, make sure each member of staff has connected their account under Your account, or they won&apos;t be able to get in.</p>
      <Button
        className="self-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveSsoAction(slug, { required, providers: chosen });
            setResult(r);
            if (!r.error) router.refresh();
          })
        }
      >
        {pending ? "Saving…" : "Save sign-in rule"}
      </Button>
    </Card>
  );
}
