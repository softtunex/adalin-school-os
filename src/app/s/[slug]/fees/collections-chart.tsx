"use client";

import { useState } from "react";
import { formatNaira, formatNairaCompact } from "@/lib/money";

const W = 640;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 52 };

function niceMax(v: number) {
  if (v <= 0) return 100_000_00;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function label(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Money collected per day over the last 30 days. One series, so no legend; hover for exact figures. */
export function CollectionsChart({ series }: { series: { day: string; amount: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...series.map((s) => s.amount)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / series.length;
  const barW = Math.max(4, slot - 6);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const total = series.reduce((n, s) => n + s.amount, 0);
  const active = hover !== null ? series[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Fees collected per day over the last 30 days, ${formatNaira(total)} in total`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted" fontSize="11">
              {t === 0 ? "₦0" : formatNairaCompact(t)}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = Math.max(s.amount > 0 ? 3 : 0, (s.amount / max) * innerH);
          const top = PAD.top + innerH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={s.day}>
              {h > 0 ? (
                <path
                  d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                  fill="var(--brand)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              ) : null}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
            </g>
          );
        })}
        {[0, Math.floor(series.length / 2), series.length - 1].map((i) => (
          <text key={i} x={PAD.left + i * slot + slot / 2} y={H - 8} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="fill-muted" fontSize="11">
            {series[i] ? label(series[i].day) : ""}
          </text>
        ))}
      </svg>
      {active ? (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-chunk border border-line bg-canvas px-3 py-2 shadow-card"
          style={{ left: `${((PAD.left + hover! * slot + slot / 2) / W) * 100}%` }}
        >
          <p className="whitespace-nowrap fs-12.5 text-muted">{label(active.day)}</p>
          <p className="tabular whitespace-nowrap fs-14 font-semibold text-ink">{formatNaira(active.amount)}</p>
        </div>
      ) : null}
    </div>
  );
}
