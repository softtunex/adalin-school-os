"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { formatNaira, koboToInput, parseNaira } from "@/lib/money";
import { copyStructureAction, deleteFeeItemAction, saveFeeItemAction, saveStructureAction } from "../actions";

type Item = { id: string; name: string; isOptional: boolean };
type Level = { id: string; name: string };

export function FeeItemsCard({ slug, items, editable }: { slug: string; items: Item[]; editable: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [optional, setOptional] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<Item | null>(null);

  function save(input: { id?: string; name: string; isOptional: boolean }, reset = false) {
    startTransition(async () => {
      const r = await saveFeeItemAction(slug, input);
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.success ?? "Saved." });
      if (!r.error) {
        if (reset) {
          setName("");
          setOptional(false);
        }
        router.refresh();
      }
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="fs-16 font-semibold">Fee items</h2>
        <p className="mt-0.5 fs-14 text-muted">What the school charges for. Optional items, like the school bus, aren&apos;t added to term invoices automatically; add them to a student&apos;s invoice when they apply.</p>
      </div>
      {items.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-1.5 rounded-chunk border border-line-strong bg-canvas py-1 pl-3 pr-1 fs-14">
              <span className="font-medium text-ink">{i.name}</span>
              {i.isOptional ? <Badge tone="blue">Optional</Badge> : null}
              {editable ? (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => save({ id: i.id, name: i.name, isOptional: !i.isOptional })}
                    className="rounded-md px-1.5 py-0.5 fs-12.5 font-medium text-muted hover:bg-sunken hover:text-ink"
                    title={i.isOptional ? "Make compulsory" : "Make optional"}
                  >
                    {i.isOptional ? "Make compulsory" : "Make optional"}
                  </button>
                  <button type="button" aria-label={`Remove ${i.name}`} onClick={() => setRemoving(i)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-sunken hover:text-danger">
                    <Icon name="x" size={14} />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="fs-14.5 text-muted">No fee items yet. Start with Tuition.</p>
      )}
      {editable ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save({ name: name.trim(), isOptional: optional }, true);
          }}
        >
          <Input aria-label="New fee item" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuition, Development levy, PTA" className="h-10 w-full sm:w-72" />
          <label className="flex items-center gap-2 fs-14 text-body">
            <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Optional
          </label>
          <Button type="submit" size="sm" disabled={pending || !name.trim()}>
            <Icon name="plus" size={16} />
            Add item
          </Button>
        </form>
      ) : null}
      {message ? <p className={message.ok ? "fs-13.5 text-success" : "fs-13.5 text-danger"}>{message.text}</p> : null}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        confirmLabel="Remove item"
        danger
        onConfirm={async () => {
          const r = await deleteFeeItemAction(slug, removing!.id);
          if (!r.error) {
            setRemoving(null);
            router.refresh();
          }
          return r;
        }}
      >
        Its amounts come out of every term&apos;s fee structure. Invoices already raised keep their lines.
      </ConfirmDialog>
    </Card>
  );
}

export function StructureGrid({
  slug,
  term,
  terms,
  levels,
  items,
  grid,
  invoiced,
  editable,
}: {
  slug: string;
  term: { id: string; label: string };
  terms: { id: string; label: string }[];
  levels: Level[];
  items: Item[];
  grid: Record<string, Record<string, number>>;
  invoiced: number;
  editable: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const l of levels) for (const i of items) out[`${l.id}:${i.id}`] = koboToInput(grid[l.id]?.[i.id]);
    return out;
  }, [levels, items, grid]);
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [copyFrom, setCopyFrom] = useState("");
  const [confirmCopy, setConfirmCopy] = useState(false);
  const dirty = Object.keys(values).some((k) => values[k] !== initial[k]);
  const invalid = Object.entries(values).filter(([, v]) => v.trim() && parseNaira(v) === null).map(([k]) => k);

  function total(levelId: string) {
    return items.filter((i) => !i.isOptional).reduce((n, i) => n + (parseNaira(values[`${levelId}:${i.id}`]) ?? 0), 0);
  }

  function fillDown(itemId: string) {
    const first = levels.map((l) => values[`${l.id}:${itemId}`]).find((v) => v?.trim());
    if (!first) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const l of levels) if (!next[`${l.id}:${itemId}`]?.trim()) next[`${l.id}:${itemId}`] = first;
      return next;
    });
  }

  if (!items.length) return null;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="fs-16 font-semibold">Amounts for {term.label}</h2>
          <p className="mt-0.5 fs-14 text-muted">Leave a box empty if that class doesn&apos;t pay the item. Totals count compulsory items only.</p>
        </div>
        {editable && terms.length ? (
          <div className="flex items-center gap-2">
            <Select aria-label="Copy fees from" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="h-10 w-56 fs-14">
              <option value="">Copy from another term…</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" disabled={!copyFrom || pending} onClick={() => setConfirmCopy(true)}>
              Copy
            </Button>
          </div>
        ) : null}
      </div>
      {invoiced > 0 ? <Alert tone="blue">{invoiced} invoices have already been raised for this term. Changes here apply to invoices raised from now on; existing invoices keep their amounts.</Alert> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 fs-14">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-paper px-3 py-2.5 text-left fs-13 font-medium text-muted first:rounded-l-[10px]">Class</th>
              {items.map((i) => (
                <th key={i.id} className="bg-paper px-2 py-2.5 text-left fs-13 font-medium text-muted">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {i.name}
                    {i.isOptional ? <span className="fs-12 text-blue">(optional)</span> : null}
                    {editable ? (
                      <button type="button" onClick={() => fillDown(i.id)} title="Copy the first amount into the empty boxes below" className="rounded px-1 fs-12 text-blue hover:bg-blue-wash">
                        Fill
                      </button>
                    ) : null}
                  </span>
                </th>
              ))}
              <th className="bg-paper px-3 py-2.5 text-right fs-13 font-medium text-muted last:rounded-r-[10px]">Term total</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.id}>
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-line bg-canvas px-3 py-2 font-medium text-ink">{l.name}</td>
                {items.map((i) => {
                  const key = `${l.id}:${i.id}`;
                  return (
                    <td key={i.id} className="border-b border-line px-2 py-2">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 fs-13.5 text-muted">₦</span>
                        <Input
                          aria-label={`${i.name} for ${l.name}`}
                          inputMode="decimal"
                          value={values[key] ?? ""}
                          disabled={!editable}
                          aria-invalid={invalid.includes(key)}
                          onChange={(e) => {
                            setValues((prev) => ({ ...prev, [key]: e.target.value }));
                            setMessage(null);
                          }}
                          className="tabular h-10 min-w-[120px] pl-6 pr-2 fs-14"
                        />
                      </div>
                    </td>
                  );
                })}
                <td className="tabular whitespace-nowrap border-b border-line px-3 py-2 text-right font-semibold text-ink">{formatNaira(total(l.id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert> : null}
      {editable ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {invalid.length ? <span className="fs-13.5 text-danger">Fix the highlighted amounts.</span> : dirty ? <span className="fs-13.5 text-muted">Unsaved changes</span> : null}
          <Button
            disabled={pending || !dirty || invalid.length > 0}
            onClick={() =>
              startTransition(async () => {
                const amounts = Object.entries(values)
                  .filter(([, v]) => v.trim())
                  .map(([k, amount]) => {
                    const [levelId, itemId] = k.split(":");
                    return { levelId, itemId, amount };
                  });
                const r = await saveStructureAction(slug, { termId: term.id, amounts });
                setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.success ?? "Saved." });
                if (!r.error) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save fee structure"}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmCopy}
        onClose={() => setConfirmCopy(false)}
        title="Replace this term's amounts?"
        confirmLabel="Copy amounts"
        onConfirm={async () => {
          const r = await copyStructureAction(slug, copyFrom, term.id);
          if (!r.error) {
            setConfirmCopy(false);
            setMessage({ ok: true, text: r.success ?? "Copied." });
            router.refresh();
          }
          return r;
        }}
      >
        Every amount for {term.label} is replaced with the amounts from {terms.find((t) => t.id === copyFrom)?.label}.
      </ConfirmDialog>
    </Card>
  );
}
