"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { createSessionAction } from "@/app/s/[slug]/academics/actions";
import { Button, ButtonLink, SubmitButton } from "@/components/ui/button";
import { Alert, Badge, Card, IconChip, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { initialFormState } from "@/lib/form-state";
import { applyPromotionAction } from "./actions";

type Action = "promote" | "repeat" | "graduate" | "withdraw";
type Group = { classId: string; className: string; students: { id: string; name: string; admissionNo: string; action: Action; targetClassId: string | null }[] };
type Decision = { action: Action; targetClassId: string | null };

const LABEL: Record<Action, string> = { promote: "Promote", repeat: "Repeat class", graduate: "Graduate", withdraw: "Withdraw" };

export function CreateNextSession({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [state, action] = useActionState(createSessionAction.bind(null, slug), initialFormState);
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);
  return (
    <form action={action} className="flex flex-col items-center gap-3">
      <input type="hidden" name="name" value={name} />
      {state.error || state.fieldErrors?.name ? <Alert tone="danger">{state.error ?? state.fieldErrors?.name}</Alert> : null}
      <SubmitButton pendingText="Creating…">Create {name} session</SubmitButton>
    </form>
  );
}

export function PromotionBoard({
  slug,
  fromSession,
  toSession,
  groups,
  classes,
  alreadyMoved,
}: {
  slug: string;
  fromSession: string | null;
  toSession: { id: string; name: string };
  groups: Group[];
  classes: { id: string; name: string }[];
  alreadyMoved: number;
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.students.map((s) => [s.id, { action: s.action, targetClassId: s.targetClassId }]))),
  );
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ error?: string; counts?: Record<string, number> }>({});
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<Action, number> = { promote: 0, repeat: 0, graduate: 0, withdraw: 0 };
    for (const d of Object.values(decisions)) c[d.action]++;
    return c;
  }, [decisions]);
  const total = Object.keys(decisions).length;
  const missingClass = Object.values(decisions).filter((d) => d.action === "promote" && !d.targetClassId).length;

  function set(id: string, patch: Partial<Decision>) {
    setDecisions((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function setGroup(group: Group, action: Action) {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const s of group.students) {
        next[s.id] = {
          action,
          targetClassId: action === "promote" ? (s.action === "promote" ? s.targetClassId : prev[s.id].targetClassId) : action === "repeat" ? group.classId : null,
        };
      }
      return next;
    });
  }

  if (result.counts) {
    return (
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-success text-white shadow-[0_4px_0_var(--success-deep)]">
          <Icon name="check" size={32} strokeWidth={2.6} />
        </span>
        <h2 className="mt-5 font-display fs-30 font-black">Welcome to {toSession.name}</h2>
        <p className="mt-2 fs-15 text-muted">
          {result.counts.promote} promoted · {result.counts.repeat} repeating · {result.counts.graduate} graduated · {result.counts.withdraw} withdrawn
        </p>
        <ButtonLink href={`/s/${slug}/students`} className="mt-7">
          View students
        </ButtonLink>
      </Card>
    );
  }

  if (groups.length === 0) {
    return (
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <IconChip icon="checkCircle" tone="success" size={56} />
        <h2 className="mt-4 fs-18 font-semibold">Nobody left to move</h2>
        <p className="mt-1 max-w-[46ch] fs-14.5 text-muted">
          {alreadyMoved ? `${alreadyMoved} students are already in ${toSession.name}.` : "There are no active students in classes."}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      <Alert tone="blue" title={`Moving students from ${fromSession ?? "this session"} into ${toSession.name}`}>
        We&apos;ve suggested the next class up for everyone, keeping the same arm, and graduation from the final class. Change any student or a whole class before you apply.
        {alreadyMoved ? ` ${alreadyMoved} students already moved are not shown.` : ""}
      </Alert>

      {groups.map((g) => (
        <TableCard
          key={g.classId}
          title={
            <span className="flex items-center gap-2.5">
              {g.className}
              <Badge>{g.students.length} students</Badge>
            </span>
          }
          toolbar={
            <label className="flex items-center gap-2 fs-14 text-muted">
              Set all to
              <Select
                aria-label={`Set all in ${g.className}`}
                className="h-10 w-auto"
                value=""
                onChange={(e) => e.target.value && setGroup(g, e.target.value as Action)}
              >
                <option value="">Choose…</option>
                {(Object.keys(LABEL) as Action[]).map((a) => (
                  <option key={a} value={a}>
                    {LABEL[a]}
                  </option>
                ))}
              </Select>
            </label>
          }
        >
          <Table fixed>
            <thead>
              <tr>
                <Th className="w-[34%]">Student</Th>
                <Th className="w-[26%]">Next session</Th>
                <Th>Class</Th>
              </tr>
            </thead>
            <tbody>
              {g.students.map((s) => {
                const d = decisions[s.id];
                return (
                  <tr key={s.id} className="hover:bg-paper">
                    <Td>
                      <p className="font-medium">{s.name}</p>
                      <p className="font-mono fs-12.5 text-muted">{s.admissionNo}</p>
                    </Td>
                    <Td>
                      <Select
                        aria-label={`Next session for ${s.name}`}
                        value={d.action}
                        onChange={(e) => {
                          const action = e.target.value as Action;
                          set(s.id, { action, targetClassId: action === "promote" ? (s.targetClassId ?? d.targetClassId) : action === "repeat" ? g.classId : null });
                        }}
                      >
                        {(Object.keys(LABEL) as Action[]).map((a) => (
                          <option key={a} value={a}>
                            {LABEL[a]}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      {d.action === "promote" || d.action === "repeat" ? (
                        <Select aria-label={`Class for ${s.name}`} value={d.targetClassId ?? ""} onChange={(e) => set(s.id, { targetClassId: e.target.value || null })} aria-invalid={!d.targetClassId}>
                          <option value="">Choose a class…</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="fs-14 text-muted">{d.action === "graduate" ? "Leaves as a graduate" : "Leaves the school"}</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableCard>
      ))}

      <div data-action-bar className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] backdrop-blur lg:left-[288px] sm:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
          <p className="tabular fs-14 text-body">
            <span className="font-semibold text-ink">{total} students</span> · {counts.promote} promote · {counts.repeat} repeat · {counts.graduate} graduate · {counts.withdraw} withdraw
          </p>
          <Button onClick={() => setConfirm(true)} disabled={missingClass > 0}>
            {missingClass > 0 ? `${missingClass} need a class` : `Apply to ${total} students`}
          </Button>
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Move ${total} students into ${toSession.name}?`}>
        <div className="flex flex-col gap-5">
          <ul className="grid grid-cols-2 gap-3 fs-14">
            {(Object.keys(LABEL) as Action[]).map((a) => (
              <li key={a} className="rounded-chunk border border-line p-3">
                <p className="tabular fs-22 font-semibold text-ink">{counts[a]}</p>
                <p className="text-muted">{LABEL[a]}</p>
              </li>
            ))}
          </ul>
          <label className="flex cursor-pointer items-start gap-3 rounded-chunk border border-line-strong p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
            <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} className="mt-0.5 size-[18px] accent-[var(--brand)]" />
            <span>
              <span className="block font-medium text-ink">Make {toSession.name} the current session</span>
              <span className="block fs-13.5 text-muted">Its First Term becomes the current term straight away.</span>
            </span>
          </label>
          {result.error ? <Alert tone="danger">{result.error}</Alert> : null}
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const list = Object.entries(decisions).map(([studentId, d]) => ({ studentId, ...d }));
                  setResult(await applyPromotionAction(slug, toSession.id, list, makeCurrent));
                })
              }
            >
              {pending ? "Moving students…" : "Apply promotion"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
