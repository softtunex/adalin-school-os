"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import type { FormState } from "@/lib/form-state";
import {
  billTransportAction,
  deleteRouteAction,
  deleteVehicleAction,
  removeRiderAction,
  saveRouteAction,
  saveTransportSettingsAction,
  saveTripAction,
  saveVehicleAction,
  setRiderAction,
} from "./actions";

type Msg = { tone: "success" | "danger"; text: string } | null;
export type VehicleDraft = { id?: string; name: string; plate: string; capacity: string; driverName: string; driverPhone: string; attendantName: string; attendantPhone: string };
export type Stop = { name: string; pickup: string; dropoff: string };
export type RouteDraft = { id?: string; name: string; vehicleId: string; fee: string; stops: Stop[] };
export type RouteOption = { id: string; name: string; stops: Stop[] };
export type Pupil = { id: string; name: string; admissionNo: string; className: string | null; onRoute: string | null };

const naira = (v: string) => Math.round(Number(v.replace(/[,₦\s]/g, "") || 0) * 100);

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  /** Runs an action; shows its error, or its success message when showSuccess is set. */
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

// ---------- Buses ----------

const EMPTY_BUS: VehicleDraft = { name: "", plate: "", capacity: "", driverName: "", driverPhone: "", attendantName: "", attendantPhone: "" };

function VehicleForm({ slug, bus, onDone }: { slug: string; bus: VehicleDraft; onDone: () => void }) {
  const [d, setD] = useState(bus);
  const { pending, msg, save } = useSave();
  const set = (k: keyof VehicleDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor="vh-name">
          <Input id="vh-name" value={d.name} onChange={set("name")} placeholder="Bus 1" />
        </Field>
        <Field label="Plate number" htmlFor="vh-plate">
          <Input id="vh-plate" value={d.plate} onChange={set("plate")} placeholder="LND 234 XY" />
        </Field>
        <Field label="Seats" htmlFor="vh-cap">
          <Input id="vh-cap" value={d.capacity} onChange={set("capacity")} inputMode="numeric" placeholder="30" />
        </Field>
        <Field label="Driver" htmlFor="vh-driver">
          <Input id="vh-driver" value={d.driverName} onChange={set("driverName")} />
        </Field>
        <Field label="Driver's phone" htmlFor="vh-dphone">
          <Input id="vh-dphone" value={d.driverPhone} onChange={set("driverPhone")} inputMode="tel" />
        </Field>
        <span className="hidden sm:block" />
        <Field label="Attendant" htmlFor="vh-att">
          <Input id="vh-att" value={d.attendantName} onChange={set("attendantName")} placeholder="Optional" />
        </Field>
        <Field label="Attendant's phone" htmlFor="vh-aphone">
          <Input id="vh-aphone" value={d.attendantPhone} onChange={set("attendantPhone")} inputMode="tel" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button disabled={pending || !d.name.trim() || !(Number(d.capacity) > 0)} onClick={() => save(() => saveVehicleAction(slug, { ...d, capacity: Number(d.capacity) }), onDone)}>
          {pending ? "Saving…" : "Save bus"}
        </Button>
      </div>
    </div>
  );
}

export function VehicleButton({ slug, bus }: { slug: string; bus?: VehicleDraft }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Add bus
      </Button>
      <Modal open={open} onClose={close} title="Add a bus">
        <VehicleForm key={key} slug={slug} bus={bus ?? EMPTY_BUS} onDone={close} />
      </Modal>
    </>
  );
}

export function VehicleActions({ slug, bus }: { slug: string; bus: VehicleDraft & { id: string } }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  return (
    <>
      <RowMenu
        label={`More for ${bus.name}`}
        items={[
          { label: "Edit", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Remove", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "edit"} onClose={() => setMode(null)} title={`Edit ${bus.name}`}>
        {mode === "edit" ? <VehicleForm slug={slug} bus={bus} onDone={() => setMode(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title={`Remove ${bus.name}?`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteVehicleAction(slug, bus.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        Routes using this bus keep their students, without a bus set.
      </ConfirmDialog>
    </>
  );
}

// ---------- Routes ----------

const EMPTY_ROUTE: RouteDraft = { name: "", vehicleId: "", fee: "", stops: [{ name: "", pickup: "06:45", dropoff: "15:30" }] };

function RouteForm({ slug, route, buses, onDone }: { slug: string; route: RouteDraft; buses: { id: string; name: string; capacity: number }[]; onDone: () => void }) {
  const [d, setD] = useState(route);
  const { pending, msg, save } = useSave();
  const setStop = (i: number, k: keyof Stop, v: string) => setD((x) => ({ ...x, stops: x.stops.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const move = (i: number, by: number) =>
    setD((x) => {
      const stops = [...x.stops];
      const [s] = stops.splice(i, 1);
      stops.splice(i + by, 0, s);
      return { ...x, stops };
    });
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Route name" htmlFor="rt-name">
          <Input id="rt-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Lekki – Ajah" />
        </Field>
        <Field label="Bus" htmlFor="rt-bus">
          <Select id="rt-bus" value={d.vehicleId} onChange={(e) => setD({ ...d, vehicleId: e.target.value })}>
            <option value="">Not set</option>
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.capacity} seats)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fee per term (₦)" htmlFor="rt-fee">
          <Input id="rt-fee" value={d.fee} onChange={(e) => setD({ ...d, fee: e.target.value })} inputMode="decimal" placeholder="45000" />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_6.5rem_6.5rem_auto] gap-2 fs-13 font-medium text-muted">
          <span>Stop, in order</span>
          <span>Pick-up</span>
          <span>Drop-off</span>
          <span className="w-[6.5rem]" />
        </div>
        {d.stops.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_6.5rem_6.5rem_auto] items-center gap-2">
            <Input aria-label={`Stop ${i + 1}`} value={s.name} onChange={(e) => setStop(i, "name", e.target.value)} placeholder="Ajah roundabout" />
            <Input aria-label={`Stop ${i + 1} pick-up`} type="time" value={s.pickup} onChange={(e) => setStop(i, "pickup", e.target.value)} />
            <Input aria-label={`Stop ${i + 1} drop-off`} type="time" value={s.dropoff} onChange={(e) => setStop(i, "dropoff", e.target.value)} />
            <span className="flex w-[6.5rem] gap-0.5">
              <Button variant="ghost" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="chevronDown" size={16} className="rotate-180" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Move down" disabled={i === d.stops.length - 1} onClick={() => move(i, 1)}>
                <Icon name="chevronDown" size={16} />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`Remove stop ${i + 1}`} disabled={d.stops.length === 1} onClick={() => setD({ ...d, stops: d.stops.filter((_, j) => j !== i) })}>
                <Icon name="x" size={16} />
              </Button>
            </span>
          </div>
        ))}
        <div>
          <Button variant="ghost" size="sm" onClick={() => setD({ ...d, stops: [...d.stops, { name: "", pickup: d.stops.at(-1)?.pickup ?? "06:45", dropoff: d.stops.at(-1)?.dropoff ?? "15:30" }] })}>
            <Icon name="plus" size={16} /> Add a stop
          </Button>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={pending || !d.name.trim()}
          onClick={() => save(() => saveRouteAction(slug, { id: d.id, name: d.name, vehicleId: d.vehicleId || null, termFeeKobo: naira(d.fee), stops: d.stops.map((s) => ({ ...s, name: s.name.trim() })) }), onDone)}
        >
          {pending ? "Saving…" : "Save route"}
        </Button>
      </div>
    </div>
  );
}

export function RouteButton({ slug, buses }: { slug: string; buses: { id: string; name: string; capacity: number }[] }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Add route
      </Button>
      <Modal open={open} onClose={close} title="Add a route" size="lg">
        <RouteForm key={key} slug={slug} route={EMPTY_ROUTE} buses={buses} onDone={close} />
      </Modal>
    </>
  );
}

export function RouteActions({ slug, route, buses }: { slug: string; route: RouteDraft & { id: string }; buses: { id: string; name: string; capacity: number }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  return (
    <>
      <RowMenu
        label={`More for ${route.name}`}
        items={[
          { label: "Edit route", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Remove", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "edit"} onClose={() => setMode(null)} title={`Edit ${route.name}`} size="lg">
        {mode === "edit" ? <RouteForm slug={slug} route={route} buses={buses} onDone={() => setMode(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title={`Remove ${route.name}?`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteRouteAction(slug, route.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        Only routes with no students on them can be removed.
      </ConfirmDialog>
    </>
  );
}

// ---------- Riders ----------

function RiderForm({ slug, pupils, routes, fixed, onDone }: { slug: string; pupils: Pupil[]; routes: RouteOption[]; fixed?: { id: string; name: string; routeId: string; stop: string; direction: string }; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [pupil, setPupil] = useState<{ id: string; name: string } | null>(fixed ? { id: fixed.id, name: fixed.name } : null);
  const [routeId, setRouteId] = useState(fixed?.routeId ?? routes[0]?.id ?? "");
  const [stop, setStop] = useState(fixed?.stop ?? "");
  const [direction, setDirection] = useState(fixed?.direction ?? "both");
  const { pending, msg, save } = useSave();
  const route = routes.find((r) => r.id === routeId);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return pupils
      .filter((p) => `${p.name} ${p.admissionNo}`.toLowerCase().includes(s))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(s)) - Number(!b.name.toLowerCase().startsWith(s)))
      .slice(0, 8);
  }, [q, pupils]);
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {pupil ? (
        <div className="flex items-center justify-between rounded-chunk border border-line bg-paper px-3 py-2.5">
          <span className="fs-15 font-semibold text-ink">{pupil.name}</span>
          {fixed ? null : (
            <Button variant="ghost" size="sm" onClick={() => setPupil(null)}>
              Change
            </Button>
          )}
        </div>
      ) : (
        <Field label="Student" htmlFor="rd-student">
          <div className="relative">
            <Input id="rd-student" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or admission number" autoComplete="off" />
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
                        setPupil(p);
                        setQ("");
                      }}
                    >
                      <span className="truncate fs-14.5 text-ink">{p.name}</span>
                      <span className="shrink-0 fs-13 text-muted">{p.onRoute ? "On a bus already" : p.className}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Route" htmlFor="rd-route">
          <Select
            id="rd-route"
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value);
              setStop("");
            }}
          >
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stop" htmlFor="rd-stop">
          <Select id="rd-stop" value={stop} onChange={(e) => setStop(e.target.value)}>
            <option value="">Choose…</option>
            {route?.stops.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.pickup} / {s.dropoff})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rides" htmlFor="rd-dir">
          <Select id="rd-dir" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="both">Morning and afternoon</option>
            <option value="morning">Mornings only</option>
            <option value="afternoon">Afternoons only</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button disabled={pending || !pupil || !routeId || !stop} onClick={() => save(() => setRiderAction(slug, { studentId: pupil!.id, routeId, stop, direction }), onDone)}>
          {pending ? "Saving…" : fixed ? "Save" : "Put on the bus"}
        </Button>
      </div>
    </div>
  );
}

export function AddRiderButton({ slug, pupils, routes }: { slug: string; pupils: Pupil[]; routes: RouteOption[] }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <>
      <Button disabled={!routes.length} onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Add student
      </Button>
      <Modal open={open} onClose={close} title="Put a student on the bus">
        <RiderForm key={key} slug={slug} pupils={pupils} routes={routes} onDone={close} />
      </Modal>
    </>
  );
}

export function RiderActions({ slug, rider, routes }: { slug: string; rider: { id: string; name: string; routeId: string; stop: string; direction: string }; routes: RouteOption[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  return (
    <>
      <RowMenu
        label={`More for ${rider.name}`}
        items={[
          { label: "Change route or stop", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Take off the bus", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "edit"} onClose={() => setMode(null)} title={rider.name}>
        {mode === "edit" ? <RiderForm slug={slug} pupils={[]} routes={routes} fixed={rider} onDone={() => setMode(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title={`Take ${rider.name} off the bus?`}
        confirmLabel="Take off"
        danger
        onConfirm={async () => {
          const r = await removeRiderAction(slug, rider.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        Bus fees already on their invoice stay there. Remove the line under Fees if needed.
      </ConfirmDialog>
    </>
  );
}

// ---------- Register ----------

export function TripRegister({
  slug,
  routeId,
  direction,
  riders,
  boarded,
  savedAt,
}: {
  slug: string;
  routeId: string;
  direction: "morning" | "afternoon";
  riders: { studentId: string; name: string; className: string | null; stop: string }[];
  boarded: string[];
  savedAt: string | null;
}) {
  const [on, setOn] = useState(new Set(boarded));
  const { pending, msg, setMsg, save } = useSave();
  const toggle = (id: string) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="fs-14.5 text-body">
          <strong className="text-ink">{on.size}</strong> of {riders.length} on the bus{savedAt ? ` · saved at ${savedAt}` : ""}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOn(new Set(riders.map((r) => r.studentId)))}>
            Everyone on
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOn(new Set())}>
            Clear
          </Button>
        </div>
      </div>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {riders.length === 0 ? (
        <p className="fs-14.5 text-muted">Nobody rides this bus {direction === "morning" ? "in the morning" : "in the afternoon"}.</p>
      ) : (
        <ul className="flex flex-col">
          {riders.map((r, i) => {
            const header = i === 0 || riders[i - 1].stop !== r.stop;
            const isOn = on.has(r.studentId);
            return (
              <li key={r.studentId}>
                {header ? <p className="mt-2 px-1 pb-1 fs-12.5 font-semibold uppercase tracking-[0.05em] text-muted">{r.stop}</p> : null}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isOn}
                  onClick={() => toggle(r.studentId)}
                  className={cn("flex w-full items-center gap-3 rounded-chunk border-2 px-3 py-2.5 text-left transition-colors", isOn ? "border-success bg-success-wash" : "border-transparent hover:bg-paper")}
                >
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border-2", isOn ? "border-success bg-success text-white" : "border-line-strong")}>{isOn ? <Icon name="check" size={15} strokeWidth={3} /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate fs-15 font-medium text-ink">{r.name}</span>
                    <span className="block fs-13 text-muted">{r.className ?? ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <Button
          disabled={pending || !riders.length}
          onClick={() => {
            setMsg(null);
            save(() => saveTripAction(slug, { routeId, direction, boarded: [...on] }), undefined, true);
          }}
        >
          {pending ? "Saving…" : "Save register"}
        </Button>
      </div>
    </Card>
  );
}

// ---------- Billing and settings ----------

export function BillButton({ slug, total }: { slug: string; total: string }) {
  const [open, setOpen] = useState(false);
  const { pending, msg, setMsg, save } = useSave();
  const close = () => {
    setOpen(false);
    setMsg(null);
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="wallet" size={17} /> Add bus fees to invoices
      </Button>
      <Modal open={open} onClose={close} title="Add bus fees to this term's invoices">
        <div className="flex flex-col gap-5">
          {msg ? (
            <Alert tone={msg.tone}>{msg.text}</Alert>
          ) : (
            <p className="fs-15 text-body">
              Each student on a bus gets their route&apos;s fee ({total} in all) as a &ldquo;School bus&rdquo; line on their term invoice. Anyone already charged this term is skipped.
            </p>
          )}
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={close}>
              {msg?.tone === "success" ? "Done" : "Cancel"}
            </Button>
            {msg?.tone === "success" ? null : (
              <Button
                disabled={pending}
                onClick={() =>
                  save(() => billTransportAction(slug), undefined, true)
                }
              >
                {pending ? "Adding…" : "Add fees"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

export function TransportSettingsForm({ slug, settings, editable }: { slug: string; settings: { notifyBoarding: boolean }; editable: boolean }) {
  const [state, formAction] = useActionState(saveTransportSettingsAction.bind(null, slug), initialFormState);
  return (
    <Card className="flex max-w-2xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Transport</h2>
        <p className="mt-0.5 fs-14 text-muted">What parents hear from the school bus.</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable}>
          <label className="flex items-start gap-2.5 fs-14.5 text-ink">
            <input type="checkbox" name="notifyBoarding" defaultChecked={settings.notifyBoarding} className="mt-1 size-4 accent-[var(--brand)]" />
            <span>
              Tell parents in the app when their child is marked on the bus
              <span className="block fs-13.5 text-muted">Sent when the bus register is saved, morning and afternoon. In the app only, so it costs no SMS credit.</span>
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
