"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import type { ApplicantStatus } from "@/lib/db/schema";
import { enrollAction, updateApplicantAction } from "../actions";

const MOVE_LABEL: Partial<Record<ApplicantStatus, { label: string; variant: "primary" | "secondary" | "success" | "danger" }>> = {
  exam: { label: "Invite to entrance exam", variant: "secondary" },
  interview: { label: "Invite to interview", variant: "secondary" },
  offered: { label: "Offer admission", variant: "success" },
  accepted: { label: "Mark offer accepted", variant: "secondary" },
  rejected: { label: "Not successful", variant: "danger" },
  withdrawn: { label: "Withdrawn", variant: "secondary" },
  applied: { label: "Reopen application", variant: "secondary" },
};

type Msg = { tone: "success" | "danger"; text: string } | null;

export function ApplicantActions({
  slug,
  id,
  status,
  next,
  examScore,
  interviewNotes,
  feeKobo,
  feePaid,
  classOptions,
  canManage,
  canEnroll,
  studentHref,
}: {
  slug: string;
  id: string;
  status: ApplicantStatus;
  next: ApplicantStatus[];
  examScore: number | null;
  interviewNotes: string | null;
  feeKobo: number;
  feePaid: boolean;
  classOptions: { id: string; name: string }[];
  canManage: boolean;
  canEnroll: boolean;
  studentHref: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [notify, setNotify] = useState(true);
  const [score, setScore] = useState(examScore === null ? "" : String(examScore));
  const [notes, setNotes] = useState(interviewNotes ?? "");
  const [classId, setClassId] = useState(classOptions[0]?.id ?? "");

  function run(input: Record<string, unknown>) {
    setMsg(null);
    start(async () => {
      const r = await updateApplicantAction(slug, { id, notify, ...input });
      setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Saved." });
      if (!r.error) router.refresh();
    });
  }

  if (status === "enrolled") {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="fs-16 font-semibold">Enrolled</h2>
        <p className="fs-14.5 text-body">This child is now a student.</p>
        {studentHref ? (
          <Link href={studentHref} className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-brand-ink hover:underline">
            Open the student record <Icon name="arrowRight" size={15} />
          </Link>
        ) : null}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {canManage ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-16 font-semibold">Next step</h2>
          <div className="flex flex-col gap-2">
            {next
              .filter((s) => MOVE_LABEL[s])
              .map((s) => (
                <Button key={s} variant={MOVE_LABEL[s]!.variant} disabled={pending} onClick={() => run({ status: s })} className="justify-start">
                  {MOVE_LABEL[s]!.label}
                </Button>
              ))}
          </div>
          <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Tell the parent" description="By email, and SMS if you have credits." />
          {feeKobo > 0 && !feePaid ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run({ feePaid: true })} className="self-start">
              <Icon name="banknote" size={16} /> Mark form fee paid (at the school)
            </Button>
          ) : null}
        </Card>
      ) : null}

      {canManage ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-16 font-semibold">Assessment</h2>
          <Field label="Entrance exam score" htmlFor="ap-score">
            <Input id="ap-score" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="e.g. 72" className="w-32" />
          </Field>
          <Field label="Interview notes" htmlFor="ap-notes">
            <Textarea id="ap-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={pending}
            onClick={() => {
              const n = score.trim() === "" ? null : Number(score);
              if (n !== null && !Number.isFinite(n)) return setMsg({ tone: "danger", text: "The score must be a number." });
              run({ examScore: n, interviewNotes: notes.trim() || null, notify: false });
            }}
          >
            Save assessment
          </Button>
        </Card>
      ) : null}

      {canEnroll && (status === "accepted" || status === "offered") ? (
        <Card className="flex flex-col gap-3 border-success/40 p-5">
          <h2 className="fs-16 font-semibold">Enrol as a student</h2>
          {classOptions.length ? (
            <>
              <Field label="Class" htmlFor="ap-class">
                <Select id="ap-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="success"
                disabled={pending || !classId}
                onClick={() =>
                  start(async () => {
                    const r = await enrollAction(slug, id, classId);
                    if (r.error) return setMsg({ tone: "danger", text: r.error });
                    router.push(`/s/${slug}/students/${r.data?.studentId}`);
                  })
                }
              >
                <Icon name="graduation" size={18} /> Enrol
              </Button>
              <p className="fs-13 text-muted">Creates the student record with an admission number, and adds the parent as their guardian.</p>
            </>
          ) : (
            <p className="fs-14 text-muted">There&apos;s no class in this level yet. Add one in Academics.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
