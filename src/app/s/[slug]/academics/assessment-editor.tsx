"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { COMPONENT_PRESETS, GRADING_PRESETS, type Band } from "@/lib/results/compute";
import { saveBandsAction, saveComponentsAction } from "./actions";

type Comp = { id?: string; name: string; maxScore: number };

/**
 * Lays a preset over the current columns, reusing an existing column (and its scores)
 * by matching name first, then position, so "Exam" stays "Exam" when the split changes.
 */
function applyPreset(current: Comp[], preset: readonly { name: string; maxScore: number }[]): Comp[] {
  const free = current.filter((c) => c.id);
  const out: Comp[] = preset.map((p) => {
    const i = free.findIndex((c) => c.name.trim().toLowerCase() === p.name.toLowerCase());
    return i >= 0 ? { ...p, id: free.splice(i, 1)[0].id } : { ...p };
  });
  for (const row of out) if (!row.id && free.length) row.id = free.shift()!.id;
  return out;
}

export function ComponentsEditor({ slug, initial, scoreCounts, editable }: { slug: string; initial: Comp[]; scoreCounts: Record<string, number>; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const sum = rows.reduce((n, r) => n + (Number(r.maxScore) || 0), 0);
  const kept = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
  const removed = initial.filter((c) => c.id && !kept.has(c.id) && (scoreCounts[c.id] ?? 0) > 0);
  const losing = removed.reduce((n, c) => n + (scoreCounts[c.id!] ?? 0), 0);

  function edit(next: Comp[]) {
    setRows(next);
    setState({});
  }

  async function save(confirm: boolean) {
    const result = await saveComponentsAction(slug, rows, confirm);
    setState(result);
    if (!result.error) {
      setConfirming(false);
      router.refresh();
    }
    return result;
  }

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="fs-16 font-semibold">Continuous assessment and exam</h2>
          <p className="mt-0.5 fs-14 text-muted">The columns teachers fill in. Maximum scores must add up to 100.</p>
        </div>
        <Badge tone={sum === 100 ? "success" : "danger"}>Total {sum} / 100</Badge>
      </div>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <span className="self-center fs-13.5 text-muted">Start from:</span>
          {COMPONENT_PRESETS.map((p) => (
            <Button key={p.label} variant="secondary" size="sm" onClick={() => edit(applyPreset(rows, p.components))}>
              {p.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const n = r.id ? (scoreCounts[r.id] ?? 0) : 0;
          return (
            <div key={r.id ?? `new-${i}`} className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken fs-13 font-semibold text-body">{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Input aria-label={`Component ${i + 1} name`} value={r.name} disabled={!editable} onChange={(e) => edit(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              </div>
              <Input
                aria-label={`Component ${i + 1} maximum`}
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={r.maxScore}
                disabled={!editable}
                onChange={(e) => edit(rows.map((x, j) => (j === i ? { ...x, maxScore: Number(e.target.value) } : x)))}
                className="w-20 px-2 text-center sm:w-24"
              />
              {editable && rows.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove ${r.name || `component ${i + 1}`}`}
                  title={n ? `${n} scores recorded` : undefined}
                  onClick={() => edit(rows.filter((_, j) => j !== i))}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken hover:text-danger"
                >
                  <Icon name="trash" size={17} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {removed.length ? (
        <Alert tone="warning">
          Removing {removed.map((c) => c.name).join(" and ")} deletes {losing} recorded score{losing === 1 ? "" : "s"}. Totals and positions recalculate from the columns that remain.
        </Alert>
      ) : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {editable ? (
        <div className="flex flex-wrap justify-between gap-2">
          {rows.length < 8 ? (
            <Button variant="ghost" onClick={() => edit([...rows, { name: `CA ${rows.length}`, maxScore: 10 }])}>
              <Icon name="plus" size={17} /> Add column
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={pending || sum !== 100} onClick={() => (losing ? setConfirming(true) : startTransition(async () => void (await save(false))))}>
            {pending ? "Saving…" : "Save assessment"}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} title="Delete recorded scores?" confirmLabel={`Delete ${losing} scores and save`} danger onConfirm={() => save(true)}>
        {removed.map((c) => c.name).join(" and ")} already {removed.length === 1 ? "has" : "have"} {losing} score{losing === 1 ? "" : "s"} entered by teachers. They will be deleted and can&apos;t be recovered. Published results will change if they used these columns.
      </ConfirmDialog>
    </Card>
  );
}

export function BandsEditor({ slug, initial, editable }: { slug: string; initial: Band[]; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => [...initial].sort((a, b) => b.minScore - a.minScore));
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();
  const sorted = [...rows].sort((a, b) => b.minScore - a.minScore);

  function update(i: number, patch: Partial<Band>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setState({});
  }

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Grading scale</h2>
        <p className="mt-0.5 fs-14 text-muted">Each grade starts at its minimum score and runs up to the next grade.</p>
      </div>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <span className="self-center fs-13.5 text-muted">Start from:</span>
          {Object.entries(GRADING_PRESETS).map(([key, preset]) => (
            <Button key={key} variant="secondary" size="sm" onClick={() => setRows(preset.bands.map((b) => ({ ...b })))}>
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-0 fs-14">
          <thead>
            <tr>
              {["Grade", "From", "Range", "Remark", "Counts as pass", ""].map((h) => (
                <th key={h} className="bg-paper px-2 py-2.5 text-left fs-13 font-medium text-muted first:rounded-l-[10px] last:rounded-r-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const idx = sorted.indexOf(r);
              const upper = idx <= 0 ? 100 : sorted[idx - 1].minScore - 1;
              return (
                <tr key={i}>
                  <td className="border-b border-line px-2 py-2">
                    <Input aria-label="Grade" value={r.grade} maxLength={4} disabled={!editable} onChange={(e) => update(i, { grade: e.target.value })} className="h-10 w-[72px] px-2 text-center font-semibold" />
                  </td>
                  <td className="w-[84px] border-b border-line px-2 py-2">
                    <Input aria-label="Minimum score" inputMode="numeric" value={r.minScore} disabled={!editable} onChange={(e) => update(i, { minScore: Number(e.target.value.replace(/\D/g, "").slice(0, 3)) })} className="h-10 w-[68px] min-w-[68px] px-2 text-center" />
                  </td>
                  <td className="tabular whitespace-nowrap border-b border-line px-2 py-2 text-body">
                    {r.minScore}–{upper}
                  </td>
                  <td className="border-b border-line px-2 py-2">
                    <Input aria-label="Remark" value={r.remark} maxLength={30} disabled={!editable} onChange={(e) => update(i, { remark: e.target.value })} className="h-10" />
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center">
                    <input type="checkbox" aria-label="Counts as pass" checked={r.passes} disabled={!editable} onChange={(e) => update(i, { passes: e.target.checked })} className="size-[18px] accent-[var(--brand)]" />
                  </td>
                  <td className="border-b border-line px-2 py-2 text-right">
                    {editable && rows.length > 2 ? (
                      <button type="button" aria-label={`Remove ${r.grade}`} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-danger">
                        <Icon name="trash" size={16} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {editable ? (
        <div className={cn("flex flex-wrap justify-between gap-2")}>
          <Button variant="ghost" onClick={() => setRows((prev) => [...prev, { grade: "", minScore: 0, remark: "", passes: true }])} disabled={rows.length >= 15}>
            <Icon name="plus" size={17} /> Add grade
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveBandsAction(slug, rows);
                setState(result);
                if (!result.error) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save grading scale"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
