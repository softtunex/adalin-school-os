"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { allergyClash } from "@/lib/health/allergy";
import { initialFormState } from "@/lib/form-state";
import { recordVisitAction, saveHealthRecordAction, saveHealthSettingsAction, updateVisitAction } from "./actions";

export type Pupil = {
  id: string;
  name: string;
  admissionNo: string;
  className: string | null;
  bloodGroup: string | null;
  genotype: string | null;
  allergies: string[] | null;
  conditions: string[] | null;
  medicalNotes: string | null;
};
type Med = { medicine: string; dose: string; allergyOverride?: boolean };
type Msg = { tone: "success" | "danger"; text: string } | null;

const OUTCOMES: [string, string][] = [
  ["", "Still resting here"],
  ["returned", "Back to class"],
  ["rested", "Rested, then back to class"],
  ["sent_home", "Sent home"],
  ["referred", "Referred to hospital"],
];

/** The things a nurse must see before treating: allergies first. */
export function HealthFlags({ allergies, conditions, bloodGroup, genotype, notes }: { allergies: string[]; conditions: string[]; bloodGroup?: string | null; genotype?: string | null; notes?: string | null }) {
  if (!allergies.length && !conditions.length && !bloodGroup && !genotype && !notes) return <p className="fs-13.5 text-muted">No allergies or conditions on record.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {allergies.length ? (
        <p className="flex flex-wrap items-center gap-1.5 fs-13.5">
          <span className="font-semibold text-danger">Allergic to</span>
          {allergies.map((a) => (
            <Badge key={a} tone="danger">
              {a}
            </Badge>
          ))}
        </p>
      ) : null}
      {conditions.length ? (
        <p className="flex flex-wrap items-center gap-1.5 fs-13.5">
          <span className="font-semibold text-ink">Conditions</span>
          {conditions.map((c) => (
            <Badge key={c} tone="warning">
              {c}
            </Badge>
          ))}
        </p>
      ) : null}
      {bloodGroup || genotype ? <p className="fs-13.5 text-body">{[bloodGroup && `Blood group ${bloodGroup}`, genotype && `Genotype ${genotype}`].filter(Boolean).join(" · ")}</p> : null}
      {notes ? <p className="fs-13.5 text-body">{notes}</p> : null}
    </div>
  );
}

/** Type a medicine or pick one the sick bay keeps, in the same style as the other pickers. */
function MedicineInput({ value, onChange, medicines }: { value: string; onChange: (v: string) => void; medicines: string[] }) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = medicines.filter((m) => !q || m.toLowerCase().includes(q)).filter((m) => m.toLowerCase() !== q);
  return (
    <div className="relative">
      <Input
        aria-label="Medicine"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls="sb-medicine-list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Medicine"
      />
      {open && matches.length ? (
        <ul id="sb-medicine-list" role="listbox" aria-label="Kept in the sick bay" className="mt-1 max-h-52 w-full overflow-y-auto rounded-chunk border border-line bg-canvas py-1 shadow-card">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="w-full px-3 py-2 text-left fs-14.5 text-ink hover:bg-paper"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MedicineList({ meds, setMeds, allergies, medicines }: { meds: Med[]; setMeds: (m: Med[]) => void; allergies: string[]; medicines: string[] }) {
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  return (
    <div className="flex flex-col gap-2.5">
      {meds.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-chunk border border-line bg-paper" aria-label="Medicine given">
          {meds.map((m, i) => {
            const clash = allergyClash(allergies, m.medicine);
            return (
              <li key={i} className="flex flex-col gap-1.5 px-3 py-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="fs-14.5 text-ink">
                    <span className="font-semibold">{m.medicine}</span> · {m.dose}
                  </span>
                  <Button variant="ghost" size="sm" aria-label={`Remove ${m.medicine}`} onClick={() => setMeds(meds.filter((_, j) => j !== i))}>
                    <Icon name="x" size={16} />
                  </Button>
                </span>
                {clash ? (
                  <label className="flex items-start gap-2 rounded-lg bg-danger-wash px-2.5 py-2 fs-13.5 text-danger">
                    <input
                      type="checkbox"
                      checked={!!m.allergyOverride}
                      onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, allergyOverride: e.target.checked } : x)))}
                      className="mt-0.5 size-4 accent-[var(--danger)]"
                    />
                    <span>
                      <strong>Allergic to {clash}.</strong> Tick only if a doctor has said this medicine is safe for them.
                    </span>
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="grid items-start gap-2 sm:grid-cols-[1fr_9rem_auto]">
        <MedicineInput value={medicine} onChange={setMedicine} medicines={medicines} />
        <Input aria-label="Dose" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose, e.g. 500mg" />
        <Button
          variant="secondary"
          disabled={!medicine.trim() || !dose.trim()}
          onClick={() => {
            setMeds([...meds, { medicine: medicine.trim(), dose: dose.trim() }]);
            setMedicine("");
            setDose("");
          }}
        >
          <Icon name="plus" size={16} /> Add
        </Button>
      </div>
    </div>
  );
}

function StudentPicker({ pupils, value, onChange }: { pupils: Pupil[]; value: Pupil | null; onChange: (p: Pupil | null) => void }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    // Names that start with what was typed come first, then a word that does, then anywhere.
    const rank = (p: Pupil) => {
      const name = p.name.toLowerCase();
      if (name.startsWith(s) || p.admissionNo.toLowerCase() === s) return 0;
      if (name.split(" ").some((w) => w.startsWith(s))) return 1;
      return `${name} ${p.admissionNo} ${p.className ?? ""}`.toLowerCase().includes(s) ? 2 : 3;
    };
    return pupils
      .map((p) => ({ p, r: rank(p) }))
      .filter((x) => x.r < 3)
      .sort((a, b) => a.r - b.r)
      .slice(0, 8)
      .map((x) => x.p);
  }, [q, pupils]);
  if (value) {
    return (
      <div className="flex flex-col gap-3 rounded-chunk border border-line bg-paper p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block fs-15 font-semibold text-ink">{value.name}</span>
            <span className="block fs-13 text-muted">{[value.className, value.admissionNo].filter(Boolean).join(" · ")}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Change
          </Button>
        </div>
        <HealthFlags allergies={value.allergies ?? []} conditions={value.conditions ?? []} bloodGroup={value.bloodGroup} genotype={value.genotype} notes={value.medicalNotes} />
      </div>
    );
  }
  return (
    <Field label="Student" htmlFor="sb-student">
      <div className="relative">
        <Input id="sb-student" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or admission number" autoComplete="off" autoFocus />
        {matches.length ? (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-chunk border border-line bg-canvas shadow-card" role="listbox" aria-label="Students">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-paper"
                  onClick={() => {
                    onChange(p);
                    setQ("");
                  }}
                >
                  <span className="truncate fs-14.5 text-ink">
                    {p.name}
                    {p.allergies?.length ? <span className="ml-2 fs-12.5 font-semibold text-danger">Allergies</span> : null}
                  </span>
                  <span className="shrink-0 fs-13 text-muted">{p.className}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

export function NewVisitButton({ slug, pupils, medicines }: { slug: string; pupils: Pupil[]; medicines: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [pupil, setPupil] = useState<Pupil | null>(null);
  const [complaint, setComplaint] = useState("");
  const [temp, setTemp] = useState("");
  const [observations, setObservations] = useState("");
  const [treatment, setTreatment] = useState("");
  const [meds, setMeds] = useState<Med[]>([]);
  const [outcome, setOutcome] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const reset = () => {
    setPupil(null);
    setComplaint("");
    setTemp("");
    setObservations("");
    setTreatment("");
    setMeds([]);
    setOutcome("");
    setMsg(null);
  };
  const close = () => {
    setOpen(false);
    reset();
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> New visit
      </Button>
      <Modal open={open} onClose={close} title="Sick bay visit">
        <div className="flex flex-col gap-4">
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
          <StudentPicker pupils={pupils} value={pupil} onChange={setPupil} />
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="What's wrong?" htmlFor="sb-complaint">
              <Input id="sb-complaint" value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Headache, stomach ache, fever…" />
            </Field>
            <Field label="Temperature (°C)" htmlFor="sb-temp">
              <Input id="sb-temp" value={temp} onChange={(e) => setTemp(e.target.value)} inputMode="decimal" placeholder="37.0" />
            </Field>
          </div>
          <Field label="What you saw" htmlFor="sb-obs">
            <Textarea id="sb-obs" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="What you did" htmlFor="sb-treat">
            <Textarea id="sb-treat" rows={2} value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Rested, cold compress, cleaned the wound…" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="fs-14 font-medium text-ink">Medicine given</span>
            <MedicineList meds={meds} setMeds={setMeds} allergies={pupil?.allergies ?? []} medicines={medicines} />
          </div>
          <Field label="How they left" htmlFor="sb-outcome" hint="Parents are told when the visit closes, as set in Settings.">
            <Select id="sb-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} className="sm:w-72">
              {OUTCOMES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button
              disabled={pending || !pupil || complaint.trim().length < 2}
              onClick={() =>
                start(async () => {
                  const r = await recordVisitAction(slug, {
                    studentId: pupil!.id,
                    complaint,
                    temperature: temp ? Number(temp) : null,
                    observations,
                    treatment,
                    medicines: meds,
                    outcome: outcome || null,
                  });
                  if (r.error) return setMsg({ tone: "danger", text: r.error });
                  router.refresh();
                  close();
                })
              }
            >
              {pending ? "Saving…" : outcome ? "Save visit" : "Save, still here"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function CloseVisitButton({ slug, id, name, allergies, medicines }: { slug: string; id: string; name: string; allergies: string[]; medicines: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [treatment, setTreatment] = useState("");
  const [meds, setMeds] = useState<Med[]>([]);
  const [outcome, setOutcome] = useState("returned");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Update or close
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${name} in the sick bay`}>
        <div className="flex flex-col gap-4">
          {msg ? <Alert tone="danger">{msg}</Alert> : null}
          <Field label="What you did" htmlFor="cv-treat">
            <Textarea id="cv-treat" rows={2} value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="Leave empty to keep what's there" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="fs-14 font-medium text-ink">More medicine given</span>
            <MedicineList meds={meds} setMeds={setMeds} allergies={allergies} medicines={medicines} />
          </div>
          <Field label="How they left" htmlFor="cv-outcome">
            <Select id="cv-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} className="sm:w-72">
              {OUTCOMES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button
              variant={outcome === "referred" ? "danger" : "primary"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await updateVisitAction(slug, { id, treatment, medicines: meds, outcome: outcome || null });
                  if (r.error) return setMsg(r.error);
                  setOpen(false);
                  setMeds([]);
                  router.refresh();
                })
              }
            >
              {pending ? "Saving…" : outcome ? "Close the visit" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const split = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function HealthRecordForm({
  slug,
  studentId,
  record,
}: {
  slug: string;
  studentId: string;
  record: { allergies: string[]; conditions: string[]; regularMedication: string; emergencyNote: string; doctor: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState({ ...record, allergies: record.allergies.join(", "), conditions: record.conditions.join(", ") });
  const [msg, setMsg] = useState<Msg>(null);
  const set = (k: keyof typeof r) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setR((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Allergies" htmlFor="hr-all" hint="Separate with commas. Medicines, foods, anything.">
          <Input id="hr-all" value={r.allergies} onChange={set("allergies")} placeholder="Penicillin, groundnuts" />
        </Field>
        <Field label="Conditions" htmlFor="hr-cond" hint="Separate with commas.">
          <Input id="hr-cond" value={r.conditions} onChange={set("conditions")} placeholder="Asthma, sickle cell" />
        </Field>
        <Field label="Regular medication" htmlFor="hr-meds">
          <Input id="hr-meds" value={r.regularMedication} onChange={set("regularMedication")} placeholder="Inhaler before sports" />
        </Field>
        <Field label="Family doctor or hospital" htmlFor="hr-doc">
          <Input id="hr-doc" value={r.doctor} onChange={set("doctor")} placeholder="Dr Okoye, Reddington Hospital, 0803…" />
        </Field>
      </div>
      <Field label="In an emergency" htmlFor="hr-em">
        <Textarea id="hr-em" rows={2} value={r.emergencyNote} onChange={set("emergencyNote")} placeholder="What to do first, who to call" />
      </Field>
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveHealthRecordAction(slug, { studentId, allergies: split(r.allergies), conditions: split(r.conditions), regularMedication: r.regularMedication, emergencyNote: r.emergencyNote, doctor: r.doctor });
              setMsg(res.error ? { tone: "danger", text: res.error } : { tone: "success", text: res.success ?? "Saved." });
              if (!res.error) router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save health record"}
        </Button>
      </div>
    </div>
  );
}

export function HealthSettingsForm({ slug, settings, editable }: { slug: string; settings: { medicines: string[]; notifyParents: string }; editable: boolean }) {
  const [state, formAction] = useActionState(saveHealthSettingsAction.bind(null, slug), initialFormState);
  return (
    <Card className="flex max-w-3xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Sick bay</h2>
        <p className="mt-0.5 fs-14 text-muted">The medicines the sick bay keeps, and what parents hear about.</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <Field label="Medicines kept" htmlFor="hs-meds" hint="One per line. The nurse can still type others.">
            <Textarea id="hs-meds" name="medicines" rows={9} defaultValue={settings.medicines.join("\n")} className="sm:w-96" />
          </Field>
          <Field label="Tell parents" htmlFor="hs-notify">
            <Select id="hs-notify" name="notifyParents" defaultValue={settings.notifyParents} className="sm:w-96">
              <option value="every">After every visit</option>
              <option value="serious">Only when sent home or referred</option>
              <option value="none">Never automatically</option>
            </Select>
          </Field>
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
