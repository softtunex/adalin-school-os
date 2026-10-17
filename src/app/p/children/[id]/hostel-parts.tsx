"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { ExeatForm } from "@/app/s/[slug]/hostel/hostel-client";
import { cancelExeatAction, requestExeatAction } from "../../actions";

export function RequestExeatButton({ studentId, name, minDate }: { studentId: string; name: string; minDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="send" size={17} /> Ask for an exeat
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
          router.refresh();
        }}
        title={`Exeat for ${name}`}
      >
        <ExeatForm key={key} fixedStudentId={studentId} minDate={minDate} submitLabel="Send to the warden" onSubmit={(input) => requestExeatAction(input)} />
      </Modal>
    </>
  );
}

export function CancelExeatButton({ studentId, exeatId }: { studentId: string; exeatId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await cancelExeatAction(studentId, exeatId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Cancelling…" : "Cancel"}
      </Button>
      {error ? <span className="fs-12.5 text-danger">{error}</span> : null}
    </span>
  );
}
