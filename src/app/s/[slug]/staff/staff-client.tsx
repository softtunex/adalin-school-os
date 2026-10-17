"use client";

import { useActionState, useState } from "react";
import { CopyField } from "@/components/copy-field";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu, type MenuItem } from "@/components/ui/data";
import { Alert } from "@/components/ui/display";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { inviteAction, revokeInviteAction, setStatusAction, updateRolesAction } from "./actions";

export type RoleOption = { id: string; name: string; description: string };

function RolePicker({ roles, selected, error }: { roles: RoleOption[]; selected?: string[]; error?: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 fs-14 font-medium text-ink">Roles</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <Checkbox key={r.id} name="roleIds" value={r.id} defaultChecked={selected?.includes(r.id)} label={r.name} description={r.description} />
        ))}
      </div>
      {error ? <p className="fs-13.5 font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}

function InviteForm({ slug, roles, onDone }: { slug: string; roles: RoleOption[]; onDone: () => void }) {
  const [state, action] = useActionState(inviteAction.bind(null, slug), initialFormState);
  const fe = state.fieldErrors ?? {};

  if (state.success && state.data?.link) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title={state.success}>
          You can also send this link directly, for example on WhatsApp. It works once and expires in 7 days.
        </Alert>
        <CopyField value={state.data.link} label="Invitation link" />
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="invite-name" error={fe.name}>
          <Input id="invite-name" name="name" defaultValue={state.values?.name} aria-invalid={!!fe.name} required />
        </Field>
        <Field label="Email" htmlFor="invite-email" error={fe.email}>
          <Input id="invite-email" name="email" type="email" defaultValue={state.values?.email} aria-invalid={!!fe.email} required />
        </Field>
      </div>
      <Field label="Job title (optional)" htmlFor="invite-title" hint="e.g. Mathematics teacher, Vice principal">
        <Input id="invite-title" name="jobTitle" defaultValue={state.values?.jobTitle} />
      </Field>
      <RolePicker roles={roles} error={fe.roleIds} />
      <SubmitButton pendingText="Sending invitation…">Send invitation</SubmitButton>
    </form>
  );
}

export function InviteButton({ slug, roles, disabledReason }: { slug: string; roles: RoleOption[]; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!!disabledReason} title={disabledReason}>
        <Icon name="plus" size={18} strokeWidth={2.4} />
        Invite staff
      </Button>
      <Modal open={open} onClose={close} title="Invite a staff member">
        <InviteForm key={key} slug={slug} roles={roles} onDone={close} />
      </Modal>
    </>
  );
}

function EditRolesForm({ slug, membershipId, roles, selected }: { slug: string; membershipId: string; roles: RoleOption[]; selected: string[] }) {
  const [state, action] = useActionState(updateRolesAction.bind(null, slug, membershipId), initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <RolePicker roles={roles} selected={selected} />
      <SubmitButton>Save roles</SubmitButton>
    </form>
  );
}

export function MemberActions({
  slug,
  member,
  roles,
  canAssign,
  canDeactivate,
  canExport = false,
}: {
  slug: string;
  member: { membershipId: string; name: string; status: "active" | "deactivated"; roleIds: string[] };
  roles: RoleOption[];
  canAssign: boolean;
  canDeactivate: boolean;
  canExport?: boolean;
}) {
  const [dialog, setDialog] = useState<"roles" | "deactivate" | "reactivate" | null>(null);
  const items: MenuItem[] = [];
  if (canAssign && member.status === "active") items.push({ label: "Edit roles", icon: "shield", onSelect: () => setDialog("roles") });
  if (canDeactivate && member.status === "active") items.push({ label: "Deactivate", icon: "userX", danger: true, onSelect: () => setDialog("deactivate") });
  if (canDeactivate && member.status === "deactivated") items.push({ label: "Reactivate", icon: "userCheck", onSelect: () => setDialog("reactivate") });
  if (canExport) items.push({ label: "Download their data", icon: "download", onSelect: () => window.location.assign(new URL(`/s/${slug}/data-export?staff=${member.membershipId}`, window.location.origin).href) });

  return (
    <>
      <RowMenu items={items} label={`Actions for ${member.name}`} />
      <Modal open={dialog === "roles"} onClose={() => setDialog(null)} title={`Roles for ${member.name}`}>
        <EditRolesForm slug={slug} membershipId={member.membershipId} roles={roles} selected={member.roleIds} />
      </Modal>
      <ConfirmDialog
        open={dialog === "deactivate"}
        onClose={() => setDialog(null)}
        title={`Deactivate ${member.name}?`}
        confirmLabel="Deactivate"
        danger
        onConfirm={() => setStatusAction(slug, member.membershipId, "deactivated")}
      >
        They&apos;ll lose access to this school straight away. Their records and history stay, and you can reactivate them later.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "reactivate"}
        onClose={() => setDialog(null)}
        title={`Reactivate ${member.name}?`}
        confirmLabel="Reactivate"
        onConfirm={() => setStatusAction(slug, member.membershipId, "active")}
      >
        They&apos;ll be able to sign in again with their existing roles.
      </ConfirmDialog>
    </>
  );
}

export function PendingInviteActions({ slug, invitationId }: { slug: string; invitationId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowMenu items={[{ label: "Cancel invitation", icon: "x", danger: true, onSelect: () => setOpen(true) }]} />
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this invitation?"
        confirmLabel="Cancel invitation"
        danger
        onConfirm={async () => {
          await revokeInviteAction(slug, invitationId);
        }}
      >
        The link stops working immediately. You can always invite them again.
      </ConfirmDialog>
    </>
  );
}
