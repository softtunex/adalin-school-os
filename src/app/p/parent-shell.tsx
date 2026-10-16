"use client";

import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal-shell";

/** The parent app: Home, Messages, Updates, Account, with each child in the laptop sidebar. */
export function ParentShell({ user, unread, kids, children }: { user: { name: string; contact: string }; unread: { messages: number; updates: number }; kids: { id: string; name: string; detail: string }[]; children: ReactNode }) {
  return (
    <PortalShell
      home="/p"
      tag="Parents"
      user={{ ...user, href: "/p/account" }}
      side={{ title: kids.length === 1 ? "Your child" : "Children", items: kids.map((k) => ({ href: `/p/children/${k.id}`, name: k.name, detail: k.detail })) }}
      tabs={[
        { href: "/p", label: "Home", icon: "home", match: (p) => p === "/p" || p.startsWith("/p/children") },
        { href: "/p/messages", label: "Messages", icon: "chat", match: (p) => p.startsWith("/p/messages"), count: unread.messages },
        { href: "/p/notifications", label: "Updates", icon: "bell", match: (p) => p.startsWith("/p/notifications"), count: unread.updates },
        { href: "/p/account", label: "Account", icon: "user", match: (p) => p.startsWith("/p/account"), sidebar: false },
      ]}
    >
      {children}
    </PortalShell>
  );
}
