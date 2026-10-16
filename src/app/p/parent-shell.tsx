"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/brand";
import { RouteLoader } from "@/components/route-loader";
import { Avatar } from "@/components/ui/display";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/p", label: "Home", icon: "home", match: (p) => p === "/p" },
  { href: "/p/messages", label: "Messages", icon: "chat", match: (p) => p.startsWith("/p/messages") },
  { href: "/p/notifications", label: "Updates", icon: "bell", match: (p) => p.startsWith("/p/notifications") },
  { href: "/p/account", label: "Account", icon: "user", match: (p) => p.startsWith("/p/account") },
];

type Child = { id: string; name: string; detail: string };

function Count({ n, inline }: { n: number; inline?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 fs-11 font-bold leading-none text-white",
        inline ? "ml-auto h-5 min-w-5 bg-brand fs-11.5" : "absolute -right-1.5 -top-1",
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

/**
 * The parent app. Laptops get a sidebar like the staff side (with each child listed for a
 * quick jump); tablets a top bar; phones a top bar with bottom tabs.
 */
export function ParentShell({ user, unread, kids, children }: { user: { name: string; contact: string }; unread: { messages: number; updates: number }; kids: Child[]; children: ReactNode }) {
  const pathname = usePathname();
  const badge = (href: string) => (href === "/p/messages" ? unread.messages : href === "/p/notifications" ? unread.updates : 0);

  return (
    <div className="min-h-dvh bg-paper pb-24 sm:pb-10 lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,var(--paper)_271px,var(--line)_271px,var(--line)_272px,var(--canvas)_272px)] lg:pb-0">
      {/* Laptop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-paper lg:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <Logo href="/p" />
        </div>
        <div className="mx-4 border-t border-line" />
        <nav className="flex-1 overflow-y-auto px-4 py-4" aria-label="Parent app">
          <div className="flex flex-col gap-1">
            {TABS.slice(0, 3).map((t) => {
              const on = t.match(pathname);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative flex h-11 items-center gap-3 rounded-chunk border px-3 fs-15 transition-colors",
                    on ? "shadow-card border-line bg-canvas font-semibold text-ink" : "border-transparent font-medium text-body hover:bg-sunken hover:text-ink",
                  )}
                >
                  {on ? <span aria-hidden className="absolute -left-4 top-2.5 h-6 w-1 rounded-r-full bg-brand" /> : null}
                  <Icon name={t.icon} size={20} className={on ? "text-brand-ink" : undefined} />
                  <span className="flex-1">{t.label}</span>
                  <Count n={badge(t.href)} inline />
                </Link>
              );
            })}
          </div>
          {kids.length ? (
            <div className="mt-6 flex flex-col gap-1">
              <p className="px-3 pb-1 fs-12.5 font-medium text-muted">{kids.length === 1 ? "Your child" : "Children"}</p>
              {kids.map((k) => {
                const on = pathname.startsWith(`/p/children/${k.id}`);
                return (
                  <Link
                    key={k.id}
                    href={`/p/children/${k.id}`}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-chunk border px-2.5 py-2 transition-colors",
                      on ? "shadow-card border-line bg-canvas" : "border-transparent hover:bg-sunken",
                    )}
                  >
                    {on ? <span aria-hidden className="absolute -left-4 top-3 h-6 w-1 rounded-r-full bg-brand" /> : null}
                    <Avatar name={k.name} size={32} />
                    <span className="min-w-0">
                      <span className={cn("block truncate fs-14.5 text-ink", on ? "font-semibold" : "font-medium")}>{k.name}</span>
                      <span className="block truncate fs-12.5 text-muted">{k.detail}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </nav>
        <div className="mx-4 border-t border-line" />
        <div className="p-4">
          <Link href="/p/account" className={cn("flex items-center gap-3 rounded-chunk p-1.5 transition-colors hover:bg-sunken", pathname.startsWith("/p/account") && "bg-canvas shadow-card")}>
            <Avatar name={user.name} size={40} muted />
            <span className="min-w-0 flex-1">
              <span className="block truncate fs-14.5 font-semibold text-ink">{user.name}</span>
              <span className="block truncate fs-13 text-muted">{user.contact}</span>
            </span>
            <Icon name="chevronRight" size={18} className="text-muted" />
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone and tablet top bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur lg:hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="mx-auto flex h-16 max-w-[880px] items-center gap-3 px-4">
            <Logo href="/p" />
            <span className="rounded-md bg-brand-wash px-2 py-0.5 fs-12 font-bold uppercase tracking-[0.06em] text-brand-ink">Parents</span>
            <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Parent app">
              {TABS.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={t.match(pathname) ? "page" : undefined}
                  className={cn("relative flex items-center gap-2 rounded-chunk px-3 py-2 fs-14.5 font-semibold", t.match(pathname) ? "bg-brand-wash text-brand-ink" : "text-body hover:bg-sunken hover:text-ink")}
                >
                  <span className="relative">
                    <Icon name={t.icon} size={19} />
                    <Count n={badge(t.href)} />
                  </span>
                  {t.label}
                </Link>
              ))}
            </nav>
            <Link href="/p/account" className="ml-auto sm:hidden" aria-label="Your account">
              <Avatar name={user.name} size={36} />
            </Link>
          </div>
        </header>

        <main className="relative mx-auto max-w-[880px] px-4 pt-5 sm:pt-8 lg:max-w-[1040px] lg:px-8 lg:pb-12">
          {children}
          <Suspense>
            <RouteLoader />
          </Suspense>
        </main>
      </div>

      {/* Phone bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label="Parent app tabs">
        <div className="grid grid-cols-4">
          {TABS.map((t) => {
            const on = t.match(pathname) || (t.href === "/p" && pathname.startsWith("/p/children"));
            return (
              <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2.5 fs-12 font-bold", on ? "text-brand" : "text-muted")}>
                <span className={cn("relative grid h-8 w-14 place-items-center rounded-full", on && "bg-brand-wash")}>
                  <Icon name={t.icon} size={21} />
                  <Count n={badge(t.href)} />
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
