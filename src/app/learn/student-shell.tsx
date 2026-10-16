"use client";

import type { ReactNode } from "react";
import { PortalShell, type PortalTab } from "@/components/portal-shell";

/** The student portal: today, timetable, schoolwork and results, as the school allows. */
export function StudentShell({ user, show, children }: { user: { name: string; contact: string }; show: { timetable: boolean; results: boolean }; children: ReactNode }) {
  const tabs: PortalTab[] = [
    { href: "/learn", label: "Today", icon: "home", match: (p) => p === "/learn" },
    ...(show.timetable ? [{ href: "/learn/timetable", label: "Timetable", icon: "clock" as const, match: (p: string) => p.startsWith("/learn/timetable") }] : []),
    ...(show.results ? [{ href: "/learn/results", label: "Results", icon: "results" as const, match: (p: string) => p.startsWith("/learn/results") }] : []),
    { href: "/learn/account", label: "Account", icon: "user", match: (p) => p.startsWith("/learn/account"), sidebar: false },
  ];
  return (
    <PortalShell home="/learn" tag="Students" user={{ ...user, href: "/learn/account" }} tabs={tabs}>
      {children}
    </PortalShell>
  );
}
