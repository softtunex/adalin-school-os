"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FileLinks, type ExistingFile } from "@/components/file-uploader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert, Avatar } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { assignmentStatusAction, deleteAssignmentAction, saveGradesAction, sendToCAAction } from "../actions";

export type MarkRow = {
  id: string;
  name: string;
  admissionNo: string;
  submittedAt: string | null;
  submittedLabel: string | null;
  late: boolean;
  text: string;
  files: ExistingFile[];
  score: number | null;
  feedback: string;
};

type Filter = "all" | "in" | "missing" | "unmarked";

export function MarkingTable({ slug, assignmentId, maxScore, rows }: { slug: string; assignmentId: string; maxScore: number | null; rows: MarkRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          score: r.score === null ? "" : String(r.score),
          feedback: r.feedback,
        },
      ]),
    ),
  );
  const [msg, setMsg] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);

  const changed = useMemo(() => rows.filter((r) => draft[r.id].score !== (r.score === null ? "" : String(r.score)) || draft[r.id].feedback !== r.feedback), [rows, draft]);
  const shown = rows.filter((r) => (filter === "in" ? r.submittedAt : filter === "missing" ? !r.submittedAt : filter === "unmarked" ? r.submittedAt && r.score === null : true));
  const counts = {
    all: rows.length,
    in: rows.filter((r) => r.submittedAt).length,
    missing: rows.filter((r) => !r.submittedAt).length,
    unmarked: rows.filter((r) => r.submittedAt && r.score === null).length,
  };

  function save() {
    const grades: {
      studentId: string;
      score: number | null;
      feedback: string;
    }[] = [];
    for (const r of changed) {
      const raw = draft[r.id].score.trim();
      const score = raw === "" ? null : Number(raw);
      if (score !== null && (!Number.isFinite(score) || score < 0 || (maxScore !== null && score > maxScore))) {
        setMsg({
          tone: "danger",
          text: `${r.name}: marks must be between 0 and ${maxScore}.`,
        });
        return;
      }
      grades.push({ studentId: r.id, score, feedback: draft[r.id].feedback });
    }
    setMsg(null);
    start(async () => {
      const res = await saveGradesAction(slug, { assignmentId, grades });
      setMsg(res.error ? { tone: "danger", text: res.error } : { tone: "success", text: res.success ?? "Saved." });
      if (!res.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        {(
          [
            ["all", "Everyone"],
            ["in", "Handed in"],
            ["unmarked", "To mark"],
            ["missing", "Not handed in"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 fs-13.5 font-medium",
              filter === key ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong bg-canvas text-body hover:bg-paper",
            )}
          >
            {label} <span className="tabular text-muted">{counts[key]}</span>
          </button>
        ))}
      </div>
      {msg ? (
        <div className="px-4 pt-3 sm:px-5">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}
      <ul className="flex flex-col">
        {shown.length === 0 ? <li className="px-5 py-10 text-center fs-14.5 text-muted">No one here.</li> : null}
        {shown.map((r) => {
          const expanded = open === r.id;
          const hasWork = !!r.text || r.files.length > 0;
          return (
            <li key={r.id} className="border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={r.name} size={36} muted={!r.submittedAt} />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate font-medium text-ink">{r.name}</p>
                  <p className="fs-13 text-muted">
                    {r.submittedAt ? (
                      <>
                        Handed in {r.submittedLabel}
                        {r.late ? <span className="ml-1.5 font-medium text-warning-deep">· Late</span> : null}
                      </>
                    ) : (
                      "Not handed in"
                    )}
                  </p>
                </div>
                {hasWork ? (
                  <Button variant="ghost" size="sm" onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded}>
                    <Icon name={expanded ? "chevronDown" : "chevronRight"} size={16} /> {expanded ? "Hide work" : "View work"}
                  </Button>
                ) : null}
                {maxScore !== null ? (
                  <label className="flex shrink-0 items-center gap-1.5">
                    <span className="sr-only">Mark for {r.name}</span>
                    <span className="w-20">
                      <Input
                        inputMode="decimal"
                        className="h-10 text-center tabular"
                        value={draft[r.id].score}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [r.id]: { ...d[r.id], score: e.target.value },
                          }))
                        }
                        placeholder="–"
                      />
                    </span>
                    <span className="whitespace-nowrap fs-13.5 text-muted">/ {maxScore}</span>
                  </label>
                ) : null}
              </div>
              {expanded ? (
                <div className="mt-3 flex flex-col gap-3 rounded-chunk bg-paper p-3.5 sm:ml-12">
                  {r.text ? <p className="whitespace-pre-wrap fs-14.5 text-ink">{r.text}</p> : null}
                  <FileLinks files={r.files} />
                </div>
              ) : null}
              <div className="mt-2.5 sm:ml-12">
                <Input
                  className="h-10"
                  value={draft[r.id].feedback}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [r.id]: { ...d[r.id], feedback: e.target.value },
                    }))
                  }
                  placeholder={`Feedback for ${r.name.split(" ")[0]} (optional)`}
                  aria-label={`Feedback for ${r.name}`}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:px-5">
        <span className="fs-13.5 text-muted">{changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "All saved"}</span>
        <Button onClick={save} disabled={pending || changed.length === 0}>
          {pending ? "Saving…" : "Save marks"}
        </Button>
      </div>
    </div>
  );
}

export function AssignmentActions({
  slug,
  id,
  title,
  status,
  canSendToCA,
  column,
}: {
  slug: string;
  id: string;
  title: string;
  status: string;
  canSendToCA: boolean;
  column: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | "delete" | "ca">(null);
  const [msg, setMsg] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    start(async () => {
      const r = await fn();
      setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Done." });
      if (!r.error) router.refresh();
    });
  }

  return (
    <>
      {status !== "draft" ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => assignmentStatusAction(slug, id, status === "closed" ? "published" : "closed"))}>
          <Icon name={status === "closed" ? "undo" : "lock"} size={16} /> {status === "closed" ? "Reopen" : "Close"}
        </Button>
      ) : null}
      {canSendToCA ? (
        <Button size="sm" disabled={pending} onClick={() => setConfirm("ca")}>
          <Icon name="send" size={16} /> Send marks to {column}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirm("delete")} aria-label="Delete assignment">
        <Icon name="trash" size={16} />
      </Button>
      {msg ? (
        <div className="basis-full">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        title={`Delete "${title}"?`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          const r = await deleteAssignmentAction(slug, id);
          if (!r.error) router.push(`/s/${slug}/assignments`);
          return r;
        }}
      >
        Students&apos; work and marks for it are deleted too. Scores already sent to the score sheet stay there.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "ca"}
        onClose={() => setConfirm(null)}
        title={`Send marks to ${column}?`}
        confirmLabel="Send marks"
        onConfirm={async () => {
          const r = await sendToCAAction(slug, id);
          if (!r.error) {
            setConfirm(null);
            setMsg({ tone: "success", text: r.success ?? "Sent." });
            router.refresh();
          }
          return r;
        }}
      >
        Every marked student&apos;s score is scaled to the {column} maximum and written to this subject&apos;s score sheet, replacing what&apos;s there for them. Students without a
        mark are left alone.
      </ConfirmDialog>
    </>
  );
}
