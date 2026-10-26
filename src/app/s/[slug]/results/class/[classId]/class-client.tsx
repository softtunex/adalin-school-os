"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Alert, Avatar, Card } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { RATING_SCALE, RATING_TRAITS } from "@/lib/results/compute";
import { saveTermReportAction, setResultStatusAction, suggestCommentAction } from "../../actions";

type Status = "open" | "reviewed" | "approved" | "published";
type Perms = { review: boolean; approve: boolean; publish: boolean; unlock: boolean; comment: boolean; principalComment: boolean; workflow: boolean };

const STEPS: { key: Status; label: string }[] = [
  { key: "open", label: "Scores in" },
  { key: "reviewed", label: "Reviewed" },
  { key: "approved", label: "Approved" },
  { key: "published", label: "Published" },
];

export function WorkflowBar({
  slug,
  classId,
  status,
  permissions,
  submitted,
  subjects,
  commentsDone,
  students,
  nextTermBegins,
}: {
  slug: string;
  classId: string;
  status: Status;
  permissions: Perms;
  submitted: number;
  subjects: number;
  commentsDone: number;
  students: number;
  nextTermBegins: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Status | null>(null);
  const [resumes, setResumes] = useState(nextTermBegins ?? "");
  const [, startTransition] = useTransition();
  const steps = permissions.workflow ? STEPS : STEPS.filter((s) => s.key === "open" || s.key === "published");
  const currentIndex = steps.findIndex((s) => s.key === status);

  const actions: { to: Status; label: string; variant: "primary" | "secondary" | "ghost" }[] = [];
  if (status === "open" && permissions.workflow && permissions.review) actions.push({ to: "reviewed", label: "Mark as reviewed", variant: "primary" });
  if (status === "open" && !permissions.workflow && permissions.publish) actions.push({ to: "published", label: "Publish results", variant: "primary" });
  if (status === "reviewed" && permissions.approve) actions.push({ to: "approved", label: "Approve and lock", variant: "primary" });
  if (status === "reviewed" && (permissions.review || permissions.approve)) actions.push({ to: "open", label: "Send back", variant: "ghost" });
  if (status === "approved" && permissions.publish) actions.push({ to: "published", label: "Publish to parents", variant: "primary" });
  if ((status === "approved" || status === "published") && permissions.unlock) actions.push({ to: "open", label: "Unlock", variant: "ghost" });

  const copy: Record<Status, { title: string; body: string; confirm: string }> = {
    reviewed: { title: "Mark these results as reviewed?", body: "This tells the principal the scores and comments are ready for approval.", confirm: "Mark as reviewed" },
    approved: { title: "Approve and lock these results?", body: "Scores and comments will be locked. Only someone with unlock permission can change them after this.", confirm: "Approve and lock" },
    published: { title: "Publish results to parents?", body: "Parents and students will be able to see report cards, and result checker PINs will start working.", confirm: "Publish" },
    open: { title: status === "reviewed" ? "Send these results back?" : "Unlock these results?", body: status === "reviewed" ? "The class goes back to in progress so teachers can make changes." : "Teachers will be able to change scores again. Published report cards are hidden until you publish again.", confirm: status === "reviewed" ? "Send back" : "Unlock" },
  };

  return (
    <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <ol className="flex flex-1 items-center gap-2" aria-label="Results progress">
        {steps.map((s, i) => {
          const done = i < currentIndex || (s.key === "published" && status === "published");
          const current = i === currentIndex && status !== "published";
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full fs-13 font-bold",
                  done ? "bg-success text-white" : current ? "bg-brand text-white shadow-[0_2px_0_var(--brand-deep)]" : "bg-sunken text-muted",
                )}
              >
                {done ? <Icon name="check" size={15} strokeWidth={2.8} /> : i + 1}
              </span>
              <span className={cn("whitespace-nowrap fs-13.5 font-medium", done || current ? "text-ink" : "text-muted")}>{s.label}</span>
              {i < steps.length - 1 ? <span className={cn("mx-1 hidden h-0.5 flex-1 rounded-full sm:block", i < currentIndex ? "bg-success" : "bg-line")} /> : null}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {status === "open" ? (
          <span className="fs-13 text-muted">
            {submitted}/{subjects} sheets · {commentsDone}/{students} comments
          </span>
        ) : null}
        {actions.map((a) => (
          <Button key={a.to + a.label} variant={a.variant} onClick={() => setDialog(a.to)}>
            {a.label}
          </Button>
        ))}
      </div>
      {dialog ? (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          title={copy[dialog].title}
          confirmLabel={copy[dialog].confirm}
          danger={dialog === "open" && status !== "reviewed"}
          onConfirm={async () => {
            const result = await setResultStatusAction(slug, classId, dialog, dialog === "published" ? resumes || null : undefined);
            if (!result.error) startTransition(() => router.refresh());
            return result;
          }}
        >
          <div className="flex flex-col gap-4">
            <p>{copy[dialog].body}</p>
            {dialog === "published" && subjects > submitted ? <Alert tone="warning">{subjects - submitted} subject sheets haven&apos;t been submitted yet.</Alert> : null}
            {dialog === "published" ? (
              <Field label="Next term begins (printed on report cards)" htmlFor="resumes">
                <Input id="resumes" type="date" value={resumes} onChange={(e) => setResumes(e.target.value)} />
              </Field>
            ) : null}
          </div>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

export function ReportEditor({
  slug,
  pdfHref,
  student,
  report,
  canComment,
  canPrincipal,
  ai,
}: {
  slug: string;
  pdfHref: string;
  student: { id: string; name: string; admissionNo: string; position: string | null; average: number | null };
  report: { classTeacherComment: string; principalComment: string; ratings: Record<string, number> };
  canComment: boolean;
  canPrincipal: boolean;
  ai: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [teacher, setTeacher] = useState(report.classTeacherComment);
  const [principal, setPrincipal] = useState(report.principalComment);
  const [ratings, setRatings] = useState(report.ratings);
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();
  const [drafting, setDrafting] = useState<null | "teacher" | "principal">(null);

  async function suggest(who: "teacher" | "principal") {
    setDrafting(who);
    setState({});
    const r = await suggestCommentAction(slug, { studentId: student.id, who, teacherComment: teacher });
    setDrafting(null);
    if (r.error || !r.text) return setState({ error: r.error ?? "AI didn't come back with anything. Please try again." });
    (who === "teacher" ? setTeacher : setPrincipal)(r.text);
  }
  const suggestButton = (who: "teacher" | "principal") =>
    ai && student.average !== null ? (
      <button type="button" onClick={() => suggest(who)} disabled={drafting !== null} className="inline-flex items-center gap-1.5 fs-13.5 font-semibold text-brand hover:underline disabled:opacity-60">
        <Icon name="wand" size={15} /> {drafting === who ? "Drafting…" : "Suggest with AI"}
      </button>
    ) : null;
  const rated = Object.keys(ratings).length;
  const total = RATING_TRAITS.affective.length + RATING_TRAITS.psychomotor.length;

  function save() {
    startTransition(async () => {
      const input: Record<string, unknown> = { studentId: student.id };
      if (canComment) {
        input.classTeacherComment = teacher;
        input.ratings = ratings;
      }
      if (canPrincipal) input.principalComment = principal;
      setState(await saveTermReportAction(slug, input));
    });
  }

  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <Avatar name={student.name} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{student.name}</span>
          <span className="block fs-13 text-muted">
            {student.position ? `${student.position} · average ${student.average}` : "No scores yet"}
          </span>
        </span>
        <span className="hidden fs-13 text-muted sm:block">
          {report.classTeacherComment || teacher ? "Comment written" : "No comment"} · {rated}/{total} ratings
        </span>
        <Icon name="chevronDown" size={18} className={cn("text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="flex flex-col gap-5 border-t border-line px-5 py-5">
          <Field label="Class teacher's comment" htmlFor={`ct-${student.id}`} hint={canComment ? suggestButton("teacher") : undefined}>
            <Textarea id={`ct-${student.id}`} value={teacher} onChange={(e) => setTeacher(e.target.value)} disabled={!canComment} maxLength={600} rows={2} placeholder="e.g. A diligent student who participates well in class." />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            {(["affective", "psychomotor"] as const).map((group) => (
              <fieldset key={group} className="flex flex-col gap-2">
                <legend className="mb-1 fs-14 font-medium text-ink">{group === "affective" ? "Behaviour" : "Skills"}</legend>
                {RATING_TRAITS[group].map((trait) => (
                  <div key={trait} className="flex items-center justify-between gap-3">
                    <span className="fs-14 text-body">{trait}</span>
                    <div className="flex gap-1" role="radiogroup" aria-label={trait}>
                      {RATING_SCALE.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          role="radio"
                          aria-checked={ratings[trait] === r.value}
                          title={r.label}
                          disabled={!canComment}
                          onClick={() => setRatings((prev) => ({ ...prev, [trait]: r.value }))}
                          className={cn(
                            "grid size-8 place-items-center rounded-[9px] border fs-13 font-bold transition-colors disabled:cursor-default",
                            ratings[trait] === r.value ? "border-brand bg-brand text-white" : "border-line-strong text-muted hover:text-ink",
                          )}
                        >
                          {r.value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
          <Field label="Principal's comment" htmlFor={`pr-${student.id}`} hint={canPrincipal ? suggestButton("principal") : undefined}>
            <Textarea id={`pr-${student.id}`} value={principal} onChange={(e) => setPrincipal(e.target.value)} disabled={!canPrincipal} maxLength={600} rows={2} />
          </Field>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href={pdfHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 fs-14 font-medium text-blue hover:underline">
              <Icon name="download" size={16} /> Preview report card
            </a>
            <div className="flex items-center gap-3">
              {state.success && !pending ? (
                <span className="inline-flex items-center gap-1 fs-13 text-success">
                  <Icon name="check" size={15} strokeWidth={2.6} /> Saved
                </span>
              ) : null}
              {canComment || canPrincipal ? (
                <Button onClick={save} disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
