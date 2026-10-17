"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  ["/admin", "Overview"],
  ["/admin/schools", "Schools"],
  ["/admin/bills", "Bills"],
  ["/admin/orders", "Add-on orders"],
  ["/admin/plans", "Plans"],
  ["/admin/activity", "Activity"],
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Admin">
      {ITEMS.map(([href, label]) => {
        const active = href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 fs-14.5 font-medium", active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
