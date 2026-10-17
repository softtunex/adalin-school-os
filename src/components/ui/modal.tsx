"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";

export function Modal({ open, onClose, title, children, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; size?: "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      // text-left: a dialog opened from a right-aligned table cell would otherwise inherit it.
      className={`m-auto ${size === "lg" ? "w-[min(780px,calc(100vw-32px))]" : "w-[min(580px,calc(100vw-32px))]"} rounded-[20px] border border-line bg-canvas p-0 text-left font-normal text-body shadow-[0_24px_64px_rgba(0,0,0,0.18)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px]`}
    >
      <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
        <h2 className="fs-18 font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink">
          <Icon name="x" />
        </button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto px-6 pb-6 pt-3">{children}</div>
    </dialog>
  );
}
