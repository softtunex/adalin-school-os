"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  return { update, params, pending };
}

export function SearchInput({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { update, params, pending } = useQueryUpdater();
  const initial = params.get(param) ?? "";
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // On slow connections people can type before the page is interactive; pick that text up once it is.
  useEffect(() => {
    const typed = inputRef.current?.value ?? "";
    if (typed !== initial) {
      setValue(typed);
      update({ [param]: typed.trim() || null });
    }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      role="search"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        update({ [param]: value.trim() || null });
      }}
      className={cn("relative flex h-10 w-full min-w-0 items-center sm:w-72", className)}
    >
      {[...params.entries()].filter(([k]) => k !== param && k !== "page").map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="contents">
      <span className="sr-only">{placeholder}</span>
      <Icon name="search" size={18} className={cn("pointer-events-none absolute left-3 text-muted", pending && "animate-pulse")} />
      <input
        ref={inputRef}
        type="search"
        name={param}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => update({ [param]: v.trim() || null }), 300);
        }}
        className="h-10 w-full rounded-chunk border border-line-strong bg-canvas pl-10 pr-3 fs-14.5 text-ink placeholder:text-muted focus:border-blue focus:shadow-[0_0_0_3px_var(--blue-wash)] focus:outline-none"
      />
      </label>
    </form>
  );
}

export function FilterSelect({ label, param, options, includeAll = true }: { label: string; param: string; options: { value: string; label: string }[]; includeAll?: boolean }) {
  const { update, params } = useQueryUpdater();
  const current = params.get(param) ?? "";
  return (
    <label className="relative flex h-10 items-center rounded-chunk border border-line-strong bg-canvas pl-3 fs-14 focus-within:border-blue">
      <span className="text-muted">{label}</span>
      <select
        value={current}
        onChange={(e) => update({ [param]: e.target.value || null })}
        className="h-full appearance-none bg-transparent bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-2 pr-9 font-medium text-ink focus:outline-none"
        style={{ backgroundImage: "var(--select-arrow)" }}
      >
        {includeAll ? <option value="">All</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToolbarLink({ href, icon, children }: { href: string; icon: IconName; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-chunk border border-line-strong bg-canvas px-3.5 fs-14 font-medium text-ink transition-colors hover:bg-paper"
    >
      <Icon name={icon} size={17} />
      {children}
    </a>
  );
}

function pageWindow(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page, page - 1, page + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({ page, pageSize, total, noun = "results" }: { page: number; pageSize: number; total: number; noun?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const item = "grid h-9 min-w-9 place-items-center rounded-[9px] px-2 fs-14 font-medium tabular";

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="tabular fs-13.5 text-muted">
        {total === 0 ? `No ${noun}` : `Showing ${from}–${to} of ${total} ${noun}`}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          {page > 1 ? (
            <Link href={href(page - 1)} aria-label="Previous page" className={cn(item, "text-body hover:bg-sunken")} scroll={false}>
              <Icon name="chevronLeft" size={17} />
            </Link>
          ) : (
            <span className={cn(item, "text-line-strong")} aria-hidden>
              <Icon name="chevronLeft" size={17} />
            </span>
          )}
          {pageWindow(page, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className={cn(item, "text-muted")}>
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                aria-current={p === page ? "page" : undefined}
                scroll={false}
                className={cn(item, p === page ? "bg-brand-wash text-brand-ink" : "text-body hover:bg-sunken")}
              >
                {p}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link href={href(page + 1)} aria-label="Next page" className={cn(item, "text-body hover:bg-sunken")} scroll={false}>
              <Icon name="chevronRight" size={17} />
            </Link>
          ) : (
            <span className={cn(item, "text-line-strong")} aria-hidden>
              <Icon name="chevronRight" size={17} />
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}

export type MenuItem = { label: string; icon?: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean };

/** Kebab "more actions" menu for table rows. */
export function RowMenu({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        <Icon name="moreVertical" size={18} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-chunk border border-line bg-canvas p-1 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left fs-14 font-medium transition-colors disabled:opacity-50",
                item.danger ? "text-danger hover:bg-danger-wash" : "text-ink hover:bg-sunken",
              )}
            >
              {item.icon ? <Icon name={item.icon} size={17} /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
