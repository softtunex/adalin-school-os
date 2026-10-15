"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
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
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-card border-2 border-line bg-canvas p-0 text-body shadow-2xl backdrop:bg-black/45"
    >
      <div className="flex items-center justify-between gap-4 border-b-2 border-line px-5 py-4">
        <h2 className="text-[18px] font-extrabold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-[10px] text-muted hover:bg-sunken hover:text-ink">
          <Icon name="x" />
        </button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto px-5 py-5">{children}</div>
    </dialog>
  );
}
