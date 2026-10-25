"use client";

import { startTransition, useActionState, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, initials } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { initialFormState } from "@/lib/form-state";
import { removeLogoAction, uploadLogoAction } from "./actions";

export function LogoCard({ slug, name, logoUrl }: { slug: string; name: string; logoUrl: string | null }) {
  const [state, upload, uploading] = useActionState(uploadLogoAction.bind(null, slug), initialFormState);
  const [removing, startRemove] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  return (
    <Card className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`${name} logo`} className="size-20 rounded-full border border-line object-cover" />
      ) : (
        <span className="grid size-20 place-items-center rounded-full bg-brand fs-26 font-bold text-white shadow-[0_3px_0_var(--brand-deep)]">{initials(name)}</span>
      )}
      <div className="min-w-0 flex-1 basis-[12rem]">
        <p className="font-semibold text-ink">School logo</p>
        <p className="fs-13.5 text-muted">Square PNG, JPG or WebP, up to 1 MB. Shown in the app, on report cards and receipts.</p>
        {state.error ? <Alert tone="danger" className="mt-3">{state.error}</Alert> : null}
      </div>
      <div className="flex w-full gap-2 sm:w-auto max-sm:[&>*]:flex-1">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Choose logo image"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.set("logo", file);
            startTransition(() => upload(fd));
            e.target.value = "";
          }}
        />
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={uploading}>
          <Icon name="upload" size={17} />
          {uploading ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
        </Button>
        {logoUrl ? (
          <Button variant="ghost" disabled={removing} onClick={() => startRemove(async () => void (await removeLogoAction(slug)))}>
            Remove
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
