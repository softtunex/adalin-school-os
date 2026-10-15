"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/cn";
import type { ResolvedNavItem } from "@/lib/navigation";
import { Logo } from "./brand";
import { ThemeSwitch, type Theme } from "./theme-switch";
import { Avatar, Chip } from "./ui/display";
import { Icon } from "./ui/icons";

type Props = {
  school: { name: string; slug: string; planName: string };
  user: { name: string; roleNames: string[] };
  nav: { label?: string; items: ResolvedNavItem[] }[];
  hasOtherSchools: boolean;
  theme: Theme;
  children: ReactNode;
};

function NavLinks({ nav, pathname, home }: { nav: Props["nav"]; pathname: string; home: string }) {
  return (
    <nav className="flex flex-col gap-5" aria-label="Main">
      {nav.map((section, i) => (
        <div key={section.label ?? i} className="flex flex-col gap-1">
          {section.label ? <p className="label-caps px-3 pb-1 text-muted">{section.label}</p> : null}
          {section.items.map((item) => {
            const active = item.href === home ? pathname === home : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-chunk border-2 px-3 text-[13.5px] font-extrabold uppercase tracking-[0.05em] transition-colors",
                  active ? "border-brand bg-brand-wash text-brand-ink" : "border-transparent text-muted hover:bg-sunken hover:text-ink",
                )}
              >
                <Icon name={item.icon} size={20} />
                <span className="flex-1">{item.label}</span>
                {item.locked ? <Icon name="lock" size={15} aria-label="Upgrade to unlock" /> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ school, user, nav, hasOtherSchools, theme, pathname }: Omit<Props, "children"> & { pathname: string }) {
  const home = `/s/${school.slug}`;
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex flex-col gap-4">
        <Logo href={home} />
        <div className="rounded-card border-2 border-line bg-paper p-3">
          <p className="truncate text-[15px] font-extrabold text-ink" title={school.name}>
            {school.name}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <Chip tone="brand">{school.planName} plan</Chip>
            {hasOtherSchools ? (
              <Link href="/schools" className="text-[13px] font-bold text-blue hover:underline">
                Switch
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks nav={nav} pathname={pathname} home={home} />
      </div>
      <div className="flex flex-col gap-3 border-t-2 border-line pt-4">
        <Link href="/account" className="flex items-center gap-3 rounded-chunk p-1.5 hover:bg-sunken">
          <Avatar name={user.name} size={38} />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-bold text-ink">{user.name}</span>
            <span className="block truncate text-[12.5px] text-muted">{user.roleNames.join(", ")}</span>
          </span>
        </Link>
        <ThemeSwitch initial={theme} />
        <form action={logoutAction}>
          <button type="submit" className="flex h-10 w-full items-center gap-3 rounded-chunk px-3 text-[13.5px] font-extrabold uppercase tracking-[0.05em] text-muted hover:bg-sunken hover:text-ink">
            <Icon name="logout" size={19} />
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppShell(props: Props) {
  const pathname = usePathname();
  // The drawer closes on navigation because it only counts as open on the page it was opened from.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r-2 border-line bg-canvas lg:block">
        <SidebarBody {...props} pathname={pathname} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b-2 border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo href={`/s/${props.school.slug}`} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="grid size-11 place-items-center rounded-chunk border-2 border-line text-ink"
        >
          <Icon name="menu" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] overflow-y-auto bg-canvas shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 grid size-10 place-items-center rounded-chunk text-muted hover:bg-sunken"
            >
              <Icon name="x" />
            </button>
            <SidebarBody {...props} pathname={pathname} />
          </div>
        </div>
      ) : null}

      <main className="min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:pt-10">
        <div className="mx-auto w-full max-w-[1120px]">{props.children}</div>
      </main>
    </div>
  );
}
