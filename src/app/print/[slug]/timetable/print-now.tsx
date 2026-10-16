"use client";

import { useEffect } from "react";

/** Opens the print dialog once the timetable has rendered. */
export function PrintNow() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 400);
    return () => clearTimeout(id);
  }, []);
  return (
    <button type="button" onClick={() => window.print()} className="rounded-chunk border border-line-strong px-3 py-1.5 fs-14 font-semibold print:hidden">
      Print
    </button>
  );
}
