"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

export type SettingsTab = { key: string; label: string; href: string };

// Settings grouped the way people look for them. A tab not listed here lands under "More".
const GROUPS: { label: string; keys: string[] }[] = [
  { label: "School", keys: ["profile", "grading", "domain"] },
  { label: "Money", keys: ["payments", "plan", "addons"] },
  { label: "People & messages", keys: ["messaging", "admissions", "hr", "payroll", "signin"] },
  { label: "Operations", keys: ["behaviour", "library", "inventory", "health", "transport", "hostel", "documents"] },
  { label: "Advanced", keys: ["campuses", "api", "data"] },
];

function group(tabs: SettingsTab[]) {
  const listed = new Set(GROUPS.flatMap((g) => g.keys));
  const out = GROUPS.map((g) => ({ label: g.label, items: g.keys.map((k) => tabs.find((t) => t.key === k)).filter((t): t is SettingsTab => Boolean(t)) }));
  const rest = tabs.filter((t) => !listed.has(t.key));
  if (rest.length) out.push({ label: "More", items: rest });
  return out.filter((g) => g.items.length);
}

/** Settings sections: a grouped list beside the page on wide screens, one grouped picker on phones. */
export function SettingsNav({ tabs, current }: { tabs: SettingsTab[]; current: string }) {
  const router = useRouter();
  const groups = group(tabs);
  const active = tabs.find((t) => t.key === current);
  return (
    <>
      <label className="flex flex-col gap-1.5 lg:hidden">
        <span className="fs-13.5 font-medium text-muted">Settings section</span>
        <select
          className="h-11 rounded-chunk border border-line-strong bg-canvas px-3 fs-15 font-semibold text-ink"
          value={active?.href ?? ""}
          onChange={(e) => router.push(e.target.value)}
        >
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((t) => (
                <option key={t.key} value={t.href}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <nav aria-label="Settings sections" className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-6">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1.5 fs-12.5 font-bold uppercase tracking-[0.08em] text-ink">{g.label}</p>
              {g.items.map((t) => (
                <Link
                  key={t.key}
                  href={t.href}
                  scroll={false}
                  aria-current={t.key === current ? "page" : undefined}
                  className={cn(
                    "rounded-chunk py-1.5 pl-6 pr-3 fs-14.5 transition-colors",
                    t.key === current ? "bg-brand-wash font-semibold text-brand-ink" : "text-muted hover:bg-sunken hover:text-ink",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
