"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { flattenNav, isGroup, type ResolvedNav, type ResolvedNavItem } from "@/lib/navigation";
import { Icon } from "./ui/icons";

function Count({ n }: { n: number }) {
  return (
    <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 fs-11.5 font-bold text-white" aria-label={`${n} new`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function NavLink({ item, active, nested, picked, showGroup }: { item: ResolvedNavItem; active: boolean; nested?: boolean; picked?: boolean; showGroup?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-chunk border px-3 transition-colors",
        nested ? "h-10 fs-14.5" : "h-11 fs-15",
        active ? "shadow-card border-line bg-canvas font-semibold text-ink" : "border-transparent font-medium text-body hover:bg-sunken hover:text-ink",
        picked && !active ? "bg-sunken text-ink" : null,
      )}
    >
      {active ? <span aria-hidden className={cn("absolute top-2 h-6 w-1 rounded-r-full bg-brand", nested ? "-left-[2rem]" : "-left-4")} /> : null}
      <Icon name={item.icon} size={nested ? 18 : 20} className={active ? "text-brand-ink" : undefined} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {showGroup && item.group ? <span className="shrink-0 fs-12.5 font-normal text-muted">{item.group}</span> : null}
      {item.locked ? <Icon name="lock" size={15} className="text-muted" aria-label="Upgrade to unlock" /> : null}
      {!item.locked && item.badge ? <Count n={item.badge} /> : null}
    </Link>
  );
}

function score(item: ResolvedNavItem, q: string) {
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 0;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 1;
  if (label.includes(q)) return 2;
  if ((item.keywords ?? "").toLowerCase().split(/\s+/).some((w) => w.startsWith(q))) return 3;
  if ((item.group ?? "").toLowerCase().startsWith(q)) return 4;
  return 9;
}

/** The sidebar's links: a search box, top-level pages, and groups that open to show theirs. */
export function SidebarNav({ nav, home, pathname }: { nav: ResolvedNav; home: string; pathname: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(0);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Analytics lives under Overview, so Overview stays highlighted there.
  const isActive = (href: string) => (href === home ? pathname === home || pathname.startsWith(`${home}/analytics`) : pathname === href || pathname.startsWith(`${href}/`));
  const term = q.trim().toLowerCase();
  const results = term
    ? flattenNav(nav)
        .map((item) => ({ item, s: score(item, term) }))
        .filter((r) => r.s < 9)
        .sort((a, b) => a.s - b.s)
        .map((r) => r.item)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Icon name="search" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPick(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setPick((p) => Math.min(p + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setPick((p) => Math.max(p - 1, 0));
            } else if (e.key === "Enter" && results[pick]) {
              e.preventDefault();
              setQ("");
              router.push(results[pick].href);
            } else if (e.key === "Escape") {
              setQ("");
            }
          }}
          placeholder="Find a page"
          aria-label="Find a page in the menu"
          className="h-10 w-full rounded-chunk border border-line-strong bg-canvas pl-9 pr-16 fs-14.5 text-ink placeholder:text-muted focus:border-brand focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-paper px-1.5 py-0.5 font-sans fs-11.5 text-muted lg:block">Ctrl K</kbd>
      </div>

      {term ? (
        results.length ? (
          <ul className="flex flex-col gap-1" aria-label="Matching pages">
            {results.map((item, i) => (
              <li key={item.href} onMouseEnter={() => setPick(i)} onClick={() => setQ("")}>
                <NavLink item={item} active={isActive(item.href)} picked={i === pick} showGroup />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 fs-14 text-muted">No page called &ldquo;{q.trim()}&rdquo;.</p>
        )
      ) : (
        <div className="flex flex-col gap-1">
          {nav.map((entry) => {
            if (!isGroup(entry)) return <NavLink key={entry.href} item={entry} active={isActive(entry.href)} />;
            const hasActive = entry.items.some((i) => isActive(i.href));
            const open = toggled[entry.group] ?? hasActive;
            const count = entry.items.reduce((n, i) => n + (i.locked ? 0 : (i.badge ?? 0)), 0);
            const id = `nav-${entry.group.toLowerCase().replace(/\W+/g, "-")}`;
            return (
              <div key={entry.group} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={id}
                  onClick={() => setToggled((t) => ({ ...t, [entry.group]: !open }))}
                  className={cn("flex h-11 items-center gap-3 rounded-chunk px-3 fs-15 transition-colors hover:bg-sunken hover:text-ink", hasActive ? "font-semibold text-ink" : "font-medium text-body")}
                >
                  <Icon name={entry.icon} size={20} className={hasActive ? "text-brand-ink" : undefined} />
                  <span className="flex-1 text-left">{entry.group}</span>
                  {!open && count ? <Count n={count} /> : null}
                  <Icon name="chevronDown" size={16} className={cn("text-muted transition-transform", open ? "rotate-180" : null)} />
                </button>
                {open ? (
                  <div id={id} className="ml-[1.35rem] flex flex-col gap-0.5 border-l border-line pl-2.5">
                    {entry.items.map((item) => (
                      <NavLink key={item.href} item={item} active={isActive(item.href)} nested />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
