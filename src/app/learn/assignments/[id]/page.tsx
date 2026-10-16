import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileLinks } from "@/components/file-uploader";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatDue, formatWhen } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { getStudentAssignment } from "@/lib/services/assignments";
import { isPast } from "@/lib/services/teaching";
import { HOMEWORK_STATUS } from "../status";
import { SubmitWork } from "./submit-work";

export const metadata: Metadata = { title: "Homework" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentAssignment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const d = await getStudentAssignment(getDb(), user.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const st = HOMEWORK_STATUS[d.status];
  const pastDue = isPast(d.a.dueAt);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/learn/assignments" className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-muted hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Homework
      </Link>
      <Card className="flex flex-col gap-3.5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="fs-13.5 font-semibold text-muted">{d.subjectName}</p>
            <h1 className="fs-22 font-bold tracking-[-0.01em] text-ink">{d.a.title}</h1>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 fs-14 text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size={15} /> Due {formatDue(d.a.dueAt)}
          </span>
          {d.a.maxScore ? <span>Out of {d.a.maxScore}</span> : null}
          {!d.a.allowLate ? <span>No late work</span> : null}
        </p>
        {d.a.instructions ? <p className="whitespace-pre-wrap fs-15 leading-relaxed text-body">{d.a.instructions}</p> : null}
        <FileLinks files={d.files} />
      </Card>

      {d.status === "marked" ? (
        <Card className="flex flex-col gap-2 border-success/40 p-5">
          <p className="fs-13.5 font-semibold text-muted">Your mark</p>
          {d.sub?.score != null && d.a.maxScore ? (
            <p className="tabular fs-32 font-bold leading-none text-success-deep">
              {d.sub.score}
              <span className="fs-18 text-muted"> / {d.a.maxScore}</span>
            </p>
          ) : null}
          {d.sub?.feedback ? <p className="whitespace-pre-wrap fs-15 text-body">&ldquo;{d.sub.feedback}&rdquo;</p> : null}
        </Card>
      ) : null}

      {d.sub?.submittedAt && !d.canSubmit ? (
        <Card className="flex flex-col gap-3 p-5">
          <p className="fs-14 text-muted">
            You handed this in {formatWhen(d.sub.submittedAt)}
            {d.sub.late ? " (late)" : ""}.
          </p>
          {d.sub.text ? <p className="whitespace-pre-wrap fs-15 text-ink">{d.sub.text}</p> : null}
          <FileLinks files={d.myFiles} />
        </Card>
      ) : null}

      {d.canSubmit ? (
        <>
          {pastDue ? <Alert tone="warning">The due time has passed. You can still hand in, but it will be marked late.</Alert> : null}
          <SubmitWork assignmentId={d.a.id} text={d.sub?.text ?? ""} files={d.myFiles} resubmit={!!d.sub?.submittedAt} />
        </>
      ) : d.status === "missed" ? (
        <Alert tone="blue">This can&apos;t be handed in any more. Talk to your teacher if you think that&apos;s wrong.</Alert>
      ) : null}
    </div>
  );
}
