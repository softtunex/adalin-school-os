"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Shows its children in place on screen, and prints a copy placed directly under <body>.
 * Printing from inside the app's scrolling layout clips the content and prints a blank page.
 */
export function PrintSheet({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return (
    <>
      <div className="print:hidden">{children}</div>
      {mounted
        ? createPortal(
            <div className="print-sheet hidden print:block">{children}</div>,
            document.body,
          )
        : null}
    </>
  );
}
