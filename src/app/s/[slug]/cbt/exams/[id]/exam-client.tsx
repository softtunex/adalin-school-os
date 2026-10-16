"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { deleteExamAction, examStatusAction, examToCAAction, extendExamAction, reopenAttemptAction } from "../../actions";

export function ExamActions({
  slug,
  id,
  status,
  started,
  closesAt,
  column,
  canSendToCA,
}: {
  slug: string;
  id: string;
  status: string;
  started: boolean;
  closesAt: string;
  column: string | null;
  canSendToCA: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<null | "delete" | "close" | "extend" | "ca">(null);
  const [until, setUntil] = useState(closesAt);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    start(async () => {
      const r = await fn();
      setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Done." });
      if (!r.error) {
        setMode(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      {!started ? (
        <ButtonLink href={`/s/${slug}/cbt/exams/${id}/edit`} variant="secondary" size="sm">
          <Icon name="edit" size={16} /> Edit
        </ButtonLink>
      ) : null}
      {status === "draft" ? (
        <Button size="sm" disabled={pending} onClick={() => run(() => examStatusAction(slug, id, "published"))}>
          <Icon name="send" size={16} /> Publish
        </Button>
      ) : null}
      {status !== "draft" ? (
        <Button variant="secondary" size="sm" onClick={() => setMode("extend")}>
          <Icon name="clock" size={16} /> Change closing time
        </Button>
      ) : null}
      {status === "published" ? (
        <Button variant="secondary" size="sm" onClick={() => setMode("close")}>
          <Icon name="lock" size={16} /> Close now
        </Button>
      ) : null}
      {canSendToCA ? (
        <Button size="sm" onClick={() => setMode("ca")}>
          <Icon name="send" size={16} /> Send scores to {column}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => setMode("delete")} aria-label="Delete exam">
        <Icon name="trash" size={16} />
      </Button>
      {msg ? (
        <div className="basis-full">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}

      <Modal open={mode === "extend"} onClose={() => setMode(null)} title="Change closing time">
        <div className="flex flex-col gap-4">
          <p className="fs-14.5 text-body">Useful after a power cut or when the lab ran late. Students already writing keep their own time limit.</p>
          <Field label="Closes" htmlFor="ext-close">
            <Input id="ext-close" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button disabled={pending} onClick={() => run(() => extendExamAction(slug, id, until))}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={mode === "close"}
        onClose={() => setMode(null)}
        title="Close the exam now?"
        confirmLabel="Close exam"
        onConfirm={async () => {
          const r = await examStatusAction(slug, id, "closed");
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        Anyone still writing is submitted with the answers they&apos;ve saved, and no one else can start.
      </ConfirmDialog>
      <ConfirmDialog
        open={mode === "ca"}
        onClose={() => setMode(null)}
        title={`Send scores to ${column}?`}
        confirmLabel="Send scores"
        onConfirm={async () => {
          const r = await examToCAAction(slug, id);
          if (!r.error) {
            setMode(null);
            setMsg({ tone: "success", text: r.success ?? "Sent." });
            router.refresh();
          }
          return r;
        }}
      >
        Each student&apos;s percentage is scaled to the {column} maximum and written to the score sheet, replacing what&apos;s there for them. Students who didn&apos;t sit the exam are left alone.
      </ConfirmDialog>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title="Delete this exam?"
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          const r = await deleteExamAction(slug, id);
          if (!r.error) router.push(`/s/${slug}/cbt`);
          return r;
        }}
      >
        {started ? "Every student's script and score for it is deleted too. Scores already sent to the score sheet stay there." : "The questions stay in your bank."}
      </ConfirmDialog>
    </>
  );
}

export function ReopenAttempt({ slug, attemptId, name }: { slug: string; attemptId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("10");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Icon name="refresh" size={15} /> More time
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`More time for ${name}`}>
        <div className="flex flex-col gap-4">
          <p className="fs-14.5 text-body">For a student who was cut off by a power cut or a bad connection. They carry on from where they stopped, with their saved answers.</p>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Extra minutes" htmlFor="ro-min">
            <Select id="ro-min" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await reopenAttemptAction(slug, attemptId, Number(minutes));
                  if (r.error) return setError(r.error);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              Reopen
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
