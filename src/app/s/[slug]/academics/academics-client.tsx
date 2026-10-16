"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu, type MenuItem } from "@/components/ui/data";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { TEMPLATES, type TemplateKey } from "@/lib/academics/templates";
import { SECTION_LABELS } from "@/lib/academics/templates";
import { initialFormState, type FormState } from "@/lib/form-state";
import { SECTIONS } from "@/lib/academics/sections";
import { cn } from "@/lib/cn";
import {
  addArmAction,
  addLevelAction,
  assignTeacherAction,
  createSessionAction,
  removeClassAction,
  removeSubjectAction,
  saveSubjectAction,
  setCurrentTermAction,
  setupAction,
  updateClassAction,
  updateTermDatesAction,
} from "./actions";

type Staff = { membershipId: string; name: string }[];

function Done({ state, onDone }: { state: FormState; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="success">{state.success}</Alert>
      <Button variant="secondary" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

/** A modal that remounts its form each time it opens, so old results never linger. */
function useDialog() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return {
    open,
    key,
    show: () => setOpen(true),
    close: () => {
      setOpen(false);
      setKey((k) => k + 1);
    },
  };
}

// ---------- Setup wizard ----------

export function SetupWizard({ slug, defaultSession, defaultTemplate }: { slug: string; defaultSession: string; defaultTemplate: TemplateKey }) {
  const [state, action] = useActionState(setupAction.bind(null, slug), initialFormState);
  const [template, setTemplate] = useState<TemplateKey>((state.values?.template as TemplateKey) ?? defaultTemplate);
  const fe = state.fieldErrors ?? {};
  const t = TEMPLATES[template];

  return (
    <form action={action} className="mt-6 flex flex-col gap-6" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <fieldset>
        <legend className="mb-2 text-[14px] font-medium text-ink">Curriculum</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-chunk border-2 p-3.5 transition-colors",
                template === key ? "border-brand bg-brand-wash shadow-[0_3px_0_var(--brand)]" : "border-line-strong hover:bg-paper",
              )}
            >
              <input type="radio" name="template" value={key} checked={template === key} onChange={() => setTemplate(key)} className="size-4 accent-[var(--brand)]" />
              <span>
                <span className="block font-semibold text-ink">{TEMPLATES[key].label}</span>
                <span className="block text-[13px] text-muted">{TEMPLATES[key].termNames.join(", ")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset key={template}>
        <legend className="mb-2 text-[14px] font-medium text-ink">Sections your school runs</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {t.sections.map((s) => (
            <Checkbox key={s.section} name="sections" value={s.section} defaultChecked={s.section !== "creche"} label={s.label} description={s.levels.join(", ")} />
          ))}
        </div>
        {fe.sections ? <p className="mt-2 text-[13.5px] font-medium text-danger">{fe.sections}</p> : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Class arms" htmlFor="arms" hint="Separate with commas, e.g. A, B or Gold, Diamond. Leave empty for one class per level.">
          <Input id="arms" name="arms" defaultValue={state.values?.arms ?? "A, B"} />
        </Field>
        <Field label="Current session" htmlFor="sessionName" error={fe.sessionName}>
          <Input id="sessionName" name="sessionName" defaultValue={state.values?.sessionName ?? defaultSession} aria-invalid={!!fe.sessionName} />
        </Field>
      </div>

      <div>
        <SubmitButton size="lg" pendingText="Setting up your classes…">
          <Icon name="sparkle" size={18} />
          Set up my school
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------- Levels and classes ----------

function AddLevelForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [state, action] = useActionState(addLevelAction.bind(null, slug), initialFormState);
  if (state.success) return <Done state={state} onDone={onDone} />;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Class level name" htmlFor="level-name" error={fe.name} hint="e.g. Year 7, JSS 1, Primary 4">
        <Input id="level-name" name="name" aria-invalid={!!fe.name} />
      </Field>
      <Field label="Section" htmlFor="level-section">
        <Select id="level-section" name="section" defaultValue="primary">
          {SECTIONS.map((s) => (
            <option key={s} value={s}>
              {SECTION_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Arms" htmlFor="level-arms" hint="Separate with commas. Leave empty for a single class.">
        <Input id="level-arms" name="arms" placeholder="A, B" />
      </Field>
      <SubmitButton>Add class level</SubmitButton>
    </form>
  );
}

export function AddLevelButton({ slug }: { slug: string }) {
  const d = useDialog();
  return (
    <>
      <Button onClick={d.show}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        Add class level
      </Button>
      <Modal open={d.open} onClose={d.close} title="Add a class level">
        <AddLevelForm key={d.key} slug={slug} onDone={d.close} />
      </Modal>
    </>
  );
}

function AddArmForm({ slug, levelId, onDone }: { slug: string; levelId: string; onDone: () => void }) {
  const [state, action] = useActionState(addArmAction.bind(null, slug, levelId), initialFormState);
  if (state.success) return <Done state={state} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Arm name" htmlFor="arm" error={state.fieldErrors?.arm} hint="e.g. C, Emerald, Science">
        <Input id="arm" name="arm" aria-invalid={!!state.fieldErrors?.arm} />
      </Field>
      <SubmitButton>Add class</SubmitButton>
    </form>
  );
}

export function AddArmButton({ slug, levelId, levelName }: { slug: string; levelId: string; levelName: string }) {
  const d = useDialog();
  return (
    <>
      <Button variant="secondary" size="sm" onClick={d.show}>
        <Icon name="plus" size={16} strokeWidth={2.4} />
        Add arm
      </Button>
      <Modal open={d.open} onClose={d.close} title={`Add a class to ${levelName}`}>
        <AddArmForm key={d.key} slug={slug} levelId={levelId} onDone={d.close} />
      </Modal>
    </>
  );
}

function EditClassForm({ slug, cls, staff, onDone }: { slug: string; cls: { id: string; classTeacherId: string | null; capacity: number | null }; staff: Staff; onDone: () => void }) {
  const [state, action] = useActionState(updateClassAction.bind(null, slug, cls.id), initialFormState);
  if (state.success) return <Done state={state} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Class teacher" htmlFor="classTeacherId" hint="Takes attendance and writes report card comments for this class.">
        <Select id="classTeacherId" name="classTeacherId" defaultValue={cls.classTeacherId ?? ""}>
          <option value="">Not assigned</option>
          {staff.map((s) => (
            <option key={s.membershipId} value={s.membershipId}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Capacity (optional)" htmlFor="capacity" error={state.fieldErrors?.capacity}>
        <Input id="capacity" name="capacity" type="number" inputMode="numeric" min={1} max={500} defaultValue={cls.capacity ?? ""} />
      </Field>
      <SubmitButton>Save class</SubmitButton>
    </form>
  );
}

export function ClassActions({
  slug,
  cls,
  staff,
}: {
  slug: string;
  cls: { id: string; name: string; classTeacherId: string | null; capacity: number | null; studentCount: number };
  staff: Staff;
}) {
  const edit = useDialog();
  const [confirm, setConfirm] = useState(false);
  const items: MenuItem[] = [
    { label: "Edit class", icon: "edit", onSelect: edit.show },
    { label: "Remove class", icon: "trash", danger: true, onSelect: () => setConfirm(true) },
  ];
  return (
    <>
      <RowMenu items={items} label={`Actions for ${cls.name}`} />
      <Modal open={edit.open} onClose={edit.close} title={`Edit ${cls.name}`}>
        <EditClassForm key={edit.key} slug={slug} cls={cls} staff={staff} onDone={edit.close} />
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Remove ${cls.name}?`} confirmLabel="Remove class" danger onConfirm={() => removeClassAction(slug, cls.id)}>
        {cls.studentCount > 0
          ? `${cls.studentCount} students are in this class. Move them to another class first.`
          : "This class has no students. Its subject teacher assignments will be removed too."}
      </ConfirmDialog>
    </>
  );
}

// ---------- Subjects ----------

type SubjectInput = { id: string; name: string; code: string; levelIds: string[]; electiveLevelIds: string[] };
type Level = { id: string; name: string };

function SubjectForm({ slug, levels, subject, onDone }: { slug: string; levels: Level[]; subject?: SubjectInput; onDone: () => void }) {
  const [state, action] = useActionState(saveSubjectAction.bind(null, slug, subject?.id ?? null), initialFormState);
  const [offered, setOffered] = useState(new Set(subject?.levelIds ?? []));
  if (state.success) return <Done state={state} onDone={onDone} />;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Subject name" htmlFor="subject-name" error={fe.name}>
          <Input id="subject-name" name="name" defaultValue={state.values?.name ?? subject?.name} aria-invalid={!!fe.name} />
        </Field>
        <Field label="Code" htmlFor="subject-code">
          <Input id="subject-code" name="code" defaultValue={state.values?.code ?? subject?.code} placeholder="MTH" />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-[14px] font-medium text-ink">Offered in</legend>
        <div className="flex flex-col divide-y divide-line rounded-chunk border border-line-strong">
          {levels.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-[14.5px] text-ink">
                <input
                  type="checkbox"
                  name="levelIds"
                  value={l.id}
                  defaultChecked={offered.has(l.id)}
                  onChange={(e) => {
                    const next = new Set(offered);
                    if (e.target.checked) next.add(l.id);
                    else next.delete(l.id);
                    setOffered(next);
                  }}
                  className="size-[18px] accent-[var(--brand)]"
                />
                {l.name}
              </label>
              <label className={cn("flex items-center gap-2 text-[13px]", offered.has(l.id) ? "text-body" : "text-line-strong")}>
                <input type="checkbox" name="electiveLevelIds" value={l.id} disabled={!offered.has(l.id)} defaultChecked={subject?.electiveLevelIds.includes(l.id)} className="size-4 accent-[var(--violet)]" />
                Elective
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <SubmitButton>{subject ? "Save subject" : "Add subject"}</SubmitButton>
    </form>
  );
}

export function SubjectEditorButton({ slug, levels }: { slug: string; levels: Level[] }) {
  const d = useDialog();
  return (
    <>
      <Button onClick={d.show}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        Add subject
      </Button>
      <Modal open={d.open} onClose={d.close} title="Add a subject">
        <SubjectForm key={d.key} slug={slug} levels={levels} onDone={d.close} />
      </Modal>
    </>
  );
}

export function SubjectActions({ slug, subject, levels }: { slug: string; subject: SubjectInput; levels: Level[] }) {
  const edit = useDialog();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <RowMenu
        label={`Actions for ${subject.name}`}
        items={[
          { label: "Edit subject", icon: "edit", onSelect: edit.show },
          { label: "Remove subject", icon: "trash", danger: true, onSelect: () => setConfirm(true) },
        ]}
      />
      <Modal open={edit.open} onClose={edit.close} title={`Edit ${subject.name}`}>
        <SubjectForm key={edit.key} slug={slug} levels={levels} subject={subject} onDone={edit.close} />
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Remove ${subject.name}?`} confirmLabel="Remove subject" danger onConfirm={() => removeSubjectAction(slug, subject.id)}>
        It will be removed from every class, along with its teacher assignments. Scores already recorded will stop showing on report cards.
      </ConfirmDialog>
    </>
  );
}

// ---------- Sessions and terms ----------

function NewSessionForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [state, action] = useActionState(createSessionAction.bind(null, slug), initialFormState);
  if (state.success) return <Done state={state} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Session" htmlFor="session-name" error={state.fieldErrors?.name} hint="Three terms are created automatically.">
        <Input id="session-name" name="name" placeholder="2027/2028" aria-invalid={!!state.fieldErrors?.name} />
      </Field>
      <SubmitButton>Create session</SubmitButton>
    </form>
  );
}

export function NewSessionButton({ slug }: { slug: string }) {
  const d = useDialog();
  return (
    <>
      <Button onClick={d.show}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        New session
      </Button>
      <Modal open={d.open} onClose={d.close} title="Start a new session">
        <NewSessionForm key={d.key} slug={slug} onDone={d.close} />
      </Modal>
    </>
  );
}

function TermDatesForm({ slug, term, onDone }: { slug: string; term: { id: string; startsOn: string | null; endsOn: string | null }; onDone: () => void }) {
  const [state, action] = useActionState(updateTermDatesAction.bind(null, slug, term.id), initialFormState);
  if (state.success) return <Done state={state} onDone={onDone} />;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Resumes" htmlFor="startsOn">
          <Input id="startsOn" name="startsOn" type="date" defaultValue={term.startsOn ?? ""} />
        </Field>
        <Field label="Vacates" htmlFor="endsOn">
          <Input id="endsOn" name="endsOn" type="date" defaultValue={term.endsOn ?? ""} />
        </Field>
      </div>
      <SubmitButton>Save dates</SubmitButton>
    </form>
  );
}

export function TermActions({ slug, term }: { slug: string; term: { id: string; name: string; startsOn: string | null; endsOn: string | null; isCurrent: boolean } }) {
  const dates = useDialog();
  const [confirm, setConfirm] = useState(false);
  const items: MenuItem[] = [{ label: "Set dates", icon: "calendar", onSelect: dates.show }];
  if (!term.isCurrent) items.push({ label: "Make current term", icon: "check", onSelect: () => setConfirm(true) });
  return (
    <>
      <RowMenu items={items} label={`Actions for ${term.name}`} />
      <Modal open={dates.open} onClose={dates.close} title={`${term.name} dates`}>
        <TermDatesForm key={dates.key} slug={slug} term={term} onDone={dates.close} />
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Make ${term.name} the current term?`} confirmLabel="Make current" onConfirm={() => setCurrentTermAction(slug, term.id)}>
        Attendance, scores and fees will be recorded against this term from now on.
      </ConfirmDialog>
    </>
  );
}

// ---------- Subject teachers ----------

export function TeacherSelect({
  slug,
  classId,
  subjectId,
  current,
  staff,
  disabled,
}: {
  slug: string;
  classId: string;
  subjectId: string;
  current: string;
  staff: Staff;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(current);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <Select
        aria-label="Teacher"
        value={value}
        disabled={disabled || pending}
        className="max-w-[320px]"
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          startTransition(async () => {
            const result = await assignTeacherAction(slug, classId, subjectId, next);
            setStatus(result.error ? "error" : "saved");
            if (result.error) setValue(current);
          });
        }}
      >
        <option value="">Not assigned</option>
        {staff.map((s) => (
          <option key={s.membershipId} value={s.membershipId}>
            {s.name}
          </option>
        ))}
      </Select>
      {pending ? <span className="text-[13px] text-muted">Saving…</span> : null}
      {!pending && status === "saved" ? (
        <span className="inline-flex items-center gap-1 text-[13px] text-success">
          <Icon name="check" size={15} strokeWidth={2.6} /> Saved
        </span>
      ) : null}
      {!pending && status === "error" ? <span className="text-[13px] text-danger">Couldn&apos;t save</span> : null}
    </div>
  );
}
