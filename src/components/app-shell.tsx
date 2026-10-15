"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ResolvedNavItem } from "@/lib/navigation";
import { Avatar, initials } from "./ui/display";
import { Icon } from "./ui/icons";

type Props = {
  school: { name: string; slug: string; planName: string; logoUrl: string | null };
  user: { name: string; email: string; roleNames: string[] };
  nav: { label?: string; items: ResolvedNavItem[] }[];
  children: ReactNode;
};

function SchoolMark({ name, logoUrl, size = 40 }: { name: string; logoUrl: string | null; size?: number }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-white shadow-[0_2px_0_var(--brand-deep)]" style={{ width: size, height: size }}>
      {initials(name)}
    </span>
  );
}

function SidebarBody({ school, user, nav, pathname }: Omit<Props, "children"> & { pathname: string }) {
  const home = `/s/${school.slug}`;
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-4 pt-5">
        <Link href="/schools?pick=1" className="group flex items-center gap-3 rounded-chunk p-1.5 transition-colors hover:bg-sunken" title="Switch school">
          <SchoolMark name={school.name} logoUrl={school.logoUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">{school.name}</span>
            <span className="block truncate text-[13px] text-muted">{school.planName} plan</span>
          </span>
          <span className="grid size-8 place-items-center rounded-[9px] border border-line-strong bg-canvas text-muted group-hover:text-ink">
            <Icon name="chevronsUpDown" size={16} />
          </span>
        </Link>
      </div>
      <div className="mx-4 border-t border-line" />

      <nav className="flex-1 overflow-y-auto px-4 py-4" aria-label="Main">
        <div className="flex flex-col gap-5">
          {nav.map((section, i) => (
            <div key={section.label ?? i} className="flex flex-col gap-1">
              {section.label ? <p className="px-3 pb-1 text-[12.5px] font-medium text-muted">{section.label}</p> : null}
              {section.items.map((item) => {
                const active = item.href === home ? pathname === home : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-11 items-center gap-3 rounded-chunk border px-3 text-[15px] transition-colors",
                      active ? "shadow-card border-line bg-canvas font-semibold text-ink" : "border-transparent font-medium text-body hover:bg-sunken hover:text-ink",
                    )}
                  >
                    {active ? <span aria-hidden className="absolute -left-4 top-2.5 h-6 w-1 rounded-r-full bg-brand" /> : null}
                    <Icon name={item.icon} size={20} className={active ? "text-brand-ink" : undefined} />
                    <span className="flex-1">{item.label}</span>
                    {item.locked ? <Icon name="lock" size={15} className="text-muted" aria-label="Upgrade to unlock" /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="mx-4 border-t border-line" />
      <div className="p-4">
        <Link href="/account" className="flex items-center gap-3 rounded-chunk p-1.5 transition-colors hover:bg-sunken">
          <Avatar name={user.name} size={42} muted />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate text-[14.5px] font-semibold text-ink">
              <span className="truncate">{user.name}</span>
              {user.roleNames.includes("Proprietor") ? <Icon name="badgeCheck" size={16} className="shrink-0 text-blue" aria-label="Proprietor" /> : null}
            </span>
            <span className="block truncate text-[13px] text-muted">{user.email}</span>
          </span>
          <Icon name="chevronRight" size={18} className="text-muted" />
        </Link>
      </div>
    </div>
  );
}

export function AppShell(props: Props) {
  const pathname = usePathname();
  // The drawer closes on navigation because it only counts as open on the page it was opened from.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[288px_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,var(--paper)_287px,var(--line)_287px,var(--line)_288px,var(--canvas)_288px)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-paper lg:block">
        <SidebarBody {...props} pathname={pathname} />
      </aside>

      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpenedOn(pathname)}
          aria-label="Open menu"
          aria-expanded={open}
          className="grid size-10 place-items-center rounded-chunk border border-line-strong text-ink"
        >
          <Icon name="menu" />
        </button>
        <SchoolMark name={props.school.name} logoUrl={props.school.logoUrl} size={32} />
        <span className="truncate text-[15px] font-semibold text-ink">{props.school.name}</span>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpenedOn(null)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] overflow-y-auto bg-paper shadow-xl">
            <SidebarBody {...props} pathname={pathname} />
          </div>
        </div>
      ) : null}

      <main className="min-w-0">{props.children}</main>
    </div>
  );
}
