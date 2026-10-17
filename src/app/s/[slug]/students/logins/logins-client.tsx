"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, Table, Td, Th } from "@/components/ui/display";
import { PrintSheet } from "@/components/print-sheet";
import { Icon } from "@/components/ui/icons";
import { issueLoginsAction } from "./actions";

type Row = { id: string; firstName: string; lastName: string; admissionNo: string; className: string | null; hasLogin: boolean; signedIn: boolean };
type Slip = { studentId: string; name: string; admissionNo: string; className: string | null; password: string };

export function StudentLogins({ slug, schoolName, signInUrl, rows, canIssue }: { slug: string; schoolName: string; signInUrl: string; rows: Row[]; canIssue: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const without = rows.filter((r) => !r.hasLogin);
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function issue(ids: string[], reset: boolean) {
    setError(null);
    start(async () => {
      const r = await issueLoginsAction(slug, ids, reset);
      if (r.error) setError(r.error);
      else {
        setSlips(r.slips ?? []);
        setSelected(new Set());
      }
    });
  }

  if (slips) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title={`${slips.length} login${slips.length === 1 ? "" : "s"} ready`}>
          Print these slips now and hand them out. The temporary passwords are shown only once; students choose their own when they first sign in.
        </Alert>
        <div className="flex flex-wrap gap-2.5 print:hidden">
          <Button onClick={() => window.print()}>
            <Icon name="download" size={18} /> Print slips
          </Button>
          <Button variant="secondary" onClick={() => location.reload()}>
            Done
          </Button>
        </div>
        <PrintSheet>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-2">
          {slips.map((s) => (
            <div key={s.studentId} className="break-inside-avoid rounded-chunk border-2 border-dashed border-line-strong bg-canvas p-4 fs-13.5">
              <p className="fs-12 font-semibold uppercase tracking-[0.06em] text-muted">{schoolName} · student login</p>
              <p className="mt-1 fs-16 font-bold text-ink">{s.name}</p>
              <p className="text-muted">{s.className ?? ""}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted">Go to</dt>
                <dd className="break-all font-mono">{signInUrl}</dd>
                <dt className="text-muted">School code</dt>
                <dd className="font-mono font-semibold">{slug}</dd>
                <dt className="text-muted">Admission no</dt>
                <dd className="font-mono font-semibold">{s.admissionNo}</dd>
                <dt className="text-muted">Password</dt>
                <dd className="font-mono fs-16 font-bold tracking-[0.06em]">{s.password}</dd>
              </dl>
            </div>
          ))}
        </div>
        </PrintSheet>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h2 className="fs-16 font-semibold">
          {rows.length - without.length} of {rows.length} students have a login
        </h2>
        {canIssue ? (
          <div className="flex flex-wrap gap-2">
            {selected.size ? (
              <>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => issue([...selected], true)}>
                  <Icon name="refresh" size={16} /> Reset {selected.size} password{selected.size === 1 ? "" : "s"}
                </Button>
                <Button size="sm" disabled={pending} onClick={() => issue([...selected].filter((id) => without.some((w) => w.id === id)), false)}>
                  Issue for selected
                </Button>
              </>
            ) : (
              <Button size="sm" disabled={pending || !without.length} onClick={() => issue(without.map((w) => w.id), false)}>
                <Icon name="key" size={16} /> {pending ? "Issuing…" : `Issue logins for ${without.length} without one`}
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {error ? <Alert tone="danger" className="mx-5 mb-3">{error}</Alert> : null}
      <Table>
        <thead>
          <tr>
            {canIssue ? (
              <Th className="w-10">
                <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-4 accent-[var(--brand)]" />
              </Th>
            ) : null}
            <Th>Student</Th>
            <Th>Class</Th>
            <Th>Admission no</Th>
            <Th>Login</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-paper">
              {canIssue ? (
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.firstName} ${r.lastName}`}
                    checked={selected.has(r.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    className="size-4 accent-[var(--brand)]"
                  />
                </Td>
              ) : null}
              <Td className="font-medium">
                {r.firstName} {r.lastName}
              </Td>
              <Td className="text-body">{r.className ?? "No class"}</Td>
              <Td className="font-mono fs-13.5">{r.admissionNo}</Td>
              <Td>{r.signedIn ? <Badge tone="success">Signed in</Badge> : r.hasLogin ? <Badge tone="blue">Slip issued</Badge> : <Badge>None</Badge>}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
