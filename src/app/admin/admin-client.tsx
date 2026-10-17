"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { FormState } from "@/lib/form-state";
import { koboToInput, parseNaira } from "@/lib/money";
import {
  confirmDomainAction,
  deliveredAction,
  extendTrialAction,
  manualBillAction,
  markPaidAction,
  openAsSupportAction,
  saveNoteAction,
  setFeaturesAction,
  setPlanAction,
  setStatusAction,
  updatePlanAction,
  voidBillAction,
} from "./actions";

/** Runs an admin action, shows its error, and refreshes the page when it works. */
function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const run = (fn: () => Promise<FormState>, after?: () => void) =>
    start(async () => {
      setError(undefined);
      setSuccess(undefined);
      const r = await fn();
      if (r.error) return setError(r.error);
      setSuccess(r.success);
      after?.();
      router.refresh();
    });
  return { pending, error, success, run, setError };
}

/** A button that opens a small form in a modal. */
function ActionModal({
  label,
  title,
  variant = "secondary",
  confirm,
  danger,
  onSubmit,
  children,
}: {
  label: string;
  title: string;
  variant?: "primary" | "secondary" | "ghost";
  confirm: string;
  danger?: boolean;
  onSubmit: () => Promise<FormState>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const act = useAct();
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        {open ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              act.run(onSubmit, () => setOpen(false));
            }}
          >
            {act.error ? <Alert tone="danger">{act.error}</Alert> : null}
            {children}
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant={danger ? "danger" : "primary"} disabled={act.pending}>
                {act.pending ? "Working…" : confirm}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}

export function PlanControl({ schoolId, current, plans }: { schoolId: string; current: string; plans: { key: string; name: string }[] }) {
  const [plan, setPlan] = useState(current);
  return (
    <ActionModal label="Change plan" title="Change the plan" confirm="Change plan" onSubmit={() => setPlanAction(schoolId, plan)}>
      <Field label="Plan" htmlFor="ad-plan" hint="Takes effect now and raises no bill. Use it for deals, pilots and corrections; ends any trial.">
        <Select id="ad-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {plans.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
    </ActionModal>
  );
}

export function FeatureOverrides({
  schoolId,
  features,
  planFeatures,
  grants,
  blocks,
}: {
  schoolId: string;
  features: { key: string; label: string }[];
  planFeatures: string[];
  grants: string[];
  blocks: string[];
}) {
  const [on, setOn] = useState(() => new Set(features.filter((f) => (planFeatures.includes(f.key) || grants.includes(f.key)) && !blocks.includes(f.key)).map((f) => f.key)));
  const toggle = (key: string) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const next = { grants: features.filter((f) => on.has(f.key) && !planFeatures.includes(f.key)).map((f) => f.key), blocks: features.filter((f) => !on.has(f.key) && planFeatures.includes(f.key)).map((f) => f.key) };
  return (
    <ActionModal label="Change features" title="Features for this school" confirm="Save features" onSubmit={() => setFeaturesAction(schoolId, next)}>
      <p className="fs-14 text-muted">Ticked means on. Anything that differs from the plan is marked, and stays when the plan changes.</p>
      <div className="grid max-h-[50dvh] gap-2 overflow-y-auto sm:grid-cols-2">
        {features.map((f) => {
          const inPlan = planFeatures.includes(f.key);
          const differs = inPlan !== on.has(f.key);
          return <Checkbox key={f.key} label={f.label} description={differs ? (inPlan ? "Switched off for this school" : "Given to this school") : inPlan ? "In the plan" : undefined} checked={on.has(f.key)} onChange={() => toggle(f.key)} />;
        })}
      </div>
    </ActionModal>
  );
}

export function ExtendTrial({ schoolId }: { schoolId: string }) {
  const [days, setDays] = useState(14);
  return (
    <ActionModal label="Extend trial" title="Extend the trial" confirm="Extend" onSubmit={() => extendTrialAction(schoolId, days)}>
      <Field label="By how many days" htmlFor="ad-days">
        <Select id="ad-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className="sm:w-48">
          {[7, 14, 30, 60].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </Select>
      </Field>
    </ActionModal>
  );
}

const STATUS_COPY = {
  active: ["Make active", "Everything works as normal."],
  read_only: ["Make read-only", "Staff can see everything but can't change anything. Parents and students are unaffected."],
  suspended: ["Suspend", "Nobody at the school can use School OS until it's made active again."],
} as const;

export function StatusControl({ schoolId, current }: { schoolId: string; current: string }) {
  const options = (["active", "read_only", "suspended"] as const).filter((s) => s !== current);
  const [status, setStatus] = useState<(typeof options)[number]>(options[0]);
  const [reason, setReason] = useState("");
  return (
    <ActionModal label="Change status" title="Change the school's status" confirm={STATUS_COPY[status][0]} danger={status !== "active"} onSubmit={() => setStatusAction(schoolId, status, reason)}>
      <Field label="Status" htmlFor="ad-status" hint={STATUS_COPY[status][1]}>
        <Select id="ad-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          {options.map((s) => (
            <option key={s} value={s}>
              {STATUS_COPY[s][0]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Why" htmlFor="ad-why" hint="Goes in the activity log.">
        <Input id="ad-why" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
      </Field>
    </ActionModal>
  );
}

export function NoteForm({ schoolId, note }: { schoolId: string; note: string }) {
  const [value, setValue] = useState(note);
  const act = useAct();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act.run(() => saveNoteAction(schoolId, value));
      }}
    >
      <Textarea id="ad-note" aria-label="Note" rows={5} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Contacts, deals agreed, anything the team should know. The school never sees this." />
      <div className="flex items-center justify-end gap-3">
        {act.error ? <span className="fs-13.5 text-danger">{act.error}</span> : act.success ? <span className="fs-13.5 text-success">{act.success}</span> : null}
        <Button type="submit" size="sm" variant="secondary" disabled={act.pending || value === note}>
          {act.pending ? "Saving…" : "Save note"}
        </Button>
      </div>
    </form>
  );
}

export function BillActions({ billId, number }: { billId: string; number: string }) {
  const [via, setVia] = useState("");
  const [reason, setReason] = useState("");
  return (
    <span className="flex justify-end gap-1.5">
      <ActionModal label="Mark paid" title={`Mark ${number} paid`} confirm="Mark paid" onSubmit={() => markPaidAction(billId, via)}>
        <Field label="How it was paid" htmlFor={`via-${billId}`} hint="E.g. bank transfer and its reference. Anything paid for on it switches on.">
          <Input id={`via-${billId}`} value={via} onChange={(e) => setVia(e.target.value)} required minLength={3} />
        </Field>
      </ActionModal>
      <ActionModal label="Cancel" variant="ghost" danger title={`Cancel ${number}?`} confirm="Cancel bill" onSubmit={() => voidBillAction(billId, reason)}>
        <Field label="Why" htmlFor={`void-${billId}`} hint="The school stops being asked for it. Add-ons waiting on it are dropped.">
          <Input id={`void-${billId}`} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
        </Field>
      </ActionModal>
    </span>
  );
}

export function ManualBill({ schoolId }: { schoolId: string }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(14);
  return (
    <ActionModal
      label="New bill"
      title="Bill this school"
      confirm="Raise bill"
      onSubmit={async () => {
        const kobo = parseNaira(amount);
        if (!kobo) return { error: "Enter an amount." };
        return manualBillAction(schoolId, { description, amountKobo: kobo, dueInDays: due });
      }}
    >
      <Field label="What it's for" htmlFor="mb-desc">
        <Input id="mb-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Data migration from old software" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (₦)" htmlFor="mb-amount">
          <Input id="mb-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Due in" htmlFor="mb-due">
          <Select id="mb-due" value={due} onChange={(e) => setDue(Number(e.target.value))}>
            {[0, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "Due today" : `${d} days`}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </ActionModal>
  );
}

export function OpenAsSupport({ schoolId, until }: { schoolId: string; until: string }) {
  const act = useAct();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button size="sm" disabled={act.pending} onClick={() => act.run(() => openAsSupportAction(schoolId))}>
        {act.pending ? "Opening…" : "Open as support"}
      </Button>
      <span className="fs-13 text-muted">Until {until}. Everything you do shows in the school&apos;s own activity log.</span>
      {act.error ? <span className="fs-13.5 text-danger">{act.error}</span> : null}
    </div>
  );
}

export function DeliveredButton({ addonId }: { addonId: string }) {
  const act = useAct();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" disabled={act.pending} onClick={() => act.run(() => deliveredAction(addonId))}>
        {act.pending ? "Saving…" : "Mark delivered"}
      </Button>
      {act.error ? <span className="fs-12.5 text-danger">{act.error}</span> : null}
    </span>
  );
}

export function PlanEditor({
  plan,
  features,
}: {
  plan: { key: string; name: string; pricePerStudentKobo: number | null; features: string[]; limits: Record<string, number> };
  features: { key: string; label: string }[];
}) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(plan.pricePerStudentKobo === null ? "" : koboToInput(plan.pricePerStudentKobo));
  const [limits, setLimits] = useState({ students: plan.limits.students?.toString() ?? "", staff: plan.limits.staff?.toString() ?? "", audit_days: plan.limits.audit_days?.toString() ?? "" });
  const [on, setOn] = useState(() => new Set(plan.features));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <ActionModal
      label="Edit"
      title={`Edit ${plan.name}`}
      confirm="Save plan"
      onSubmit={() =>
        updatePlanAction({
          key: plan.key,
          name,
          pricePerStudentKobo: price.trim() === "" ? null : (parseNaira(price) ?? 0),
          features: features.filter((f) => on.has(f.key)).map((f) => f.key),
          limits: { students: num(limits.students), staff: num(limits.staff), audit_days: num(limits.audit_days) },
        })
      }
    >
      <Alert tone="warning">Changes apply to every school on this plan straight away. Prices change from each school&apos;s next bill.</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`pl-name-${plan.key}`}>
          <Input id={`pl-name-${plan.key}`} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Per student, per term (₦)" htmlFor={`pl-price-${plan.key}`} hint="Leave empty for a custom (quoted) price.">
          <Input id={`pl-price-${plan.key}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Most students" htmlFor={`pl-st-${plan.key}`} hint="Empty for no limit.">
          <Input id={`pl-st-${plan.key}`} inputMode="numeric" value={limits.students} onChange={(e) => setLimits({ ...limits, students: e.target.value })} />
        </Field>
        <Field label="Most staff" htmlFor={`pl-sf-${plan.key}`} hint="Empty for no limit.">
          <Input id={`pl-sf-${plan.key}`} inputMode="numeric" value={limits.staff} onChange={(e) => setLimits({ ...limits, staff: e.target.value })} />
        </Field>
        <Field label="Activity log kept (days)" htmlFor={`pl-au-${plan.key}`}>
          <Input id={`pl-au-${plan.key}`} inputMode="numeric" value={limits.audit_days} onChange={(e) => setLimits({ ...limits, audit_days: e.target.value })} />
        </Field>
      </div>
      <p className="fs-14 font-medium text-ink">Features</p>
      <div className="grid max-h-[40dvh] gap-2 overflow-y-auto sm:grid-cols-2">
        {features.map((f) => (
          <Checkbox
            key={f.key}
            label={f.label}
            checked={on.has(f.key)}
            onChange={() =>
              setOn((s) => {
                const n = new Set(s);
                if (n.has(f.key)) n.delete(f.key);
                else n.add(f.key);
                return n;
              })
            }
          />
        ))}
      </div>
    </ActionModal>
  );
}

export function ConfirmDomain({ schoolId }: { schoolId: string }) {
  const act = useAct();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant="secondary" disabled={act.pending} onClick={() => act.run(() => confirmDomainAction(schoolId))}>
        {act.pending ? "Saving…" : "Mark live"}
      </Button>
      {act.error ? <span className="fs-12.5 text-danger">{act.error}</span> : null}
    </span>
  );
}
