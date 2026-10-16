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
  { href: "/p", label: "Home", icon: "home", match: (p) => p === "/p" || p.startsWith("/p/children") },
  { href: "/p/messages", label: "Messages", icon: "chat", match: (p) => p.startsWith("/p/messages") },
  { href: "/p/notifications", label: "Updates", icon: "bell", match: (p) => p.startsWith("/p/notifications") },
  { href: "/p/account", label: "Account", icon: "user", match: (p) => p.startsWith("/p/account") },
];

function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="tabular absolute -right-1.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 fs-11 font-bold leading-none text-white">{n > 9 ? "9+" : n}</span>;
}

/** The parent app: a top bar on every size, bottom tabs on phones. */
export function ParentShell({ user, unread, children }: { user: { name: string }; unread: { messages: number; updates: number }; children: ReactNode }) {
  const pathname = usePathname();
  const badge = (href: string) => (href === "/p/messages" ? unread.messages : href === "/p/notifications" ? unread.updates : 0);
  return (
    <div className="min-h-dvh bg-paper pb-24 sm:pb-10">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
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
          <Link href="/p/account" className="ml-auto sm:ml-2" aria-label="Your account">
            <Avatar name={user.name} size={36} />
          </Link>
        </div>
      </header>
      <main className="relative mx-auto max-w-[880px] px-4 pt-5 sm:pt-8">
        {children}
        <Suspense>
          <RouteLoader />
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} aria-label="Parent app">
        <div className="grid grid-cols-4">
          {TABS.map((t) => {
            const on = t.match(pathname);
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
