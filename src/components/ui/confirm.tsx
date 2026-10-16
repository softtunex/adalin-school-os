"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "./button";
import { Alert } from "./display";
import { Modal } from "./modal";

/** A confirmation dialog for destructive or important actions. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<{ error?: string } | void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-5">
        <div className="fs-15 text-body">{children}</div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await onConfirm();
                if (result?.error) setError(result.error);
                else {
                  setError(undefined);
                  onClose();
                }
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
