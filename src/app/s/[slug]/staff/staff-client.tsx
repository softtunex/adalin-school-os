"use client";

import { useActionState, useState, useTransition } from "react";
import { CopyField } from "@/components/copy-field";
import { Button, SubmitButton } from "@/components/ui/button";
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
      <legend className="mb-1.5 text-[14px] font-bold text-ink">Roles</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <Checkbox key={r.id} name="roleIds" value={r.id} defaultChecked={selected?.includes(r.id)} label={r.name} description={r.description} />
        ))}
      </div>
      {error ? <p className="text-[13.5px] font-semibold text-danger">{error}</p> : null}
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
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!!disabledReason} title={disabledReason}>
        <Icon name="plus" size={18} strokeWidth={2.6} />
        Invite staff
      </Button>
      {disabledReason ? <p className="w-full text-right text-[13px] text-muted sm:w-auto">{disabledReason}</p> : null}
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title="Invite a staff member"
      >
        <InviteForm
          key={key}
          slug={slug}
          roles={roles}
          onDone={() => {
            setOpen(false);
            setKey((k) => k + 1);
          }}
        />
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
}: {
  slug: string;
  member: { membershipId: string; name: string; status: "active" | "deactivated"; roleIds: string[] };
  roles: RoleOption[];
  canAssign: boolean;
  canDeactivate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function changeStatus(status: "active" | "deactivated") {
    startTransition(async () => {
      const result = await setStatusAction(slug, member.membershipId, status);
      setError(result.error);
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-2">
        {canAssign && member.status === "active" ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            Edit roles
          </Button>
        ) : null}
        {canDeactivate ? (
          member.status === "active" ? (
            confirming ? (
              <>
                <Button variant="danger" size="sm" disabled={pending} onClick={() => changeStatus("deactivated")}>
                  Confirm
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                Deactivate
              </Button>
            )
          ) : (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => changeStatus("active")}>
              Reactivate
            </Button>
          )
        ) : null}
      </div>
      {error ? <p className="max-w-[260px] text-right text-[13px] font-semibold text-danger">{error}</p> : null}
      <Modal open={open} onClose={() => setOpen(false)} title={`Roles for ${member.name}`}>
        <EditRolesForm slug={slug} membershipId={member.membershipId} roles={roles} selected={member.roleIds} />
      </Modal>
    </div>
  );
}

export function RevokeInviteButton({ slug, invitationId }: { slug: string; invitationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(() => revokeInviteAction(slug, invitationId))}>
      Cancel invite
    </Button>
  );
}
