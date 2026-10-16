"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageLoader } from "./page-loader";

/**
 * Shows Kola over the content area while an in-app link loads. Done on the client rather
 * than with loading.tsx, because a loading boundary streams a 200 before the page's
 * access checks run, which would turn "not found" pages into 200s.
 */
export function RouteLoader() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const here = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const to = url.pathname + url.search;
      const from = location.pathname + location.search;
      if (to !== from && !/\.(csv|pdf|xlsx)$/.test(url.pathname) && !url.pathname.includes("/report-cards")) setPendingFrom(from);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Never leave the overlay up if a navigation fails or is abandoned.
  useEffect(() => {
    if (pendingFrom === null) return;
    const id = setTimeout(() => setPendingFrom(null), 20_000);
    return () => clearTimeout(id);
  }, [pendingFrom]);

  // The URL changed, so the new page has rendered.
  const loading = pendingFrom !== null && pendingFrom === here;
  if (!loading) return null;
  return (
    <div className="absolute inset-0 z-20 bg-canvas/85 backdrop-blur-[2px]">
      <div className="sticky top-[12vh]">
        <PageLoader />
      </div>
    </div>
  );
}
