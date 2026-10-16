import { cn } from "@/lib/cn";

/*
 * Small, dependency-free charts drawn as SVG on the server. One y-axis, thin marks, values on
 * hover and in a table view, colours from the --chart-* tokens in a fixed order.
 */

export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

type Series = { name: string; values: (number | null)[]; color?: string };

export function LineChart({
  labels,
  series,
  max = 100,
  unit = "%",
  height = 220,
  caption,
}: {
  labels: string[];
  series: Series[];
  max?: number;
  unit?: string;
  height?: number;
  caption: string;
}) {
  const W = 640;
  const pad = { l: 38, r: 20, t: 14, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (Math.max(0, Math.min(max, v)) / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <figure className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full min-w-[420px]" role="img" aria-label={caption}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} style={{ stroke: "var(--line)" }} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} style={{ fill: "var(--muted)" }}>
                {t}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text
              key={l + i}
              x={x(i)}
              y={height - 8}
              textAnchor={labels.length > 1 && i === 0 ? "start" : labels.length > 1 && i === labels.length - 1 ? "end" : "middle"}
              fontSize={11}
              style={{ fill: "var(--muted)" }}
            >
              {l}
            </text>
          ))}
          {series.map((s, si) => {
            const color = s.color ?? SERIES[si % SERIES.length];
            const pts = s.values.map((v, i) => (v === null ? null : ([x(i), y(v)] as const)));
            const segs: string[] = [];
            let cur = "";
            for (const p of pts) {
              if (!p) {
                if (cur) segs.push(cur);
                cur = "";
                continue;
              }
              cur += `${cur ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
            }
            if (cur) segs.push(cur);
            return (
              <g key={s.name}>
                {segs.map((d, k) => (
                  <path key={k} d={d} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ))}
                {pts.map((p, i) =>
                  p ? (
                    <g key={i}>
                      <circle cx={p[0]} cy={p[1]} r={4.5} style={{ fill: color, stroke: "var(--canvas)" }} strokeWidth={2} />
                      {/* Larger, invisible hit area for the hover value. */}
                      <circle cx={p[0]} cy={p[1]} r={12} fill="transparent">
                        <title>{`${s.name} · ${labels[i]}: ${s.values[i]}${unit}`}</title>
                      </circle>
                    </g>
                  ) : null,
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s, si) => (
            <li key={s.name} className="flex items-center gap-1.5 fs-13 text-body">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color ?? SERIES[si % SERIES.length] }} />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}
      <details className="fs-13 text-muted">
        <summary className="cursor-pointer select-none font-medium hover:text-ink">Show as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left fs-13">
            <thead>
              <tr>
                <th className="py-1 pr-3 font-medium text-muted"></th>
                {labels.map((l, i) => (
                  <th key={l + i} className="py-1 pr-3 font-medium text-muted">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.name} className="border-t border-line">
                  <td className="py-1 pr-3 text-ink">{s.name}</td>
                  {s.values.map((v, i) => (
                    <td key={i} className="tabular py-1 pr-3 text-body">
                      {v === null ? "—" : `${v}${unit}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/** Horizontal bars with the value always written out. Tone is a status, never the only signal. */
export function BarList({
  rows,
  max = 100,
  unit = "%",
}: {
  rows: { label: string; sub?: string; value: number | null; tone?: "good" | "warn" | "bad" | "neutral"; extra?: React.ReactNode }[];
  max?: number;
  unit?: string;
}) {
  const toneClass = { good: "bg-success", warn: "bg-warning", bad: "bg-danger", neutral: "bg-[var(--chart-1)]" };
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]"
        >
          <span className="min-w-0">
            <span className="block truncate fs-14.5 text-ink">{r.label}</span>
            {r.sub ? <span className="block fs-12.5 text-muted">{r.sub}</span> : null}
          </span>
          <span className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-sunken sm:order-none sm:col-span-1">
            <span
              className={cn("block h-full rounded-full", toneClass[r.tone ?? "neutral"])}
              style={{ width: `${r.value === null ? 0 : Math.max(2, (Math.min(max, r.value) / max) * 100)}%` }}
            />
          </span>
          <span className="flex items-center justify-end gap-2">
            {r.extra}
            <span className="tabular min-w-12 text-right fs-14.5 font-semibold text-ink">{r.value === null ? "—" : `${r.value}${unit}`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Sequential single-hue fill, scaled to the range shown (min to max): deeper means higher. */
export function heatStyle(v: number | null, min = 0, max = 100) {
  if (v === null) return { background: "var(--paper)" };
  const span = Math.max(1, max - min);
  const a = 0.1 + (Math.max(0, Math.min(span, v - min)) / span) * 0.65;
  return { background: `color-mix(in srgb, var(--chart-2) ${Math.round(a * 100)}%, var(--canvas))`, color: a > 0.45 ? "#fff" : "var(--ink)" };
}

/** Mini column chart, e.g. attendance by week. */
export function Columns({ values, labels, ticks, unit = "%", max = 100 }: { values: number[]; labels: string[]; ticks?: string[]; unit?: string; max?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-24 items-end gap-1.5" role="img" aria-label={values.map((v, i) => `${labels[i]}: ${v}${unit}`).join(", ")}>
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-[var(--chart-1)] transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
              title={`${labels[i]}: ${v}${unit}`}
            />
          </div>
        ))}
      </div>
      {ticks ? (
        <div className="flex gap-1.5">
          {ticks.map((t, i) => (
            <span key={i} className="flex-1 text-center fs-11.5 text-muted">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
