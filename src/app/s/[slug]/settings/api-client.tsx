"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyField } from "@/components/copy-field";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";
import { createApiKeyAction, createWebhookAction, deleteWebhookAction, revokeApiKeyAction, setWebhookActiveAction, testWebhookAction } from "./api-actions";

type Option = { key: string; label: string };

function toggle(list: string[], key: string) {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** A modal form that, once it works, shows a secret one time. */
function SecretForm({
  button,
  title,
  submit,
  secretLabel,
  secretHelp,
  onSubmit,
  children,
  reset,
}: {
  button: string;
  title: string;
  submit: string;
  secretLabel: string;
  secretHelp: string;
  onSubmit: () => Promise<FormState>;
  children: React.ReactNode;
  reset: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const close = () => {
    setOpen(false);
    setSecret(undefined);
    setError(undefined);
    reset();
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {button}
      </Button>
      <Modal open={open} onClose={close} title={title}>
        {!open ? null : secret ? (
          <div className="flex flex-col gap-4">
            <Alert tone="warning" title="Copy it now">
              {secretHelp}
            </Alert>
            <CopyField label={secretLabel} value={secret} />
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                setError(undefined);
                const r = await onSubmit();
                if (r.error) return setError(r.error);
                setSecret(r.data?.key ?? r.data?.secret);
                router.refresh();
              });
            }}
          >
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {children}
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Working…" : submit}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export function NewApiKey({ slug, scopes }: { slug: string; scopes: Option[] }) {
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <SecretForm
      button="New key"
      title="New API key"
      submit="Create key"
      secretLabel="API key"
      secretHelp="This is the only time the full key is shown. Store it in the other system's settings; if it's lost, revoke it and make a new one."
      onSubmit={() => createApiKeyAction(slug, { name, scopes: chosen })}
      reset={() => {
        setName("");
        setChosen([]);
      }}
    >
      <Field label="Name" htmlFor="key-name" hint="Which system uses it, so you know what breaks if you revoke it.">
        <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="School website" required />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 fs-14 font-medium text-ink">What it can read</legend>
        {scopes.map((s) => (
          <Checkbox key={s.key} label={s.label} description={s.key} checked={chosen.includes(s.key)} onChange={() => setChosen((c) => toggle(c, s.key))} />
        ))}
      </fieldset>
    </SecretForm>
  );
}

export function NewWebhook({ slug, events }: { slug: string; events: Option[] }) {
  const [url, setUrl] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <SecretForm
      button="Add webhook"
      title="Add a webhook"
      submit="Add webhook"
      secretLabel="Signing secret"
      secretHelp="Your receiver uses this to check each delivery really came from School OS. It's only shown now."
      onSubmit={() => createWebhookAction(slug, { url, events: chosen })}
      reset={() => {
        setUrl("");
        setChosen([]);
      }}
    >
      <Field label="Address" htmlFor="hook-url" hint="We'll POST JSON here. It must start with https://">
        <Input id="hook-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/school-os" required />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 fs-14 font-medium text-ink">Tell it when</legend>
        {events.map((e) => (
          <Checkbox key={e.key} label={e.label} description={e.key} checked={chosen.includes(e.key)} onChange={() => setChosen((c) => toggle(c, e.key))} />
        ))}
      </fieldset>
    </SecretForm>
  );
}

export function RevokeKey({ slug, keyId, name }: { slug: string; keyId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Revoke
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Revoke "${name}"?`}
        confirmLabel="Revoke key"
        danger
        onConfirm={async () => {
          const r = await revokeApiKeyAction(slug, keyId);
          if (!r.error) router.refresh();
          return r;
        }}
      >
        Anything using this key stops working straight away. This can&apos;t be undone.
      </ConfirmDialog>
    </>
  );
}

export function WebhookActions({ slug, webhookId, active }: { slug: string; webhookId: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const [confirm, setConfirm] = useState(false);
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      router.refresh();
    });
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button size="sm" variant="secondary" disabled={pending || !active} onClick={() => run(() => testWebhookAction(slug, webhookId))}>
          {pending ? "Sending…" : "Send a test"}
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setWebhookActiveAction(slug, webhookId, !active))}>
          {active ? "Switch off" : "Switch on"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Remove
        </Button>
      </div>
      {result.error ? <span className="fs-13 text-danger">{result.error}</span> : result.success ? <span className="fs-13 text-success">{result.success}</span> : null}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Remove this webhook?"
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteWebhookAction(slug, webhookId);
          if (!r.error) router.refresh();
          return r;
        }}
      >
        Nothing more is sent to it, including deliveries waiting to retry.
      </ConfirmDialog>
    </div>
  );
}
