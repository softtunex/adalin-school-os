"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { formatNaira } from "@/lib/money";
import { buyAddonAction, cancelAddonAction, payBillAction } from "./billing-actions";

/** Buy (or finish paying for) an add-on. Confirms the price first, then goes to payment. */
export function AddonBuy({
  slug,
  addonKey,
  name,
  price,
  billing,
  unit,
  pendingBillId,
}: {
  slug: string;
  addonKey: string;
  name: string;
  price: number;
  billing: "term" | "once";
  unit: { size: number; label: string } | null;
  pendingBillId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(unit?.size ?? 1);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (fn: () => Promise<{ error?: string; url?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error || !r.url) return setError(r.error ?? "Payment didn't start.");
      window.location.href = r.url;
    });
  if (pendingBillId) {
    return (
      <div className="flex flex-col gap-1">
        <Button size="sm" disabled={pending} onClick={() => go(() => payBillAction(slug, pendingBillId))}>
          {pending ? "Opening…" : "Pay to switch it on"}
        </Button>
        {error ? <span className="fs-12.5 text-danger">{error}</span> : null}
      </div>
    );
  }
  const total = unit ? price * (quantity / unit.size) : price;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {billing === "term" ? "Add it" : "Order"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={name}>
        <div className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {unit ? (
            <Field label={`How many ${unit.label}`} htmlFor="ad-qty">
              <Select id="ad-qty" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="sm:w-48">
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n * unit.size}>
                    {n * unit.size} {unit.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <p className="fs-15 text-body">
            {billing === "term"
              ? `It switches on as soon as it's paid. This term you pay only for the weeks left; after that it's ${formatNaira(price)} a term on your bill, until you stop it.`
              : `${formatNaira(total)}, paid once. We'll contact you within two working days to arrange it.`}
          </p>
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => go(() => buyAddonAction(slug, addonKey, quantity))}>
              {pending ? "Opening payment…" : "Continue to payment"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function AddonStop({ slug, addonId, name }: { slug: string; addonId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Stop
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Stop ${name}?`}
        confirmLabel="Stop it"
        danger
        onConfirm={async () => {
          const r = await cancelAddonAction(slug, addonId);
          if (!r.error) router.refresh();
          return r;
        }}
      >
        It keeps working until the end of this term and won&apos;t be on next term&apos;s bill.
      </ConfirmDialog>
    </>
  );
}
