"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { countAction, deleteItemAction, giveOutAction, saveInventorySettingsAction, saveItemAction, stockInAction, takeBackAction } from "./actions";

export type ItemDraft = {
  id?: string;
  name: string;
  kind: "consumable" | "asset";
  category: string;
  unit: string;
  quantity: string;
  reorderLevel: string;
  cost: string;
  location: string;
  tag: string;
  condition: "good" | "fair" | "damaged" | "lost";
  note: string;
};

type Lists = { categories: string[]; locations: string[] };
type Msg = { tone: "success" | "danger"; text: string } | null;

const EMPTY: ItemDraft = { name: "", kind: "consumable", category: "", unit: "pieces", quantity: "0", reorderLevel: "0", cost: "", location: "", tag: "", condition: "good", note: "" };
const naira = (v: string) => Math.round(Number(v.replace(/[,₦\s]/g, "") || 0) * 100);

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={cn("rounded-chunk border-2 px-3 py-2 fs-14 font-semibold", value === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong text-body hover:bg-paper")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ItemForm({ slug, item, lists, onDone }: { slug: string; item: ItemDraft; lists: Lists; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState(item);
  const [msg, setMsg] = useState<Msg>(null);
  const set = (k: keyof ItemDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  const asset = d.kind === "asset";
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {d.id ? null : <Segmented label="Kind of item" value={d.kind} options={[["consumable", "Used up (chalk, paper)"], ["asset", "Kept (projector, chairs)"]]} onChange={(kind) => setD((x) => ({ ...x, kind, unit: kind === "asset" ? "units" : "pieces" }))} />}
      <Field label="Name" htmlFor="it-name">
        <Input id="it-name" value={d.name} onChange={set("name")} placeholder={asset ? "Epson EB-X41 projector" : "White chalk (box of 12)"} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="it-cat">
          <Select id="it-cat" value={d.category} onChange={set("category")}>
            <option value="">None</option>
            {[...new Set([...lists.categories, ...(d.category ? [d.category] : [])])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Counted in" htmlFor="it-unit" hint="pieces, packets, cartons, litres…">
          <Input id="it-unit" value={d.unit} onChange={set("unit")} />
        </Field>
        {d.id ? null : (
          <Field label="How many now" htmlFor="it-qty">
            <Input id="it-qty" value={d.quantity} onChange={set("quantity")} inputMode="numeric" />
          </Field>
        )}
        <Field label="Cost each (₦)" htmlFor="it-cost" hint="Optional. Used for the store's value.">
          <Input id="it-cost" value={d.cost} onChange={set("cost")} inputMode="decimal" />
        </Field>
        {asset ? (
          <Field label="Asset tag" htmlFor="it-tag" hint="The code painted or stuck on it.">
            <Input id="it-tag" value={d.tag} onChange={set("tag")} placeholder="ADC-ICT-001" />
          </Field>
        ) : (
          <Field label="Reorder at" htmlFor="it-reorder" hint="Flag it when the store drops to this. 0 to never flag.">
            <Input id="it-reorder" value={d.reorderLevel} onChange={set("reorderLevel")} inputMode="numeric" />
          </Field>
        )}
        <Field label="Kept in" htmlFor="it-loc">
          <Select id="it-loc" value={d.location} onChange={set("location")}>
            <option value="">Not set</option>
            {[...new Set([...lists.locations, ...(d.location ? [d.location] : [])])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        {asset && d.id ? (
          <Field label="Condition" htmlFor="it-cond">
            <Select id="it-cond" value={d.condition} onChange={set("condition")}>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
            </Select>
          </Field>
        ) : null}
      </div>
      <Field label="Note" htmlFor="it-note">
        <Textarea id="it-note" rows={2} value={d.note} onChange={set("note")} placeholder={asset ? "Serial number, warranty, supplier" : "Supplier, brand"} />
      </Field>
      <div className="flex justify-end">
        <Button
          disabled={pending || !d.name.trim()}
          onClick={() =>
            start(async () => {
              const r = await saveItemAction(slug, {
                id: d.id,
                name: d.name,
                kind: d.kind,
                category: d.category,
                unit: d.unit || "pieces",
                quantity: Number(d.quantity) || 0,
                reorderLevel: asset ? 0 : Number(d.reorderLevel) || 0,
                unitCostKobo: naira(d.cost),
                location: d.location,
                tag: asset ? d.tag : "",
                condition: d.condition,
                note: d.note,
              });
              if (r.error) return setMsg({ tone: "danger", text: r.error });
              router.refresh();
              onDone();
            })
          }
        >
          {pending ? "Saving…" : d.id ? "Save" : "Add to store"}
        </Button>
      </div>
    </div>
  );
}

export function AddItemButton({ slug, lists }: { slug: string; lists: Lists }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} strokeWidth={2.4} /> Add item
      </Button>
      <Modal open={open} onClose={close} title="Add to the store">
        <ItemForm key={key} slug={slug} item={EMPTY} lists={lists} onDone={close} />
      </Modal>
    </>
  );
}

type Row = { id: string; name: string; kind: "consumable" | "asset"; unit: string; quantity: number; out: number; draft: ItemDraft };

function StockInForm({ slug, item, recordPurchases, expenseCategories, onDone }: { slug: string; item: Row; recordPurchases: boolean; expenseCategories: readonly string[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(item.draft.cost);
  const [supplier, setSupplier] = useState("");
  const [record, setRecord] = useState(recordPurchases);
  const [cat, setCat] = useState(item.kind === "asset" ? "Repairs and maintenance" : "Teaching materials");
  const [msg, setMsg] = useState<Msg>(null);
  const total = (Number(qty) || 0) * naira(cost);
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <p className="fs-14.5 text-body">
        {item.quantity} {item.unit} in the store now.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`How many ${item.unit} came in`} htmlFor="si-qty">
          <Input id="si-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" autoFocus />
        </Field>
        <Field label="Cost each (₦)" htmlFor="si-cost">
          <Input id="si-cost" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <Field label="Supplier" htmlFor="si-sup">
        <Input id="si-sup" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Optional" />
      </Field>
      {total > 0 ? (
        <div className="flex flex-col gap-3 rounded-chunk border border-line bg-paper p-3.5">
          <label className="flex items-center gap-2.5 fs-14.5 text-ink">
            <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Add ₦{(total / 100).toLocaleString("en-NG")} to Expenses for approval
          </label>
          {record ? (
            <Field label="Expense category" htmlFor="si-cat">
              <Select id="si-cat" value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-72">
                {expenseCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button
          disabled={pending || !(Number(qty) > 0)}
          onClick={() =>
            start(async () => {
              const r = await stockInAction(slug, { itemId: item.id, quantity: Number(qty), unitCostKobo: naira(cost), supplier, recordExpense: record, expenseCategory: cat });
              if (r.error) return setMsg({ tone: "danger", text: r.error });
              router.refresh();
              onDone();
            })
          }
        >
          {pending ? "Saving…" : "Stock in"}
        </Button>
      </div>
    </div>
  );
}

function GiveOutForm({ slug, item, staff, locations, onDone }: { slug: string; item: Row; staff: { id: string; name: string }[]; locations: string[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState("1");
  const [to, setTo] = useState<"staff" | "room">("staff");
  const [who, setWho] = useState("");
  const [room, setRoom] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const asset = item.kind === "asset";
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <p className="fs-14.5 text-body">
        {item.quantity} {item.unit} in the store. {asset ? "It stays on the record against them until it comes back." : "Issued stock leaves the store for good."}
      </p>
      <Segmented
        label="Going to"
        value={to}
        options={[
          ["staff", "A member of staff"],
          ["room", "A room or place"],
        ]}
        onChange={setTo}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {to === "staff" ? (
          <Field label="Staff member" htmlFor="go-who">
            <Select id="go-who" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Room or place" htmlFor="go-room">
            <Select id="go-room" value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">Choose…</option>
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={`How many ${item.unit}`} htmlFor="go-qty">
          <Input id="go-qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <Field label="Note" htmlFor="go-note">
        <Input id="go-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={asset ? "For the JSS 1 science lessons" : "For the second-term exams"} />
      </Field>
      <div className="flex justify-end">
        <Button
          disabled={pending || !(Number(qty) > 0) || (to === "staff" ? !who : !room)}
          onClick={() =>
            start(async () => {
              const r = await giveOutAction(slug, { itemId: item.id, quantity: Number(qty), membershipId: to === "staff" ? who : null, location: to === "room" ? room : "", note });
              if (r.error) return setMsg({ tone: "danger", text: r.error });
              router.refresh();
              onDone();
            })
          }
        >
          {pending ? "Saving…" : asset ? "Sign out" : "Issue"}
        </Button>
      </div>
    </div>
  );
}

function CountForm({ slug, item, onDone }: { slug: string; item: Row; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counted, setCounted] = useState(String(item.quantity));
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <p className="fs-14.5 text-body">
        The record says {item.quantity} {item.unit} in the store. Enter what you physically counted.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Counted" htmlFor="ct-n">
          <Input id="ct-n" value={counted} onChange={(e) => setCounted(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Why it differs" htmlFor="ct-note">
          <Input id="ct-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Two packets got damp" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={pending || counted === ""}
          onClick={() =>
            start(async () => {
              const r = await countAction(slug, { itemId: item.id, counted: Number(counted), note: Number(counted) === item.quantity ? "Count matches" : note });
              if (r.error) return setMsg({ tone: "danger", text: r.error });
              router.refresh();
              onDone();
            })
          }
        >
          {pending ? "Saving…" : "Save count"}
        </Button>
      </div>
    </div>
  );
}

export function ItemActions({
  slug,
  item,
  lists,
  staff,
  recordPurchases,
  expenseCategories,
}: {
  slug: string;
  item: Row;
  lists: Lists;
  staff: { id: string; name: string }[];
  recordPurchases: boolean;
  expenseCategories: readonly string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "in" | "out" | "count" | "edit" | "delete">(null);
  const close = () => setMode(null);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="secondary" disabled={item.quantity === 0} onClick={() => setMode("out")}>
        {item.kind === "asset" ? "Sign out" : "Issue"}
      </Button>
      <RowMenu
        label={`More for ${item.name}`}
        items={[
          { label: "Stock in", icon: "plus", onSelect: () => setMode("in") },
          { label: "Count", icon: "check", onSelect: () => setMode("count") },
          { label: "Edit", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Remove", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "in"} onClose={close} title={`Stock in: ${item.name}`}>
        {mode === "in" ? <StockInForm slug={slug} item={item} recordPurchases={recordPurchases} expenseCategories={expenseCategories} onDone={close} /> : null}
      </Modal>
      <Modal open={mode === "out"} onClose={close} title={`${item.kind === "asset" ? "Sign out" : "Issue"}: ${item.name}`}>
        {mode === "out" ? <GiveOutForm slug={slug} item={item} staff={staff} locations={lists.locations} onDone={close} /> : null}
      </Modal>
      <Modal open={mode === "count"} onClose={close} title={`Count: ${item.name}`}>
        {mode === "count" ? <CountForm slug={slug} item={item} onDone={close} /> : null}
      </Modal>
      <Modal open={mode === "edit"} onClose={close} title="Edit item">
        {mode === "edit" ? <ItemForm slug={slug} item={item.draft} lists={lists} onDone={close} /> : null}
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={close}
        title={`Remove ${item.name}?`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteItemAction(slug, item.id);
          if (!r.error) {
            close();
            router.refresh();
          }
          return r;
        }}
      >
        It comes out of the store along with its history.
      </ConfirmDialog>
    </div>
  );
}

export function TakeBackButton({ slug, id, name }: { slug: string; id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [condition, setCondition] = useState("good");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="undo" size={15} /> Back in store
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${name} is back`}>
        <div className="flex flex-col gap-4">
          {msg ? <Alert tone="danger">{msg}</Alert> : null}
          <Field label="What condition is it in?" htmlFor="tb-cond">
            <Select id="tb-cond" value={condition} onChange={(e) => setCondition(e.target.value)} className="sm:w-64">
              <option value="good">Good</option>
              <option value="fair">Fair, some wear</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost, not coming back</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button
              variant={condition === "lost" ? "danger" : "primary"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await takeBackAction(slug, id, condition);
                  if (r.error) return setMsg(r.error);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? "Saving…" : condition === "lost" ? "Mark as lost" : "Back in the store"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function InventorySettingsForm({ slug, settings, editable }: { slug: string; settings: { categories: string[]; locations: string[]; recordPurchases: boolean }; editable: boolean }) {
  const [state, formAction] = useActionState(saveInventorySettingsAction.bind(null, slug), initialFormState);
  return (
    <Card className="flex max-w-3xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Inventory</h2>
        <p className="mt-0.5 fs-14 text-muted">The categories items go under, and the rooms they can be signed out to.</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categories" htmlFor="is-cat" hint="One per line.">
              <Textarea id="is-cat" name="categories" rows={9} defaultValue={settings.categories.join("\n")} />
            </Field>
            <Field label="Rooms and places" htmlFor="is-loc" hint="One per line.">
              <Textarea id="is-loc" name="locations" rows={9} defaultValue={settings.locations.join("\n")} />
            </Field>
          </div>
          <label className="flex items-center gap-2.5 fs-14.5 text-ink">
            <input type="checkbox" name="recordPurchases" defaultChecked={settings.recordPurchases} className="size-4 accent-[var(--brand)]" />
            When stock comes in with a cost, offer to add it to Expenses for approval
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
