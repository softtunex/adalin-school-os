"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { GRADING_PRESETS, type Band } from "@/lib/results/compute";
import { saveBandsAction, saveComponentsAction } from "./actions";

type Comp = { name: string; maxScore: number };

export function ComponentsEditor({ slug, initial, locked, editable }: { slug: string; initial: Comp[]; locked: boolean; editable: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();
  const sum = rows.reduce((n, r) => n + (Number(r.maxScore) || 0), 0);

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="fs-16 font-semibold">Continuous assessment and exam</h2>
          <p className="mt-0.5 fs-14 text-muted">The columns teachers fill in. Maximum scores must add up to 100.</p>
        </div>
        <Badge tone={sum === 100 ? "success" : "danger"}>Total {sum} / 100</Badge>
      </div>
      {locked ? <Alert tone="blue">Scores have been entered, so you can rename and reweight these but not add or remove columns.</Alert> : null}
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken fs-13 font-semibold text-body">{i + 1}</span>
            <Input
              aria-label={`Component ${i + 1} name`}
              value={r.name}
              disabled={!editable}
              onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <Input
              aria-label={`Component ${i + 1} maximum`}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={r.maxScore}
              disabled={!editable}
              onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, maxScore: Number(e.target.value) } : x)))}
              className="w-24 text-center"
            />
            {editable && !locked && rows.length > 1 ? (
              <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken hover:text-danger">
                <Icon name="trash" size={17} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {editable ? (
        <div className="flex flex-wrap justify-between gap-2">
          {!locked && rows.length < 8 ? (
            <Button variant="ghost" onClick={() => setRows((prev) => [...prev, { name: `CA ${prev.length}`, maxScore: 10 }])}>
              <Icon name="plus" size={17} /> Add column
            </Button>
          ) : (
            <span />
          )}
          <Button
            disabled={pending || sum !== 100}
            onClick={() =>
              startTransition(async () => {
                const result = await saveComponentsAction(slug, rows);
                setState(result);
                if (!result.error) router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Save assessment"}
          </Button>
        </div>
      ) : null}
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
                    <Input aria-label="Grade" value={r.grade} maxLength={4} disabled={!editable} onChange={(e) => update(i, { grade: e.target.value })} className="h-10 w-20 text-center font-semibold" />
                  </td>
                  <td className="border-b border-line px-2 py-2">
                    <Input aria-label="Minimum score" type="number" min={0} max={100} value={r.minScore} disabled={!editable} onChange={(e) => update(i, { minScore: Number(e.target.value) })} className="h-10 w-20 text-center" />
                  </td>
                  <td className="tabular border-b border-line px-2 py-2 text-body">
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
