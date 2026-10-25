import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icons";

export type SettingsTab = { key: string; label: string; href: string };

// Settings grouped the way people look for them. A tab not listed here lands under "More".
const GROUPS: { label: string; keys: string[] }[] = [
  { label: "School", keys: ["profile", "grading", "ai", "domain"] },
  { label: "Money", keys: ["payments", "plan", "addons"] },
  { label: "People & messages", keys: ["messaging", "admissions", "hr", "payroll", "signin"] },
  { label: "Operations", keys: ["behaviour", "library", "inventory", "health", "transport", "hostel", "documents"] },
  { label: "Advanced", keys: ["campuses", "api", "data"] },
];

const ICONS: Record<string, IconName> = {
  profile: "school",
  grading: "results",
  domain: "link",
  payments: "creditCard",
  plan: "receipt",
  addons: "sparkle",
  ai: "wand",
  messaging: "chat",
  admissions: "userPlus",
  hr: "users",
  payroll: "banknote",
  signin: "key",
  behaviour: "star",
  library: "library",
  inventory: "box",
  health: "health",
  transport: "bus",
  hostel: "bed",
  documents: "idCard",
  campuses: "building",
  api: "layers",
  data: "shield",
};

function group(tabs: SettingsTab[]) {
  const listed = new Set(GROUPS.flatMap((g) => g.keys));
  const out = GROUPS.map((g) => ({ label: g.label, items: g.keys.map((k) => tabs.find((t) => t.key === k)).filter((t): t is SettingsTab => Boolean(t)) }));
  const rest = tabs.filter((t) => !listed.has(t.key));
  if (rest.length) out.push({ label: "More", items: rest });
  return out.filter((g) => g.items.length);
}

/**
 * Settings sections. Wide screens: a grouped list beside the page. Phones: Settings opens on the
 * grouped list (as phone settings do); a section opens on its own with a way back to the list.
 * `picked` is false when no section was asked for (the bare Settings address).
 */
export function SettingsNav({ tabs, current, picked, home }: { tabs: SettingsTab[]; current: string; picked: boolean; home: string }) {
  const groups = group(tabs);
  const active = tabs.find((t) => t.key === current);
  return (
    <>
      {picked ? (
        <div className="flex items-center gap-2 lg:hidden">
          <Link href={home} className="-ml-1 inline-flex items-center gap-1 rounded-chunk py-1 pr-2 fs-14.5 font-semibold text-muted hover:text-ink">
            <Icon name="chevronLeft" size={18} /> Settings
          </Link>
          {active ? <span className="fs-14.5 text-muted">/ {active.label}</span> : null}
        </div>
      ) : (
        <nav aria-label="Settings sections" className="flex flex-col gap-6 lg:hidden">
          {groups.map((g) => (
            <section key={g.label} className="flex flex-col gap-2">
              <h2 className="px-1 fs-12.5 font-bold uppercase tracking-[0.08em] text-ink">{g.label}</h2>
              <ul className="overflow-hidden rounded-card border border-line bg-canvas shadow-card">
                {g.items.map((t, i) => (
                  <li key={t.key} className={cn(i > 0 && "border-t border-line")}>
                    <Link href={t.href} className="flex min-h-14 items-center gap-3.5 px-4 py-3 hover:bg-sunken active:bg-sunken">
                      <span className="grid size-9 shrink-0 place-items-center rounded-chunk bg-brand-wash text-brand-ink">
                        <Icon name={ICONS[t.key] ?? "settings"} size={18} />
                      </span>
                      <span className="flex-1 fs-15 font-medium text-ink">{t.label}</span>
                      <Icon name="chevronRight" size={18} className="text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      )}
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
