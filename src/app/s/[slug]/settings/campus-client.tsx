"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import type { FormState } from "@/lib/form-state";
import { addCampusAction, createGroupAction, linkCampusAction, removeCampusAction } from "./campus-actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const run = (fn: () => Promise<FormState>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (!r.error) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

function Result({ r }: { r: FormState }) {
  return r.error ? <Alert tone="danger">{r.error}</Alert> : r.success ? <Alert tone="success">{r.success}</Alert> : null;
}

export function StartGroup({ slug, schoolName }: { slug: string; schoolName: string }) {
  const [name, setName] = useState("");
  const { pending, result, run } = useRun();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createGroupAction(slug, name));
      }}
    >
      <Result r={result} />
      <Field label="Group name" htmlFor="group-name" hint={`${schoolName} becomes the first campus. You can add the others next.`}>
        <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Adalin Schools" required />
      </Field>
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? "Setting up…" : "Start the group"}
      </Button>
    </form>
  );
}

export function AddCampus({ slug, linkable }: { slug: string; linkable: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [pick, setPick] = useState(linkable[0]?.id ?? "");
  const { pending, result, run } = useRun();
  return (
    <div className="flex flex-col gap-4">
      <Result r={result} />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addCampusAction(slug, name), () => setName(""));
        }}
      >
        <Field label="New campus" htmlFor="campus-name" className="min-w-[240px] flex-1">
          <Input id="campus-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Adalin College, Ikoyi" required />
        </Field>
        <Button type="submit" disabled={pending}>
          Add campus
        </Button>
      </form>
      {linkable.length ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => linkCampusAction(slug, pick));
          }}
        >
          <Field label="Or bring in a school you already run" htmlFor="campus-link" className="min-w-[240px] flex-1">
            <Select id="campus-link" value={pick} onChange={(e) => setPick(e.target.value)}>
              {linkable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>
            Add to group
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function RemoveCampus({ slug, schoolId, name, last }: { slug: string; schoolId: string; name: string; last: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Take ${name} out of the group?`}
        confirmLabel="Take it out"
        danger
        onConfirm={async () => {
          const r = await removeCampusAction(slug, schoolId);
          if (!r.error) router.refresh();
          return r;
        }}
      >
        {last ? "It's the last campus, so the group closes. " : ""}Nothing is deleted: it carries on as a school on its own, with all its records and its own bill.
      </ConfirmDialog>
    </>
  );
}
