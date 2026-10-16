"use client";

import type { ReactNode } from "react";
import { PortalShell, type PortalTab } from "@/components/portal-shell";

/** The student portal: today, timetable, schoolwork and results, as the school allows. */
export function StudentShell({ user, show, children }: { user: { name: string; contact: string }; show: { timetable: boolean; homework: number | null; exams: number | null; materials: boolean; results: boolean }; children: ReactNode }) {
  const tabs: PortalTab[] = [
    { href: "/learn", label: "Today", icon: "home", match: (p) => p === "/learn" },
    ...(show.timetable ? [{ href: "/learn/timetable", label: "Timetable", icon: "clock" as const, match: (p: string) => p.startsWith("/learn/timetable") }] : []),
    ...(show.homework !== null
      ? [{ href: "/learn/assignments", label: "Homework", icon: "clipboard" as const, match: (p: string) => p.startsWith("/learn/assignments"), count: show.homework || undefined }]
      : []),
    ...(show.exams !== null
      ? [{ href: "/learn/exams", label: "Exams", icon: "monitor" as const, match: (p: string) => p.startsWith("/learn/exams"), count: show.exams || undefined }]
      : []),
    ...(show.materials ? [{ href: "/learn/materials", label: "Materials", icon: "layers" as const, match: (p: string) => p.startsWith("/learn/materials") }] : []),
    ...(show.results ? [{ href: "/learn/results", label: "Results", icon: "results" as const, match: (p: string) => p.startsWith("/learn/results") }] : []),
    { href: "/learn/account", label: "Account", icon: "user", match: (p) => p.startsWith("/learn/account"), sidebar: false },
  ];
  return (
    <PortalShell home="/learn" tag="Students" user={{ ...user, href: "/learn/account" }} tabs={tabs}>
      {children}
    </PortalShell>
  );
}
