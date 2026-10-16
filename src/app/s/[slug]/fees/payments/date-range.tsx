"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** From/to date filter that writes ?from= and ?to= to the URL. */
export function DateRange({ from, to, max }: { from?: string; to?: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  function set(key: "from" | "to", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  const input = "h-full bg-transparent px-2 fs-14 font-medium text-ink focus:outline-none";
  return (
    <div className="flex h-10 items-center rounded-chunk border border-line-strong bg-canvas pl-3 fs-14 focus-within:border-blue">
      <span className="text-muted">From</span>
      <input type="date" aria-label="From date" value={from ?? ""} max={to || max} onChange={(e) => set("from", e.target.value)} className={input} />
      <span className="text-muted">to</span>
      <input type="date" aria-label="To date" value={to ?? ""} min={from} max={max} onChange={(e) => set("to", e.target.value)} className={input} />
    </div>
  );
}
