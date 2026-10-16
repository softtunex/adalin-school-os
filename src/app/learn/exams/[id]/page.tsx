import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatDue } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { getStudentExam } from "@/lib/services/cbt";
import { STUDENT_EXAM } from "../status";
import { StartExam } from "./start-exam";

export const metadata: Metadata = { title: "Exam" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentExamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const { done } = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const d = await getStudentExam(getDb(), user.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const st = STUDENT_EXAM[d.status];
  const r = d.result;
  const pct = r && r.graded && r.total ? Math.round(((r.objective + (r.theory ?? 0)) / r.total) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/learn/exams" className="inline-flex items-center gap-1.5 self-start fs-14 font-semibold text-muted hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Exams
      </Link>
      {done ? <Alert tone="success">Submitted. Well done!</Alert> : null}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="fs-13.5 font-semibold text-muted">{d.subjectName}</p>
            <h1 className="fs-22 font-bold tracking-[-0.01em] text-ink">{d.e.title}</h1>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {[
            { k: "Questions", v: d.questionCount },
            { k: "Marks", v: d.total },
            { k: "Time", v: `${d.e.durationMins} min` },
          ].map((x) => (
            <div key={x.k} className="rounded-chunk bg-paper p-3 text-center">
              <dt className="fs-12.5 font-semibold text-muted">{x.k}</dt>
              <dd className="tabular fs-20 font-bold text-ink">{x.v}</dd>
            </div>
          ))}
        </dl>
        <p className="fs-14 text-muted">
          Opens {formatDue(d.e.opensAt)} · Closes {formatDue(d.e.closesAt)}
        </p>
        {d.e.instructions ? <p className="whitespace-pre-wrap fs-15 text-body">{d.e.instructions}</p> : null}
      </Card>

      {d.status === "open" || d.status === "in_progress" ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-17 font-bold">Before you start</h2>
          <ul className="flex flex-col gap-2 fs-14.5 text-body">
            <li className="flex gap-2">
              <Icon name="clock" size={18} className="mt-0.5 shrink-0 text-brand" /> The timer starts when you press Start and keeps running if you close the page.
            </li>
            <li className="flex gap-2">
              <Icon name="check" size={18} className="mt-0.5 shrink-0 text-brand" /> Your answers save as you go, so a dropped connection won&apos;t lose them.
            </li>
            <li className="flex gap-2">
              <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-brand" /> Stay on the exam screen. Switching apps or tabs is recorded for your teacher.
            </li>
          </ul>
          <StartExam examId={d.e.id} resume={d.status === "in_progress"} />
        </Card>
      ) : null}

      {d.status === "done" ? (
        r ? (
          <Card className="flex flex-col items-center gap-2 border-success/40 p-6 text-center">
            {pct !== null ? (
              <>
                <p className="fs-14 font-semibold text-muted">Your score</p>
                <p className="tabular fs-44 font-bold leading-none text-success-deep">{pct}%</p>
                <p className="tabular fs-14 text-muted">
                  {r.objective + (r.theory ?? 0)} of {r.total} marks
                </p>
              </>
            ) : (
              <>
                <p className="fs-14 font-semibold text-muted">Objective score so far</p>
                <p className="tabular fs-36 font-bold leading-none text-ink">
                  {r.objective}
                  <span className="fs-18 text-muted"> / {r.objectiveTotal}</span>
                </p>
                <p className="fs-14 text-muted">Your teacher is marking the theory answers. Your full score shows here once they&apos;re done.</p>
              </>
            )}
          </Card>
        ) : (
          <Alert tone="blue">You&apos;ve finished this exam. Your teacher will share the results.</Alert>
        )
      ) : null}
      {d.status === "missed" ? <Alert tone="blue">This exam has closed. Talk to your teacher if you couldn&apos;t sit it.</Alert> : null}
      {d.status === "upcoming" ? <Alert tone="blue">This exam opens {formatDue(d.e.opensAt)}. Come back then.</Alert> : null}
    </div>
  );
}
