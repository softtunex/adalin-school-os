"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, Badge, Table, Td, Th } from "@/components/ui/display";
import { formatNaira } from "@/lib/money";
import { SendRemindersButton } from "../fees-client";

export type DebtorRow = {
  invoiceId: string;
  number: string;
  name: string;
  admissionNo: string;
  className: string | null;
  owed: number;
  paid: number;
  overdue: boolean;
  dueLabel: string | null;
  contact: { name: string; phone: string | null; email: string | null } | null;
  remindedLabel: string | null;
};

function phone(p: string | null) {
  return p?.startsWith("+234") && p.length === 14 ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p;
}

export function DebtorsTable({ slug, rows, canRemind }: { slug: string; rows: DebtorRow[]; canRemind: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const remindable = rows.filter((r) => r.contact?.email);
  const allOn = remindable.length > 0 && remindable.every((r) => selected.has(r.invoiceId));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      {canRemind && selected.size > 0 ? (
        <div className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-chunk border border-brand/30 bg-brand-wash px-4 py-2.5">
          <span className="fs-14.5 font-medium text-ink">{selected.size} selected</span>
          <SendRemindersButton slug={slug} invoiceIds={[...selected]} label="Email reminders" size="sm" variant="primary" />
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto fs-14 font-medium text-muted hover:text-ink">
            Clear
          </button>
        </div>
      ) : null}
      <ul className="flex flex-col divide-y divide-line border-t border-line md:hidden">
        {rows.map((r) => (
          <li key={r.invoiceId}>
            <Link href={`/s/${slug}/fees/invoices/${r.invoiceId}`} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={r.name} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{r.name}</span>
                <span className="block truncate fs-13 text-muted">{r.contact ? `${r.contact.name} · ${phone(r.contact.phone) ?? r.contact.email ?? "no contact"}` : "No parent contact"}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="tabular fs-14.5 font-semibold text-ink">{formatNaira(r.owed)}</span>
                {r.overdue ? <Badge tone="danger">Overdue</Badge> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              {canRemind ? (
                <Th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select everyone with an email"
                    checked={allOn}
                    disabled={!remindable.length}
                    onChange={() => setSelected(allOn ? new Set() : new Set(remindable.map((r) => r.invoiceId)))}
                    className="size-4 accent-[var(--brand)]"
                  />
                </Th>
              ) : null}
              <Th>Student</Th>
              <Th>Parent</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">Owing</Th>
              <Th>Reminded</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.invoiceId} className="group hover:bg-paper">
                {canRemind ? (
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.name}`}
                      checked={selected.has(r.invoiceId)}
                      disabled={!r.contact?.email}
                      title={r.contact?.email ? undefined : "No parent email on file"}
                      onChange={() => toggle(r.invoiceId)}
                      className="size-4 accent-[var(--brand)]"
                    />
                  </Td>
                ) : null}
                <Td>
                  <Link href={`/s/${slug}/fees/invoices/${r.invoiceId}`} className="flex items-center gap-3">
                    <Avatar name={r.name} size={34} />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink group-hover:text-blue">{r.name}</span>
                      <span className="block fs-13 text-muted">
                        {r.className ?? "No class"} · {r.number}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td>
                  {r.contact ? (
                    <>
                      <p className="text-ink">{r.contact.name}</p>
                      <p className="tabular fs-13 text-muted">{phone(r.contact.phone) ?? r.contact.email ?? "No phone or email"}</p>
                    </>
                  ) : (
                    <Badge tone="warning">No contact</Badge>
                  )}
                </Td>
                <Td className="tabular text-right text-body">{formatNaira(r.paid)}</Td>
                <Td className="text-right">
                  <span className="tabular block font-semibold">{formatNaira(r.owed)}</span>
                  {r.overdue ? <span className="block fs-12.5 font-medium text-danger">Overdue{r.dueLabel ? ` since ${r.dueLabel}` : ""}</span> : r.dueLabel ? <span className="block fs-12.5 text-muted">Due {r.dueLabel}</span> : null}
                </Td>
                <Td className="fs-13.5 text-muted">{r.remindedLabel ?? "Never"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
