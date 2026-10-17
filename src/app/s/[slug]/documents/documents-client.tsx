"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon, type IconName } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { initialFormState, type FormState } from "@/lib/form-state";
import { DocPreview, sampleData, type Brand } from "./preview";
import { deleteTemplateAction, fromTemplateAction, idCardsAction, revokeAction, saveDocumentSettingsAction, saveTemplateAction, testimonialAction, transcriptAction, uploadSignatureAction } from "./actions";

type Result = FormState & { print?: string };
export type Person = { id: string; name: string; detail: string };
export type Template = { id: string; kind: "letter" | "certificate"; name: string; title: string; body: string };
type Msg = { tone: "success" | "danger"; text: string; print?: string } | null;

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Done.", print: r.print });
      if (!r.error) router.refresh();
    });
  return { pending, msg, setMsg, run };
}

/** The form's main button, with what's still needed said out loud instead of a silent grey button. */
function ActionRow({ missing, children }: { missing: string[]; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {missing.length ? <p className="mr-auto fs-13.5 text-muted">Still needed: {missing.join(", ")}.</p> : null}
      {children}
    </div>
  );
}

function Outcome({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <Alert tone={msg.tone}>
      <span className="flex flex-wrap items-center justify-between gap-3">
        {msg.text}
        {msg.print ? (
          <a href={msg.print} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-ink underline-offset-2 hover:underline">
            <Icon name="download" size={16} /> Open the PDF
          </a>
        ) : null}
      </span>
    </Alert>
  );
}

/** Pick students one by one, or a whole class. */
function StudentPick({ people, classes, value, onChange, single }: { people: Person[]; classes?: { id: string; name: string }[]; value: { classId: string; ids: Person[] }; onChange: (v: { classId: string; ids: Person[] }) => void; single?: boolean }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return people
      .filter((p) => !value.ids.some((x) => x.id === p.id) && `${p.name} ${p.detail}`.toLowerCase().includes(s))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(s)) - Number(!b.name.toLowerCase().startsWith(s)))
      .slice(0, 8);
  }, [q, people, value.ids]);
  return (
    <div className="flex flex-col gap-3">
      {classes && !single ? (
        <Field label="A whole class" htmlFor="dp-class" hint="Or pick students below.">
          <Select id="dp-class" value={value.classId} onChange={(e) => onChange({ classId: e.target.value, ids: [] })} className="sm:w-72">
            <option value="">Choose students instead</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {value.classId ? null : (
        <>
          {value.ids.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Chosen">
              {value.ids.map((p) => (
                <li key={p.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper py-1 pl-3 pr-1 fs-13.5 text-ink">
                  {p.name}
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange({ ...value, ids: value.ids.filter((x) => x.id !== p.id) })} className="grid size-6 place-items-center rounded-full text-muted hover:bg-sunken">
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {single && value.ids.length ? null : (
            <Field label={single ? "Student" : "Students"} htmlFor="dp-q">
              <div className="relative">
                <Input id="dp-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or admission number" autoComplete="off" />
                {matches.length ? (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-chunk border border-line bg-canvas shadow-card" role="listbox" aria-label="Matching students">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-paper"
                          onClick={() => {
                            onChange({ ...value, ids: single ? [p] : [...value.ids, p] });
                            setQ("");
                          }}
                        >
                          <span className="truncate fs-14.5 text-ink">{p.name}</span>
                          <span className="shrink-0 fs-13 text-muted">{p.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Field>
          )}
        </>
      )}
    </div>
  );
}

function IssueCard({ icon, title, text, children }: { icon: IconName; title: string; text: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="grid size-11 place-items-center rounded-chunk bg-brand-wash text-brand">
        <Icon name={icon} size={22} />
      </span>
      <div className="flex-1">
        <h3 className="fs-16 font-semibold text-ink">{title}</h3>
        <p className="mt-1 fs-14 text-muted">{text}</p>
      </div>
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {title.startsWith("ID") ? "Print cards" : `Issue ${title.toLowerCase().replace(/s$/, "")}`}
        </Button>
      </div>
      <Modal open={open} onClose={close} title={title} size="lg">
        {open ? <div key={key}>{children(close)}</div> : null}
      </Modal>
    </Card>
  );
}

function IdCardsForm({ slug, students, staff, classes }: { slug: string; students: Person[]; staff: Person[]; classes: { id: string; name: string }[] }) {
  const [who, setWho] = useState<"students" | "staff">("students");
  const [pick, setPick] = useState<{ classId: string; ids: Person[] }>({ classId: "", ids: [] });
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set());
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-col gap-4">
      <Outcome msg={msg} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cards for">
        {(["students", "staff"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={who === k}
            onClick={() => setWho(k)}
            className={cn("rounded-chunk border-2 px-3 py-2 fs-14 font-semibold", who === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong text-body hover:bg-paper")}
          >
            {k === "students" ? "Students" : "Staff"}
          </button>
        ))}
      </div>
      {who === "students" ? (
        <StudentPick people={students} classes={classes} value={pick} onChange={setPick} />
      ) : (
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-chunk border border-line p-2">
          <label className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 fs-14.5 font-semibold text-ink hover:bg-paper">
            <input type="checkbox" checked={staffIds.size === staff.length} onChange={(e) => setStaffIds(new Set(e.target.checked ? staff.map((s) => s.id) : []))} className="size-4 accent-[var(--brand)]" />
            Everyone ({staff.length})
          </label>
          {staff.map((s) => (
            <label key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 fs-14.5 text-ink hover:bg-paper">
              <input
                type="checkbox"
                checked={staffIds.has(s.id)}
                onChange={() =>
                  setStaffIds((x) => {
                    const n = new Set(x);
                    if (n.has(s.id)) n.delete(s.id);
                    else n.add(s.id);
                    return n;
                  })
                }
                className="size-4 accent-[var(--brand)]"
              />
              <span className="flex-1">{s.name}</span>
              <span className="fs-13 text-muted">{s.detail}</span>
            </label>
          ))}
        </div>
      )}
      <p className="fs-13.5 text-muted">
        Eight cards to an A4 sheet, bank-card size, with the backs on the next page. Print double-sided, flipping on the long edge, and each back lines up behind its card. A reprinted card keeps the same code; revoke a lost card in the
        register.
      </p>
      <ActionRow missing={who === "students" ? (!pick.classId && !pick.ids.length ? ["a class or some students"] : []) : !staffIds.size ? ["at least one member of staff"] : []}>
        <Button
          disabled={pending || (who === "students" ? !pick.classId && !pick.ids.length : !staffIds.size)}
          onClick={() =>
            run(() =>
              idCardsAction(slug, who === "students" ? { classId: pick.classId || null, studentIds: pick.ids.map((p) => p.id) } : { staff: true, membershipIds: [...staffIds] }),
            )
          }
        >
          {pending ? "Preparing…" : "Make the cards"}
        </Button>
      </ActionRow>
    </div>
  );
}

function TestimonialForm({ slug, students, thisYear }: { slug: string; students: (Person & { joined: string | null; className: string | null })[]; thisYear: string }) {
  const [pick, setPick] = useState<{ classId: string; ids: Person[] }>({ classId: "", ids: [] });
  const chosen = students.find((s) => s.id === pick.ids[0]?.id);
  const [d, setD] = useState({ conduct: "Very good", yearsFrom: "", yearsTo: thisYear, lastClass: "", offices: "", activities: "", remark: "" });
  const { pending, msg, run } = useRun();
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="flex flex-col gap-4">
      <Outcome msg={msg} />
      <StudentPick
        people={students}
        value={pick}
        single
        onChange={(v) => {
          setPick(v);
          const s = students.find((x) => x.id === v.ids[0]?.id);
          if (s) setD((x) => ({ ...x, yearsFrom: x.yearsFrom || (s.joined?.slice(0, 4) ?? ""), lastClass: x.lastClass || (s.className ?? "") }));
        }}
      />
      {chosen ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Joined" htmlFor="ts-from">
              <Input id="ts-from" value={d.yearsFrom} onChange={set("yearsFrom")} inputMode="numeric" placeholder="2020" />
            </Field>
            <Field label="Left" htmlFor="ts-to">
              <Input id="ts-to" value={d.yearsTo} onChange={set("yearsTo")} inputMode="numeric" />
            </Field>
            <Field label="Last class" htmlFor="ts-class">
              <Input id="ts-class" value={d.lastClass} onChange={set("lastClass")} />
            </Field>
            <Field label="Conduct" htmlFor="ts-conduct">
              <Select id="ts-conduct" value={d.conduct} onChange={set("conduct")}>
                {["Excellent", "Very good", "Good", "Fair"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Offices held" htmlFor="ts-off">
              <Input id="ts-off" value={d.offices} onChange={set("offices")} placeholder="Head girl, Library prefect" />
            </Field>
            <Field label="Clubs and activities" htmlFor="ts-act">
              <Input id="ts-act" value={d.activities} onChange={set("activities")} placeholder="Debate club, JETS club" />
            </Field>
          </div>
          <Field label="About them" htmlFor="ts-remark" hint={`A sentence or two, at least 10 characters (${d.remark.trim().length} so far).`}>
            <Textarea id="ts-remark" rows={3} value={d.remark} onChange={set("remark")} placeholder="A diligent and respectful student who led the debate team to the state finals." />
          </Field>
        </>
      ) : null}
      <ActionRow
        missing={[
          ...(!chosen ? ["the student"] : []),
          ...(chosen && !/^\d{4}$/.test(d.yearsFrom) ? ["the year they joined"] : []),
          ...(chosen && !/^\d{4}$/.test(d.yearsTo) ? ["the year they left"] : []),
          ...(chosen && !d.lastClass.trim() ? ["their last class"] : []),
          ...(chosen && d.remark.trim().length < 10 ? ["a sentence or two about them (at least 10 characters)"] : []),
        ]}
      >
        <Button
          disabled={pending || !chosen || d.remark.trim().length < 10 || !/^\d{4}$/.test(d.yearsFrom) || !/^\d{4}$/.test(d.yearsTo) || !d.lastClass.trim()}
          onClick={() => run(() => testimonialAction(slug, { studentId: chosen!.id, ...d }))}
        >
          {pending ? "Issuing…" : "Issue testimonial"}
        </Button>
      </ActionRow>
    </div>
  );
}

function TranscriptForm({ slug, students }: { slug: string; students: Person[] }) {
  const [pick, setPick] = useState<{ classId: string; ids: Person[] }>({ classId: "", ids: [] });
  const { pending, msg, run } = useRun();
  return (
    <div className="flex flex-col gap-4">
      <Outcome msg={msg} />
      <StudentPick people={students} value={pick} single onChange={setPick} />
      <p className="fs-13.5 text-muted">Every published term&apos;s results, subject by subject, with averages and positions.</p>
      <ActionRow missing={pick.ids.length ? [] : ["the student"]}>
        <Button disabled={pending || !pick.ids.length} onClick={() => run(() => transcriptAction(slug, { studentId: pick.ids[0].id }))}>
          {pending ? "Preparing…" : "Issue transcript"}
        </Button>
      </ActionRow>
    </div>
  );
}

function TemplateIssueForm({ slug, kind, templates, students, classes, brand }: { slug: string; kind: "letter" | "certificate"; templates: Template[]; students: (Person & { className?: string | null })[]; classes: { id: string; name: string }[]; brand: Brand }) {
  const mine = templates.filter((t) => t.kind === kind);
  const [templateId, setTemplateId] = useState(mine[0]?.id ?? "");
  const [pick, setPick] = useState<{ classId: string; ids: Person[] }>({ classId: "", ids: [] });
  const { pending, msg, run } = useRun();
  const tpl = mine.find((t) => t.id === templateId);
  return (
    <div className="flex flex-col gap-4">
      <Outcome msg={msg} />
      <Field label="Template" htmlFor="tf-tpl" hint="Edit the wording under Templates.">
        <Select id="tf-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="sm:w-80">
          {mine.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <StudentPick people={students} classes={classes} value={pick} onChange={setPick} />
      {tpl ? (
        <div className="flex flex-col gap-1.5">
          <span className="fs-13.5 text-muted">{pick.ids.length ? `Preview for ${pick.ids[0].name}` : "Preview with sample details"}</span>
          <div className="rounded-chunk bg-sunken p-3">
            <DocPreview kind={kind} title={tpl.title} body={tpl.body} brand={brand} data={sampleData(brand, pick.ids[0] ? { name: pick.ids[0].name, className: students.find((s) => s.id === pick.ids[0].id)?.className ?? null } : null)} />
          </div>
        </div>
      ) : null}
      <ActionRow missing={[...(!templateId ? ["a template"] : []), ...(!pick.classId && !pick.ids.length ? ["a class or some students"] : [])]}>
        <Button
          disabled={pending || !templateId || (!pick.classId && !pick.ids.length)}
          onClick={() => run(() => fromTemplateAction(slug, { templateId, classId: pick.classId || null, studentIds: pick.ids.map((p) => p.id) }))}
        >
          {pending ? "Preparing…" : kind === "letter" ? "Make the letters" : "Make the certificates"}
        </Button>
      </ActionRow>
    </div>
  );
}

export function IssuePanel({
  slug,
  students,
  staff,
  classes,
  templates,
  thisYear,
  brand,
}: {
  slug: string;
  students: (Person & { joined: string | null; className: string | null })[];
  staff: Person[];
  classes: { id: string; name: string }[];
  templates: Template[];
  thisYear: string;
  brand: Brand;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <IssueCard icon="idCard" title="ID cards" text="Student and staff cards with a photo and a QR code anyone can scan to check them.">
        {() => <IdCardsForm slug={slug} students={students} staff={staff} classes={classes} />}
      </IssueCard>
      <IssueCard icon="file" title="Testimonials" text="For students leaving the school, with their conduct, offices held and your remarks.">
        {() => <TestimonialForm slug={slug} students={students} thisYear={thisYear} />}
      </IssueCard>
      <IssueCard icon="results" title="Transcripts" text="Every published term's results on one page, signed and checkable.">
        {() => <TranscriptForm slug={slug} students={students} />}
      </IssueCard>
      <IssueCard icon="star" title="Certificates" text="Awards and completion certificates from your templates, for one student or a class.">
        {() => <TemplateIssueForm slug={slug} kind="certificate" templates={templates} students={students} classes={classes} brand={brand} />}
      </IssueCard>
      <IssueCard icon="send" title="Letters" text="Letters to parents from your templates, with each child's details filled in.">
        {() => <TemplateIssueForm slug={slug} kind="letter" templates={templates} students={students} classes={classes} brand={brand} />}
      </IssueCard>
    </div>
  );
}

// ---------- Register ----------

export function RevokeButton({ slug, id, serial }: { slug: string; id: string; serial: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <RowMenu label={`More for ${serial}`} items={[{ label: "Revoke", icon: "x", danger: true, onSelect: () => setOpen(true) }]} />
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Revoke ${serial}?`}
        confirmLabel="Revoke"
        danger
        onConfirm={async () => {
          const r = await revokeAction(slug, id, reason);
          if (!r.error) router.refresh();
          return r;
        }}
      >
        <div className="flex flex-col gap-3">
          <p>Anyone who scans its QR code will see it&apos;s no longer valid. This can&apos;t be undone.</p>
          <Field label="Why" htmlFor="rv-reason">
            <Input id="rv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Card lost; new one printed" />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  );
}

// ---------- Templates ----------

const FIELDS = ["name", "first_name", "admission_no", "class", "parent", "school", "date", "session", "term"];

function TemplateForm({ slug, tpl, brand, onDone }: { slug: string; tpl: Partial<Template>; brand: Brand; onDone: () => void }) {
  const [d, setD] = useState({ kind: tpl.kind ?? "letter", name: tpl.name ?? "", title: tpl.title ?? "", body: tpl.body ?? "" });
  const { pending, msg, run } = useRun();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      {msg?.tone === "danger" ? <Alert tone="danger">{msg.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field label="Template name" htmlFor="tp-name">
          <Input id="tp-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Suspension letter" />
        </Field>
        <Field label="Kind" htmlFor="tp-kind">
          <Select id="tp-kind" value={d.kind} disabled={!!tpl.id} onChange={(e) => setD({ ...d, kind: e.target.value as "letter" | "certificate" })}>
            <option value="letter">Letter</option>
            <option value="certificate">Certificate</option>
          </Select>
        </Field>
      </div>
      <Field label={d.kind === "letter" ? "Heading" : "Certificate title"} htmlFor="tp-title">
        <Input id="tp-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </Field>
      <Field label="Wording" htmlFor="tp-body" hint="Leave a blank line between paragraphs.">
        <Textarea id="tp-body" rows={9} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="fs-13.5 text-muted">Preview, with sample details</span>
        <div className="rounded-chunk bg-sunken p-3">
          <DocPreview kind={d.kind} title={d.title || "Heading"} body={d.body || "Your wording appears here."} data={sampleData(brand)} brand={brand} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="fs-13 text-muted">Insert:</span>
        {FIELDS.map((f) => (
          <button key={f} type="button" onClick={() => setD((x) => ({ ...x, body: `${x.body}{{${f}}}` }))} className="rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono fs-12.5 text-ink hover:border-brand">
            {`{{${f}}}`}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await saveTemplateAction(slug, { id: tpl.id, ...d });
              if (!r.error) {
                router.refresh();
                onDone();
              }
              return r;
            })
          }
        >
          {pending ? "Saving…" : "Save template"}
        </Button>
      </div>
    </div>
  );
}

export function TemplateButton({ slug, brand }: { slug: string; brand: Brand }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> New template
      </Button>
      <Modal open={open} onClose={close} title="New template" size="lg">
        <TemplateForm key={key} slug={slug} tpl={{}} brand={brand} onDone={close} />
      </Modal>
    </>
  );
}

export function TemplateActions({ slug, tpl, brand }: { slug: string; tpl: Template; brand: Brand }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  return (
    <>
      <RowMenu
        label={`More for ${tpl.name}`}
        items={[
          { label: "Edit", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Remove", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "edit"} onClose={() => setMode(null)} title={`Edit ${tpl.name}`} size="lg">
        {mode === "edit" ? <TemplateForm slug={slug} tpl={tpl} brand={brand} onDone={() => setMode(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title={`Remove ${tpl.name}?`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteTemplateAction(slug, tpl.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        Documents already issued from it stay valid.
      </ConfirmDialog>
    </>
  );
}

type Signer = { name: string; title: string; signatureUrl: string | null };

function SignatureSlot({ slug, value, onChange, disabled }: { slug: string; value: string | null; onChange: (url: string | null) => void; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="fs-14 font-medium text-ink">Signature</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-16 w-44 place-items-center rounded-chunk border border-dashed border-line-strong bg-canvas">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Signature" className="max-h-14 max-w-40 object-contain" />
          ) : (
            <span className="fs-13 text-muted">No signature yet</span>
          )}
        </div>
        <label className={cn("inline-flex h-10 cursor-pointer items-center gap-2 rounded-chunk border-2 border-line-strong bg-canvas px-3.5 fs-14 font-semibold text-ink hover:bg-paper", (disabled || pending) && "pointer-events-none opacity-60")}>
          <Icon name="upload" size={16} />
          {pending ? "Uploading…" : value ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={disabled || pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const fd = new FormData();
              fd.set("signature", file);
              setError(null);
              start(async () => {
                const r = await uploadSignatureAction(slug, fd);
                if (r.error || !r.url) setError(r.error ?? "That didn't upload.");
                else onChange(r.url);
              });
            }}
          />
        </label>
        {value && !disabled ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        ) : null}
      </div>
      {error ? <span className="fs-13 text-danger">{error}</span> : <span className="fs-13 text-muted">A photo of the signature on white paper, or a PNG with a clear background. Up to 500 KB.</span>}
    </div>
  );
}

export function DocumentSettingsForm({ slug, settings, editable }: { slug: string; settings: { signatories: { name: string; title: string; signatureUrl?: string | null }[]; cardNote: string }; editable: boolean }) {
  const router = useRouter();
  const [signers, setSigners] = useState<Signer[]>(settings.signatories.map((x) => ({ name: x.name, title: x.title, signatureUrl: x.signatureUrl ?? null })));
  const [cardNote, setCardNote] = useState(settings.cardNote);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const update = (i: number, patch: Partial<Signer>) => setSigners((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Card className="flex max-w-3xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Documents</h2>
        <p className="mt-0.5 fs-14 text-muted">Who signs testimonials, certificates and transcripts, and what ID cards say on the back. Letters carry the first signature.</p>
      </div>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <fieldset disabled={!editable || pending} className="flex flex-col gap-4">
        {signers.map((sg, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-chunk border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="fs-14 font-semibold text-ink">Signatory {i + 1}{i === 0 ? " (also signs letters and ID cards)" : ""}</span>
              {signers.length > 1 ? (
                <Button variant="ghost" size="sm" onClick={() => setSigners((xs) => xs.filter((_, j) => j !== i))}>
                  <Icon name="x" size={15} /> Remove
                </Button>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor={`ds-name-${i}`}>
                <Input id={`ds-name-${i}`} value={sg.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={i === 0 ? "Dr Adebayo Ogunleye" : "Mr Olatunji Buari"} />
              </Field>
              <Field label="Title" htmlFor={`ds-title-${i}`}>
                <Input id={`ds-title-${i}`} value={sg.title} onChange={(e) => update(i, { title: e.target.value })} placeholder={i === 0 ? "Principal" : "Proprietor"} />
              </Field>
            </div>
            <SignatureSlot slug={slug} value={sg.signatureUrl} onChange={(url) => update(i, { signatureUrl: url })} disabled={!editable} />
          </div>
        ))}
        {signers.length < 3 && editable ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => setSigners((xs) => [...xs, { name: "", title: xs.length === 1 ? "Proprietor" : "", signatureUrl: null }])}>
              <Icon name="plus" size={16} /> Add a signatory
            </Button>
          </div>
        ) : null}
        <Field label="ID card note" htmlFor="ds-note" hint="Printed on the back of every card.">
          <Input id="ds-note" value={cardNote} onChange={(e) => setCardNote(e.target.value)} />
        </Field>
      </fieldset>
      {editable ? (
        <div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveDocumentSettingsAction(slug, { signatories: signers, cardNote });
                setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Saved." });
                if (!r.error) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
