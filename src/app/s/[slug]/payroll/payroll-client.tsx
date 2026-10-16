"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert, Card } from "@/components/ui/display";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { computePay } from "@/lib/payroll/tax";
import { createRunAction, editSlipAction, runAction, savePayProfileAction, savePayrollSettingsAction } from "./actions";

type Line = { name: string; kobo: number };
type DraftLine = { name: string; naira: string };

const toKobo = (naira: string) => {
  const n = Number(naira.replace(/[,\s₦]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const draft = (lines: Line[]): DraftLine[] => lines.map((l) => ({ name: l.name, naira: String(l.kobo / 100) }));
const lines = (d: DraftLine[]): Line[] => d.filter((l) => l.name.trim() && toKobo(l.naira) > 0).map((l) => ({ name: l.name.trim(), kobo: toKobo(l.naira) }));

function LinesEditor({ label, value, onChange, suggestions }: { label: string; value: DraftLine[]; onChange: (v: DraftLine[]) => void; suggestions: string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 fs-14 font-semibold text-ink">{label}</legend>
      {value.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={l.name} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" aria-label={`${label} ${i + 1} name`} list={`sugg-${label}`} />
          <Input value={l.naira} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, naira: e.target.value } : x)))} inputMode="decimal" placeholder="₦ a month" aria-label={`${label} ${i + 1} amount`} className="w-36" />
          <button type="button" aria-label="Remove" className="rounded-full p-1.5 text-muted hover:bg-sunken" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
      <datalist id={`sugg-${label}`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button type="button" className="self-start fs-14 font-semibold text-brand-ink hover:underline" onClick={() => onChange([...value, { name: "", naira: "" }])}>
        + Add {label.toLowerCase().replace(/s$/, "")}
      </button>
    </fieldset>
  );
}

function Preview({ pay }: { pay: ReturnType<typeof computePay> }) {
  const rows: [string, number][] = [
    ["Gross", pay.gross],
    ["PAYE", -pay.paye],
    ["Pension (8%)", -pay.pension],
    ["NHF", -pay.nhf],
    ["Other deductions", -pay.other],
  ];
  return (
    <Card className="flex flex-col gap-1.5 bg-paper p-4">
      {rows
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => (
          <div key={k} className="flex justify-between fs-14 text-body">
            <span>{k}</span>
            <span className="tabular">{v < 0 ? `−${naira(-v)}` : naira(v)}</span>
          </div>
        ))}
      <div className="mt-1 flex justify-between border-t border-line pt-2 fs-15 font-semibold text-ink">
        <span>Take-home</span>
        <span className="tabular">{naira(pay.net)}</span>
      </div>
    </Card>
  );
}

export type Profile = {
  membershipId: string;
  name: string;
  basic: number;
  allowances: Line[];
  deductions: Line[];
  pension: boolean;
  nhf: boolean;
  paye: boolean;
  annualRent: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export function PayProfileButton({ slug, profile, label }: { slug: string; profile: Profile; label: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title={`${profile.name}: pay details`}
      >
        <ProfileForm key={key} slug={slug} profile={profile} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function ProfileForm({ slug, profile, onDone }: { slug: string; profile: Profile; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [basic, setBasic] = useState(profile.basic ? String(profile.basic / 100) : "");
  const [allowances, setAllowances] = useState(draft(profile.allowances));
  const [deductions, setDeductions] = useState(draft(profile.deductions));
  const [pension, setPension] = useState(profile.pension);
  const [nhf, setNhf] = useState(profile.nhf);
  const [paye, setPaye] = useState(profile.paye);
  const [rent, setRent] = useState(profile.annualRent ? String(profile.annualRent / 100) : "");
  const [bankName, setBankName] = useState(profile.bankName);
  const [accountNumber, setAccountNumber] = useState(profile.accountNumber);
  const [accountName, setAccountName] = useState(profile.accountName);
  const [error, setError] = useState<string | null>(null);
  const pay = computePay({ basic: toKobo(basic), allowances: lines(allowances), extras: [], deductions: lines(deductions), pension, nhf, paye, annualRent: toKobo(rent) });
  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Basic salary (₦ a month)" htmlFor="pp-basic">
        <Input id="pp-basic" inputMode="decimal" value={basic} onChange={(e) => setBasic(e.target.value)} placeholder="e.g. 120,000" className="sm:w-56" />
      </Field>
      <LinesEditor label="Allowances" value={allowances} onChange={setAllowances} suggestions={["Housing", "Transport", "Responsibility", "Meal", "Utility"]} />
      <LinesEditor label="Deductions" value={deductions} onChange={setDeductions} suggestions={["Loan repayment", "Co-operative", "Salary advance"]} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Checkbox checked={paye} onChange={(e) => setPaye(e.target.checked)} label="Deduct PAYE" />
        <Checkbox checked={pension} onChange={(e) => setPension(e.target.checked)} label="Pension (8% + 10%)" />
        <Checkbox checked={nhf} onChange={(e) => setNhf(e.target.checked)} label="NHF (2.5%)" />
      </div>
      {paye ? (
        <Field label="Yearly rent (optional)" htmlFor="pp-rent" hint="Gives rent relief on PAYE: 20% of rent, up to ₦500,000 a year.">
          <Input id="pp-rent" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} className="sm:w-56" />
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Bank" htmlFor="pp-bank">
          <Input id="pp-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" />
        </Field>
        <Field label="Account number" htmlFor="pp-acct">
          <Input id="pp-acct" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Account name" htmlFor="pp-acname">
          <Input id="pp-acname" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        </Field>
      </div>
      <Preview pay={pay} />
      <div className="flex justify-end">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await savePayProfileAction(slug, {
                membershipId: profile.membershipId,
                basic: basic || "0",
                allowances: lines(allowances),
                deductions: lines(deductions),
                pension,
                nhf,
                paye,
                annualRent: toKobo(rent),
                bankName,
                accountNumber,
                accountName,
              });
              if (r.error) return setError(r.error);
              router.refresh();
              onDone();
            })
          }
        >
          {pending ? "Saving…" : "Save pay details"}
        </Button>
      </div>
    </div>
  );
}

export function PrepareRun({ slug, defaultMonth }: { slug: string; defaultMonth: string }) {
  const router = useRouter();
  const [state, action] = useActionState(createRunAction.bind(null, slug), initialFormState);
  useEffect(() => {
    if (state.data?.id) router.push(`/s/${slug}/payroll/${state.data.id}`);
  }, [state, router, slug]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label className="flex h-11 items-center gap-2 rounded-chunk border border-line-strong bg-canvas pl-3 fs-14">
        <span className="text-muted">Month</span>
        <input type="month" name="month" defaultValue={defaultMonth} className="h-full bg-transparent pr-2 font-medium text-ink focus:outline-none" />
      </label>
      <SubmitButton>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Prepare payroll
      </SubmitButton>
      {state.error ? <span className="basis-full fs-14 text-danger">{state.error}</span> : null}
    </form>
  );
}

export function RunActions({ slug, id, status, canApprove }: { slug: string; id: string; status: string; canApprove: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | "approve" | "paid" | "delete">(null);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const go = (what: "refresh" | "approve" | "paid" | "delete") =>
    start(async () => {
      const r = await runAction(slug, id, what);
      setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Done." });
      if (!r.error) {
        if (what === "delete") router.push(`/s/${slug}/payroll`);
        else router.refresh();
      }
    });
  const copy = {
    approve: { title: "Approve this payroll?", body: "Payslips are locked and staff can see theirs. You can still mark it paid afterwards.", cta: "Approve" },
    paid: { title: "Mark as paid?", body: "Do this once the transfers have gone out. Staff are told their payslip is ready, and the cost is recorded in Expenses.", cta: "Mark as paid" },
    delete: { title: "Delete this draft?", body: "The payslips are deleted. Pay details stay as they are.", cta: "Delete" },
  } as const;
  return (
    <>
      {status === "draft" ? (
        <>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => go("refresh")}>
            <Icon name="refresh" size={16} /> Refresh from pay details
          </Button>
          {canApprove ? (
            <Button size="sm" disabled={pending} onClick={() => setConfirm("approve")}>
              <Icon name="check" size={16} strokeWidth={2.6} /> Approve
            </Button>
          ) : (
            <span className="fs-13.5 text-muted">Waiting for the proprietor to approve</span>
          )}
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm("delete")} aria-label="Delete draft">
            <Icon name="trash" size={16} />
          </Button>
        </>
      ) : status === "approved" ? (
        <Button variant="success" size="sm" disabled={pending} onClick={() => setConfirm("paid")}>
          <Icon name="banknote" size={16} /> Mark as paid
        </Button>
      ) : null}
      {msg ? (
        <div className="basis-full">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          title={copy[confirm].title}
          confirmLabel={copy[confirm].cta}
          danger={confirm === "delete"}
          onConfirm={async () => {
            const what = confirm;
            setConfirm(null);
            go(what);
          }}
        >
          {copy[confirm].body}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export function EditSlip({
  slug,
  slip,
}: {
  slug: string;
  slip: { id: string; name: string; basic: number; allowances: Line[]; extras: Line[]; deductions: Line[]; settings: { pension: boolean; nhf: boolean; paye: boolean; annualRentKobo: number } };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [extras, setExtras] = useState(draft(slip.extras));
  const [deductions, setDeductions] = useState(draft(slip.deductions));
  const [error, setError] = useState<string | null>(null);
  const pay = computePay({ basic: slip.basic, allowances: slip.allowances, extras: lines(extras), deductions: lines(deductions), pension: slip.settings.pension, nhf: slip.settings.nhf, paye: slip.settings.paye, annualRent: slip.settings.annualRentKobo });
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Icon name="edit" size={15} /> Adjust
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${slip.name}: this month only`}>
        <div className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <LinesEditor label="Extras" value={extras} onChange={setExtras} suggestions={["Bonus", "Overtime", "Exam supervision", "Arrears"]} />
          <LinesEditor label="Deductions" value={deductions} onChange={setDeductions} suggestions={["Salary advance", "Loan repayment", "Lateness"]} />
          <Preview pay={pay} />
          <div className="flex justify-end">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await editSlipAction(slug, { payslipId: slip.id, extras: lines(extras), deductions: lines(deductions) });
                  if (r.error) return setError(r.error);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function PayrollSettingsForm({ slug, settings, editable }: { slug: string; settings: { payDay: number; paye: boolean; pension: boolean; nhf: boolean; recordExpense: boolean }; editable: boolean }) {
  const [state, action] = useActionState(savePayrollSettingsAction.bind(null, slug), initialFormState);
  return (
    <Card className="flex max-w-2xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Payroll</h2>
        <p className="mt-0.5 fs-14 text-muted">Defaults for new staff pay details. Each person can be changed on their own.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <Field label="Pay day" htmlFor="pr-day" hint="Day of the month staff are paid.">
            <Input id="pr-day" name="payDay" type="number" min={1} max={31} defaultValue={settings.payDay} className="w-28" />
          </Field>
          <Checkbox name="paye" defaultChecked={settings.paye} label="Deduct PAYE" description="Worked out on the Nigeria Tax Act 2025 bands." />
          <Checkbox name="pension" defaultChecked={settings.pension} label="Pension" description="8% from staff and 10% from the school, on basic, housing and transport." />
          <Checkbox name="nhf" defaultChecked={settings.nhf} label="National Housing Fund" description="2.5% of basic." />
          <Checkbox name="recordExpense" defaultChecked={settings.recordExpense} label="Record paid payroll in Expenses" description="As Salaries and wages, so the income statement stays complete." />
        </fieldset>
        {editable ? (
          <div>
            <SubmitButton>Save</SubmitButton>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
