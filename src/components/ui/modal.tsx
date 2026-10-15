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
      className="m-auto w-[min(580px,calc(100vw-32px))] rounded-[20px] border border-line bg-canvas p-0 text-body shadow-[0_24px_64px_rgba(0,0,0,0.18)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
        <h2 className="text-[18px] font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink">
          <Icon name="x" />
        </button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto px-6 pb-6 pt-3">{children}</div>
    </dialog>
  );
}
