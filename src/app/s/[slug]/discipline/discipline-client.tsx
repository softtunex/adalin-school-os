"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { deleteBehaviourAction, recordBehaviourAction, resolveAction, saveDisciplineSettingsAction } from "./actions";

type Pupil = { id: string; firstName: string; lastName: string; admissionNo: string; className: string | null };

export function RecordButton({
  slug,
  pupils,
  merits,
  incidents,
  today,
  fixed,
  label = "Record",
}: {
  slug: string;
  pupils: Pupil[];
  merits: string[];
  incidents: string[];
  today: string;
  fixed?: Pupil;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> {label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="Record behaviour"
      >
        <RecordForm key={key} slug={slug} pupils={pupils} merits={merits} incidents={incidents} today={today} fixed={fixed} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function RecordForm({ slug, pupils, merits, incidents, today, fixed, onDone }: { slug: string; pupils: Pupil[]; merits: string[]; incidents: string[]; today: string; fixed?: Pupil; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"merit" | "incident">("merit");
  const [pupil, setPupil] = useState<Pupil | null>(fixed ?? null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState<"minor" | "moderate" | "serious">("minor");
  const [points, setPoints] = useState("1");
  const [description, setDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pupils.filter((p) => `${p.firstName} ${p.lastName} ${p.admissionNo}`.toLowerCase().includes(q)).slice(0, 6);
  }, [search, pupils]);
  const categories = kind === "merit" ? merits : incidents;

  if (msg?.tone === "success") {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{msg.text}</Alert>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setMsg(null);
              setDescription("");
              setActionTaken("");
              if (!fixed) setPupil(null);
            }}
          >
            Record another
          </Button>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone="danger">{msg.text}</Alert> : null}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind">
        {(
          [
            ["merit", "Merit", "Good behaviour", "star"],
            ["incident", "Incident", "Something went wrong", "alert"],
          ] as const
        ).map(([k, l, h, icon]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
              setCategory("");
            }}
            className={cn(
              "flex items-center gap-3 rounded-chunk border-2 p-3 text-left",
              kind === k ? (k === "merit" ? "border-success bg-success-wash" : "border-danger bg-danger-wash") : "border-line-strong hover:bg-paper",
            )}
          >
            <Icon name={icon} size={20} className={k === "merit" ? "text-success" : "text-danger"} />
            <span>
              <span className="block fs-14.5 font-semibold text-ink">{l}</span>
              <span className="block fs-12.5 text-muted">{h}</span>
            </span>
          </button>
        ))}
      </div>
      {fixed ? null : pupil ? (
        <div className="flex items-center justify-between rounded-chunk border border-line bg-paper px-3 py-2.5">
          <span>
            <span className="block fs-14.5 font-semibold text-ink">
              {pupil.firstName} {pupil.lastName}
            </span>
            <span className="block fs-13 text-muted">
              {pupil.className} · {pupil.admissionNo}
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setPupil(null)}>
            Change
          </Button>
        </div>
      ) : (
        <Field label="Student" htmlFor="bh-student">
          <div className="relative">
            <Input id="bh-student" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type a name or admission number" autoComplete="off" autoFocus />
            {matches.length ? (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-chunk border border-line bg-canvas shadow-card" role="listbox">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-paper"
                      onClick={() => {
                        setPupil(p);
                        setSearch("");
                      }}
                    >
                      <span className="fs-14.5 text-ink">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="fs-13 text-muted">{p.className}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="bh-cat">
          <Select id="bh-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        {kind === "incident" ? (
          <Field label="How serious" htmlFor="bh-sev">
            <Select id="bh-sev" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              <option value="minor">Minor (−1 point)</option>
              <option value="moderate">Moderate (−3 points)</option>
              <option value="serious">Serious (−5 points)</option>
            </Select>
          </Field>
        ) : (
          <Field label="Points" htmlFor="bh-pts">
            <Select id="bh-pts" value={points} onChange={(e) => setPoints(e.target.value)}>
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>
                  +{n}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label={kind === "merit" ? "What did they do? (optional)" : "What happened"} htmlFor="bh-desc">
        <Textarea id="bh-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "incident" ? (
          <Field label="Action taken (optional)" htmlFor="bh-action">
            <Input id="bh-action" value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="e.g. Warning, detention" />
          </Field>
        ) : null}
        <Field label="Date" htmlFor="bh-date">
          <Input id="bh-date" type="date" max={today} value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={pending || !pupil || !category}
          onClick={() =>
            start(async () => {
              const r = await recordBehaviourAction(slug, {
                studentId: pupil!.id,
                kind,
                category,
                severity: kind === "incident" ? severity : null,
                points: kind === "merit" ? Number(points) : null,
                description,
                actionTaken,
                occurredOn,
              });
              if (r.error) return setMsg({ tone: "danger", text: r.error });
              setMsg({ tone: "success", text: r.success ?? "Recorded." });
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function BehaviourActions({ slug, id, open, canManage, canDelete }: { slug: string; id: string; open: boolean; canManage: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "resolve" | "delete">(null);
  const [action, setAction] = useState("");
  const [pending, start] = useTransition();
  const items = [
    ...(open && canManage ? [{ label: "Close case", icon: "checkCircle" as const, onSelect: () => setMode("resolve") }] : []),
    ...(canDelete ? [{ label: "Remove", icon: "trash" as const, danger: true, onSelect: () => setMode("delete") }] : []),
  ];
  if (!items.length) return null;
  return (
    <>
      <RowMenu items={items} />
      <Modal open={mode === "resolve"} onClose={() => setMode(null)} title="Close this case">
        <div className="flex flex-col gap-4">
          <Field label="Outcome" htmlFor={`res-${id}`} hint="What was decided, e.g. two days' suspension, apology letter.">
            <Input id={`res-${id}`} value={action} onChange={(e) => setAction(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await resolveAction(slug, id, action);
                  setMode(null);
                  router.refresh();
                })
              }
            >
              Close case
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title="Remove this entry?"
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteBehaviourAction(slug, id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        It comes off the student&apos;s record and the points are taken back.
      </ConfirmDialog>
    </>
  );
}

export function DisciplineSettingsForm({
  slug,
  settings,
  editable,
}: {
  slug: string;
  settings: { meritCategories: string[]; incidentCategories: string[]; notifyIncidents: string; notifyMerits: boolean };
  editable: boolean;
}) {
  const [state, formAction] = useActionState(saveDisciplineSettingsAction.bind(null, slug), initialFormState);
  return (
    <Card className="flex max-w-3xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Behaviour</h2>
        <p className="mt-0.5 fs-14 text-muted">The categories teachers choose from, and what parents hear about.</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Merit categories" htmlFor="ds-merit" hint="One per line.">
              <Textarea id="ds-merit" name="meritCategories" rows={8} defaultValue={settings.meritCategories.join("\n")} />
            </Field>
            <Field label="Incident categories" htmlFor="ds-incident" hint="One per line.">
              <Textarea id="ds-incident" name="incidentCategories" rows={8} defaultValue={settings.incidentCategories.join("\n")} />
            </Field>
          </div>
          <Field label="Tell parents about incidents" htmlFor="ds-notify">
            <Select id="ds-notify" name="notifyIncidents" defaultValue={settings.notifyIncidents} className="sm:w-80">
              <option value="all">Every incident</option>
              <option value="moderate">Moderate and serious</option>
              <option value="serious">Serious only</option>
              <option value="none">Never automatically</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2.5 fs-14.5 text-ink">
            <input type="checkbox" name="notifyMerits" defaultChecked={settings.notifyMerits} className="size-4 accent-[var(--brand)]" />
            Tell parents about merits too (good news travels)
          </label>
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
