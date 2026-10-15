"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { PERMISSION_GROUPS } from "@/lib/rbac/permissions";
import { deleteRoleAction, saveRoleAction } from "./actions";

type RoleInput = { id: string; name: string; description: string; permissions: string[] };

function RoleForm({ slug, grantable, role }: { slug: string; grantable: string[]; role?: RoleInput }) {
  const [state, action] = useActionState(saveRoleAction.bind(null, slug, role?.id ?? null), initialFormState);
  const fe = state.fieldErrors ?? {};
  const held = new Set(grantable);
  const selected = new Set(role?.permissions ?? []);

  if (state.success) return <Alert tone="success">{state.success}</Alert>;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Role name" htmlFor="role-name" error={fe.name}>
        <Input id="role-name" name="name" defaultValue={state.values?.name ?? role?.name} placeholder="e.g. Exams officer" aria-invalid={!!fe.name} required />
      </Field>
      <Field label="What this role is for (optional)" htmlFor="role-desc">
        <Textarea id="role-desc" name="description" defaultValue={state.values?.description ?? role?.description} rows={2} />
      </Field>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[14px] font-bold text-ink">Permissions</legend>
        {fe.permissions ? <p className="text-[13.5px] font-semibold text-danger">{fe.permissions}</p> : null}
        {Object.entries(PERMISSION_GROUPS).map(([group, def]) => (
          <div key={group} className="rounded-chunk border-2 border-line p-3">
            <p className="label-caps text-muted">{def.label}</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {Object.entries(def.actions).map(([act, label]) => {
                const key = `${group}:${act}`;
                const allowed = held.has(key);
                return (
                  <label key={key} className={allowed ? "flex cursor-pointer items-center gap-2.5 text-[14px] text-ink" : "flex items-center gap-2.5 text-[14px] text-muted"} title={allowed ? undefined : "You can't grant a permission you don't have"}>
                    <input type="checkbox" name="permissions" value={key} defaultChecked={selected.has(key)} disabled={!allowed} className="size-[18px] accent-[var(--brand)]" />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
      <SubmitButton>{role ? "Save role" : "Create role"}</SubmitButton>
    </form>
  );
}

export function RoleEditorButton({ slug, grantable, role }: { slug: string; grantable: string[]; role?: RoleInput }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const close = () => {
    setOpen(false);
    setKey((k) => k + 1);
  };
  return (
    <>
      {role ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Icon name="plus" size={18} strokeWidth={2.6} />
          New role
        </Button>
      )}
      <Modal open={open} onClose={close} title={role ? `Edit ${role.name}` : "New custom role"}>
        <RoleForm key={key} slug={slug} grantable={grantable} role={role} />
      </Modal>
    </>
  );
}

export function DeleteRoleButton({ slug, roleId }: { slug: string; roleId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      {confirming ? (
        <div className="flex gap-2">
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteRoleAction(slug, roleId);
                setError(r.error);
                setConfirming(false);
              })
            }
          >
            Delete role
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          <Icon name="trash" size={16} /> Delete
        </Button>
      )}
      {error ? <p className="text-[13px] font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
