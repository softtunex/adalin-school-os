"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { audienceAction, deleteAnnouncementAction, postAnnouncementAction } from "./actions";

type Reach = { parents: number; withPhone: number; withEmail: number; staff: number } | null;

export function ComposeButton({ slug, classes, smsAllowed, credits }: { slug: string; classes: { id: string; name: string }[]; smsAllowed: boolean; credits: number | null }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> New announcement
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="New announcement"
      >
        <Composer key={key} slug={slug} classes={classes} smsAllowed={smsAllowed} credits={credits} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function Composer({ slug, classes, smsAllowed, credits, onDone }: { slug: string; classes: { id: string; name: string }[]; smsAllowed: boolean; credits: number | null; onDone: () => void }) {
  const [state, action] = useActionState(postAnnouncementAction.bind(null, slug), initialFormState);
  const [audience, setAudience] = useState(state.values?.audience ?? "everyone");
  const [picked, setPicked] = useState<string[]>([]);
  const [sms, setSms] = useState(false);
  const [body, setBody] = useState(state.values?.body ?? "");
  const [reach, setReach] = useState<Reach>(null);
  const [, start] = useTransition();
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    start(async () => setReach(await audienceAction(slug, audience, picked)));
  }, [slug, audience, picked]);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Posted">
          {state.success}
        </Alert>
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  const estimate = reach ? reach.withPhone * Math.max(1, Math.ceil(Math.min(body.length + 40, 300) / 153)) : 0;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Title" htmlFor="ann-title" error={fe.title}>
        <Input id="ann-title" name="title" maxLength={120} defaultValue={state.values?.title} placeholder="e.g. Mid-term break" aria-invalid={!!fe.title} />
      </Field>
      <Field label="Message" htmlFor="ann-body" error={fe.body} hint={`${body.length} / 4,000`}>
        <Textarea id="ann-body" name="body" rows={6} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={!!fe.body} />
      </Field>
      <Field label="Who it's for" htmlFor="ann-audience" error={fe.classIds}>
        <Select id="ann-audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="everyone">Everyone: parents and staff</option>
          <option value="parents">All parents</option>
          <option value="students">Students (student portal)</option>
          <option value="classes">Parents and students of some classes</option>
          <option value="staff">Staff only</option>
        </Select>
      </Field>
      {audience === "classes" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {classes.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded-chunk border border-line-strong px-3 py-2 fs-14 has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
              <input
                type="checkbox"
                name="classIds"
                value={c.id}
                checked={picked.includes(c.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                className="size-4 accent-[var(--brand)]"
              />
              {c.name}
            </label>
          ))}
        </div>
      ) : null}
      {reach ? (
        <p className="rounded-chunk bg-paper px-3.5 py-2.5 fs-13.5 text-body">
          Reaches {audience === "staff" ? `${reach.staff} staff` : `${reach.parents} ${reach.parents === 1 ? "family" : "families"}${reach.staff ? ` and ${reach.staff} staff` : ""}`}. Parents on the app see it straight away.
        </p>
      ) : null}
      {audience !== "staff" ? (
        <div className="flex flex-col gap-2">
          <Checkbox name="email" defaultChecked label="Also email it" description={reach ? `${reach.withEmail} ${reach.withEmail === 1 ? "family has" : "families have"} an email on file.` : undefined} />
          {smsAllowed ? (
            <Checkbox
              name="sms"
              checked={sms}
              onChange={(e) => setSms(e.target.checked)}
              label="Also send by SMS"
              description={reach ? `${reach.withPhone} phone numbers · about ${estimate.toLocaleString()} credits${credits !== null ? ` · you have ${credits.toLocaleString()}` : ""}` : undefined}
            />
          ) : null}
        </div>
      ) : null}
      <Checkbox name="pinned" label="Pin to the top" description="Pinned announcements stay first until you delete them." />
      <SubmitButton pendingText="Posting…">Post announcement</SubmitButton>
    </form>
  );
}

export function AnnouncementMenu({ slug, id, title }: { slug: string; id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowMenu items={[{ label: "Delete", icon: "trash", danger: true, onSelect: () => setOpen(true) }]} />
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete "${title}"?`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          const r = await deleteAnnouncementAction(slug, id);
          if (!r.error) {
            setOpen(false);
            router.refresh();
          }
          return r;
        }}
      >
        It disappears from the parent app and staff screens. Emails and texts already sent can&apos;t be recalled.
      </ConfirmDialog>
    </>
  );
}
