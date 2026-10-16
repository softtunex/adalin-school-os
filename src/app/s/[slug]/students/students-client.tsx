"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu, type MenuItem } from "@/components/ui/data";
import { setStudentStatusAction } from "./actions";

type Status = "active" | "graduated" | "withdrawn" | "suspended";

const COPY: Record<Exclude<Status, "active">, { label: string; title: (n: string) => string; body: string }> = {
  withdrawn: {
    label: "Withdraw",
    title: (n) => `Withdraw ${n}?`,
    body: "They leave the active register and stop counting towards your plan. Their records, results and fee history are kept, and you can reactivate them any time.",
  },
  suspended: {
    label: "Suspend",
    title: (n) => `Suspend ${n}?`,
    body: "They stay on roll but are marked as suspended until you reactivate them.",
  },
  graduated: {
    label: "Mark as graduated",
    title: (n) => `Mark ${n} as graduated?`,
    body: "They leave the active register. Their records stay for transcripts and testimonials.",
  },
};

export function StudentStatusDialog({
  slug,
  student,
  status,
  open,
  onClose,
}: {
  slug: string;
  student: { id: string; name: string };
  status: Status | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!status) return null;
  const copy = status === "active" ? { label: "Reactivate", title: (n: string) => `Reactivate ${n}?`, body: "They return to the active register." } : COPY[status];
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={copy.title(student.name)}
      confirmLabel={copy.label}
      danger={status === "withdrawn" || status === "suspended"}
      onConfirm={() => setStudentStatusAction(slug, student.id, status)}
    >
      {copy.body}
    </ConfirmDialog>
  );
}

export function statusMenuItems(current: Status, pick: (s: Status) => void): MenuItem[] {
  if (current !== "active") return [{ label: "Reactivate", icon: "userCheck", onSelect: () => pick("active") }];
  return [
    { label: "Mark as graduated", icon: "graduation", onSelect: () => pick("graduated") },
    { label: "Suspend", icon: "alert", onSelect: () => pick("suspended") },
    { label: "Withdraw", icon: "userX", danger: true, onSelect: () => pick("withdrawn") },
  ];
}

export function StudentRowActions({
  slug,
  student,
  canUpdate,
  canChangeStatus,
}: {
  slug: string;
  student: { id: string; name: string; status: Status };
  canUpdate: boolean;
  canChangeStatus: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Status | null>(null);
  const base = `/s/${slug}/students/${student.id}`;
  const items: MenuItem[] = [{ label: "View profile", icon: "user", onSelect: () => router.push(base) }];
  if (canUpdate) items.push({ label: "Edit details", icon: "edit", onSelect: () => router.push(`${base}/edit`) });
  if (canChangeStatus) items.push(...statusMenuItems(student.status, setPending));
  return (
    <>
      <RowMenu items={items} label={`Actions for ${student.name}`} />
      <StudentStatusDialog slug={slug} student={student} status={pending} open={pending !== null} onClose={() => setPending(null)} />
    </>
  );
}
