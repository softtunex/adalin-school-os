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
import { initialFormState, type FormState } from "@/lib/form-state";
import {
  assignBedAction,
  billBoardingAction,
  createExeatAction,
  deleteHostelAction,
  deleteRoomAction,
  moveExeatAction,
  removeBoarderAction,
  saveHostelAction,
  saveHostelSettingsAction,
  saveRoomAction,
} from "./actions";

type Msg = { tone: "success" | "danger"; text: string } | null;
export type Pupil = { id: string; name: string; admissionNo: string; gender: string; className: string | null; roomId: string | null };
export type RoomOption = { id: string; label: string; hostelGender: string; free: number };
export type HostelDraft = { id?: string; name: string; gender: string; wardenId: string; fee: string };

const naira = (v: string) => Math.round(Number(v.replace(/[,₦\s]/g, "") || 0) * 100);

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const save = (fn: () => Promise<FormState>, after?: () => void, showSuccess = false) =>
    start(async () => {
      const r = await fn();
      if (r.error) return setMsg({ tone: "danger", text: r.error });
      setMsg(showSuccess && r.success ? { tone: "success", text: r.success } : null);
      router.refresh();
      after?.();
    });
  return { pending, msg, setMsg, save };
}

function useOpen() {
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

function StudentSearch({ pupils, onPick, placeholder = "Type a name or admission number", note }: { pupils: Pupil[]; onPick: (p: Pupil) => void; placeholder?: string; note: (p: Pupil) => string }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return pupils
      .filter((p) => `${p.name} ${p.admissionNo}`.toLowerCase().includes(s))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(s)) - Number(!b.name.toLowerCase().startsWith(s)))
      .slice(0, 8);
  }, [q, pupils]);
  return (
    <Field label="Student" htmlFor="hs-student">
      <div className="relative">
        <Input id="hs-student" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
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
                    onPick(p);
                    setQ("");
                  }}
                >
                  <span className="truncate fs-14.5 text-ink">{p.name}</span>
                  <span className="shrink-0 fs-13 text-muted">{note(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

function Picked({ name, onChange }: { name: string; onChange?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-chunk border border-line bg-paper px-3 py-2.5">
      <span className="fs-15 font-semibold text-ink">{name}</span>
      {onChange ? (
        <Button variant="ghost" size="sm" onClick={onChange}>
          Change
        </Button>
      ) : null}
    </div>
  );
}

// ---------- Hostels ----------

function HostelForm({ slug, draft, staff, onDone }: { slug: string; draft: HostelDraft; staff: { id: string; name: string }[]; onDone: () => void }) {
  const [d, setD] = useState(draft);
  const { pending, msg, save } = useSave();
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hostel name" htmlFor="ho-name">
          <Input id="ho-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Queen Amina House" />
        </Field>
        <Field label="For" htmlFor="ho-gender">
          <Select id="ho-gender" value={d.gender} onChange={(e) => setD({ ...d, gender: e.target.value })}>
            <option value="female">Girls</option>
            <option value="male">Boys</option>
            <option value="mixed">Boys and girls</option>
          </Select>
        </Field>
        <Field label="Warden" htmlFor="ho-warden" hint="Gets exeat requests for this hostel.">
          <Select id="ho-warden" value={d.wardenId} onChange={(e) => setD({ ...d, wardenId: e.target.value })}>
            <option value="">Not set</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Boarding fee per term (₦)" htmlFor="ho-fee">
          <Input id="ho-fee" value={d.fee} onChange={(e) => setD({ ...d, fee: e.target.value })} inputMode="decimal" placeholder="250000" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button disabled={pending || d.name.trim().length < 2} onClick={() => save(() => saveHostelAction(slug, { id: d.id, name: d.name, gender: d.gender, wardenId: d.wardenId || null, termFeeKobo: naira(d.fee) }), onDone)}>
          {pending ? "Saving…" : "Save hostel"}
        </Button>
      </div>
    </div>
  );
}

export function AddHostelButton({ slug, staff }: { slug: string; staff: { id: string; name: string }[] }) {
  const o = useOpen();
  return (
    <>
      <Button variant="secondary" onClick={o.show}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Add hostel
      </Button>
      <Modal open={o.open} onClose={o.close} title="Add a hostel">
        <HostelForm key={o.key} slug={slug} staff={staff} draft={{ name: "", gender: "female", wardenId: "", fee: "" }} onDone={o.close} />
      </Modal>
    </>
  );
}

function RoomForm({ slug, hostelId, room, onDone }: { slug: string; hostelId: string; room?: { id: string; name: string; beds: number }; onDone: () => void }) {
  const [name, setName] = useState(room?.name ?? "");
  const [beds, setBeds] = useState(room ? String(room.beds) : "");
  const { pending, msg, save } = useSave();
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Room" htmlFor="rm-name">
          <Input id="rm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Room 4" />
        </Field>
        <Field label="Beds" htmlFor="rm-beds">
          <Input id="rm-beds" value={beds} onChange={(e) => setBeds(e.target.value)} inputMode="numeric" placeholder="8" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button disabled={pending || !name.trim() || !(Number(beds) > 0)} onClick={() => save(() => saveRoomAction(slug, { id: room?.id, hostelId, name, beds: Number(beds) }), onDone)}>
          {pending ? "Saving…" : "Save room"}
        </Button>
      </div>
    </div>
  );
}

export function HostelActions({ slug, hostel, staff }: { slug: string; hostel: HostelDraft & { id: string }; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "room" | "delete">(null);
  const close = () => setMode(null);
  return (
    <>
      <RowMenu
        label={`More for ${hostel.name}`}
        items={[
          { label: "Add a room", icon: "plus", onSelect: () => setMode("room") },
          { label: "Edit hostel", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Remove", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "room"} onClose={close} title={`Add a room to ${hostel.name}`}>
        {mode === "room" ? <RoomForm slug={slug} hostelId={hostel.id} onDone={close} /> : null}
      </Modal>
      <Modal open={mode === "edit"} onClose={close} title={`Edit ${hostel.name}`}>
        {mode === "edit" ? <HostelForm slug={slug} draft={hostel} staff={staff} onDone={close} /> : null}
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={close}
        title={`Remove ${hostel.name}?`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteHostelAction(slug, hostel.id);
          if (!r.error) {
            close();
            router.refresh();
          }
          return r;
        }}
      >
        Its rooms go with it. Only an empty hostel can be removed.
      </ConfirmDialog>
    </>
  );
}

export function RoomActions({ slug, hostelId, room }: { slug: string; hostelId: string; room: { id: string; name: string; beds: number } }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  return (
    <>
      <RowMenu
        label={`More for ${room.name}`}
        items={[
          { label: "Edit room", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Remove", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "edit"} onClose={() => setMode(null)} title={`Edit ${room.name}`}>
        {mode === "edit" ? <RoomForm slug={slug} hostelId={hostelId} room={room} onDone={() => setMode(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title={`Remove ${room.name}?`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteRoomAction(slug, room.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        Only an empty room can be removed.
      </ConfirmDialog>
    </>
  );
}

// ---------- Beds ----------

function BedForm({ slug, pupils, rooms, fixed, onDone }: { slug: string; pupils: Pupil[]; rooms: RoomOption[]; fixed?: { id: string; name: string; gender: string; roomId: string }; onDone: () => void }) {
  const [pupil, setPupil] = useState<{ id: string; name: string; gender: string } | null>(fixed ?? null);
  const [roomId, setRoomId] = useState(fixed?.roomId ?? "");
  const [bed, setBed] = useState("");
  const { pending, msg, save } = useSave();
  const fits = rooms.filter((r) => !pupil || r.hostelGender === "mixed" || r.hostelGender === pupil.gender);
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {pupil ? <Picked name={pupil.name} onChange={fixed ? undefined : () => setPupil(null)} /> : <StudentSearch pupils={pupils} onPick={setPupil} note={(p) => (p.roomId ? "Has a bed" : (p.className ?? ""))} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Room" htmlFor="bd-room">
          <Select id="bd-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Choose…</option>
            {fits.map((r) => (
              <option key={r.id} value={r.id} disabled={r.free === 0 && r.id !== fixed?.roomId}>
                {r.label} ({r.free ? `${r.free} free` : "full"})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bed number" htmlFor="bd-bed" hint="Blank for the first free bed.">
          <Input id="bd-bed" value={bed} onChange={(e) => setBed(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button disabled={pending || !pupil || !roomId} onClick={() => save(() => assignBedAction(slug, { studentId: pupil!.id, roomId, bed: bed ? Number(bed) : null }), onDone)}>
          {pending ? "Saving…" : fixed ? "Move" : "Give a bed"}
        </Button>
      </div>
    </div>
  );
}

export function GiveBedButton({ slug, pupils, rooms }: { slug: string; pupils: Pupil[]; rooms: RoomOption[] }) {
  const o = useOpen();
  return (
    <>
      <Button disabled={!rooms.length} onClick={o.show}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Give a bed
      </Button>
      <Modal open={o.open} onClose={o.close} title="Give a student a bed">
        <BedForm key={o.key} slug={slug} pupils={pupils} rooms={rooms} onDone={o.close} />
      </Modal>
    </>
  );
}

export function BoarderActions({ slug, boarder, rooms }: { slug: string; boarder: { id: string; name: string; gender: string; roomId: string }; rooms: RoomOption[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "move" | "delete">(null);
  return (
    <>
      <RowMenu
        label={`More for ${boarder.name}`}
        items={[
          { label: "Move to another bed", icon: "edit", onSelect: () => setMode("move") },
          { label: "Make a day student", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "move"} onClose={() => setMode(null)} title={`Move ${boarder.name}`}>
        {mode === "move" ? <BedForm slug={slug} pupils={[]} rooms={rooms} fixed={boarder} onDone={() => setMode(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title={`Make ${boarder.name} a day student?`}
        confirmLabel="Free the bed"
        danger
        onConfirm={async () => {
          const r = await removeBoarderAction(slug, boarder.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        Their bed is freed. Boarding fees already invoiced stay on the invoice.
      </ConfirmDialog>
    </>
  );
}

// ---------- Exeats ----------

export function ExeatForm({
  onSubmit,
  pupils,
  fixedStudentId,
  minDate,
  submitLabel,
}: {
  onSubmit: (input: { studentId: string; kind: string; reason: string; leaveAt: string; returnBy: string; collectedBy: string }) => Promise<FormState>;
  pupils?: Pupil[];
  fixedStudentId?: string;
  minDate: string;
  submitLabel: string;
}) {
  const [pupil, setPupil] = useState<{ id: string; name: string } | null>(null);
  const [kind, setKind] = useState("weekend");
  const [reason, setReason] = useState("");
  const [leaveAt, setLeaveAt] = useState(`${minDate}T15:00`);
  const [returnBy, setReturnBy] = useState(`${minDate}T18:00`);
  const [collectedBy, setCollectedBy] = useState("");
  const { pending, msg, save } = useSave();
  const studentId = fixedStudentId ?? pupil?.id;
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {fixedStudentId ? null : pupil ? <Picked name={pupil.name} onChange={() => setPupil(null)} /> : <StudentSearch pupils={(pupils ?? []).filter((p) => p.roomId)} onPick={setPupil} placeholder="Type a boarder's name" note={(p) => p.className ?? ""} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind of exeat" htmlFor="ex-kind">
          <Select id="ex-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="weekend">Weekend</option>
            <option value="day">Day out</option>
            <option value="medical">Medical</option>
            <option value="family">Family event</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Collected by" htmlFor="ex-who" hint="Who is picking them up.">
          <Input id="ex-who" value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} placeholder="Mrs Lawal (mother)" />
        </Field>
        <Field label="Leaves" htmlFor="ex-leave">
          <Input id="ex-leave" type="datetime-local" value={leaveAt} min={`${minDate}T00:00`} onChange={(e) => setLeaveAt(e.target.value)} />
        </Field>
        <Field label="Back by" htmlFor="ex-back">
          <Input id="ex-back" type="datetime-local" value={returnBy} min={leaveAt} onChange={(e) => setReturnBy(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason" htmlFor="ex-reason">
        <Textarea id="ex-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Family wedding in Ibadan" />
      </Field>
      <div className="flex justify-end">
        <Button disabled={pending || !studentId || reason.trim().length < 3} onClick={() => save(() => onSubmit({ studentId: studentId!, kind, reason, leaveAt, returnBy, collectedBy }), undefined, true)}>
          {pending ? "Sending…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function NewExeatButton({ slug, pupils, minDate }: { slug: string; pupils: Pupil[]; minDate: string }) {
  const o = useOpen();
  return (
    <>
      <Button variant="secondary" onClick={o.show}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> New exeat
      </Button>
      <Modal open={o.open} onClose={o.close} title="Exeat">
        <ExeatForm key={o.key} pupils={pupils} minDate={minDate} submitLabel="Approve exeat" onSubmit={(input) => createExeatAction(slug, input)} />
      </Modal>
    </>
  );
}

export function ExeatButtons({ slug, id, status, name }: { slug: string; id: string; status: string; name: string }) {
  const [decline, setDecline] = useState(false);
  const [note, setNote] = useState("");
  const { pending, msg, save } = useSave();
  const act = (action: "approve" | "decline" | "out" | "back", n?: string) => save(() => moveExeatAction(slug, id, action, n), () => setDecline(false));
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === "pending" ? (
          <>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDecline(true)}>
              Decline
            </Button>
            <Button size="sm" disabled={pending} onClick={() => act("approve")}>
              Approve
            </Button>
          </>
        ) : status === "approved" ? (
          <Button size="sm" disabled={pending} onClick={() => act("out")}>
            Sign out
          </Button>
        ) : status === "out" ? (
          <Button size="sm" variant="success" disabled={pending} onClick={() => act("back")}>
            Signed back in
          </Button>
        ) : null}
      </div>
      {msg?.tone === "danger" ? <span className="fs-12.5 text-danger">{msg.text}</span> : null}
      <Modal open={decline} onClose={() => setDecline(false)} title={`Decline ${name}'s exeat?`}>
        <div className="flex flex-col gap-4">
          <Field label="Note for the parents" htmlFor="ex-note">
            <Textarea id="ex-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Exams start on Monday. Next weekend is fine." />
          </Field>
          <div className="flex justify-end">
            <Button variant="danger" disabled={pending} onClick={() => act("decline", note)}>
              {pending ? "Saving…" : "Decline"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------- Billing and settings ----------

export function BillBoardingButton({ slug, total }: { slug: string; total: string }) {
  const o = useOpen();
  const { pending, msg, setMsg, save } = useSave();
  const close = () => {
    o.close();
    setMsg(null);
  };
  return (
    <>
      <Button variant="secondary" onClick={o.show}>
        <Icon name="wallet" size={17} /> Add boarding fees to invoices
      </Button>
      <Modal open={o.open} onClose={close} title="Add boarding fees to this term's invoices">
        <div className="flex flex-col gap-5">
          {msg ? (
            <Alert tone={msg.tone}>{msg.text}</Alert>
          ) : (
            <p className="fs-15 text-body">
              Each boarder gets their hostel&apos;s fee ({total} in all) as a &ldquo;Boarding&rdquo; line on their term invoice. Anyone already charged this term is skipped.
            </p>
          )}
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={close}>
              {msg?.tone === "success" ? "Done" : "Cancel"}
            </Button>
            {msg?.tone === "success" ? null : (
              <Button disabled={pending} onClick={() => save(() => billBoardingAction(slug), undefined, true)}>
                {pending ? "Adding…" : "Add fees"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

export function HostelSettingsForm({ slug, settings, editable }: { slug: string; settings: { parentRequests: boolean; notifyMovements: boolean }; editable: boolean }) {
  const [state, formAction] = useActionState(saveHostelSettingsAction.bind(null, slug), initialFormState);
  return (
    <Card className="flex max-w-2xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Boarding</h2>
        <p className="mt-0.5 fs-14 text-muted">How exeats work for parents.</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <label className="flex items-start gap-2.5 fs-14.5 text-ink">
            <input type="checkbox" name="parentRequests" defaultChecked={settings.parentRequests} className="mt-1 size-4 accent-[var(--brand)]" />
            <span>
              Parents can ask for an exeat in the app
              <span className="block fs-13.5 text-muted">The hostel&apos;s warden approves or declines it. Otherwise, exeats are recorded by staff.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 fs-14.5 text-ink">
            <input type="checkbox" name="notifyMovements" defaultChecked={settings.notifyMovements} className="mt-1 size-4 accent-[var(--brand)]" />
            <span>
              Text parents when their child signs out of school and back in
              <span className="block fs-13.5 text-muted">By SMS where switched on, and always in the app.</span>
            </span>
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
