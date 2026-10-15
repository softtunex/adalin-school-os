import Link from "next/link";
import { cn } from "@/lib/cn";

/** URL-driven tabs, so each tab is linkable and survives refresh. */
export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap px-3.5 pb-3 pt-1 text-[14.5px] font-medium transition-colors",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="tabular ml-1.5 rounded-md bg-sunken px-1.5 py-0.5 text-[12px] text-body">{t.count}</span> : null}
            {active ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-brand" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
