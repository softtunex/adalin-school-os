import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getAttemptForMarking } from "@/lib/services/cbt";
import { TheoryMarks } from "./theory-marks";

export const metadata: Metadata = { title: "Mark script" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LETTERS = "ABCDEF";

export default async function ScriptPage({ params }: { params: Promise<{ slug: string; attemptId: string }> }) {
  const { slug, attemptId } = await params;
  if (!UUID.test(attemptId)) notFound();
  const access = await requirePageAccess(slug, ["teaching:cbt"]);
  const d = await getAttemptForMarking(getDb(), access, attemptId).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const a = d.a;
  const name = `${d.firstName} ${d.lastName}`;
  const theory = d.questions.filter((q) => q.kind === "theory");

  return (
    <>
      <Topbar title={name} context={d.exam.title} />
      <PageBody>
        <Link href={`/s/${slug}/cbt/exams/${d.exam.id}`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> {d.exam.title}
        </Link>
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5">
          <div className="min-w-0 flex-1">
            <h1 className="fs-18 font-semibold text-ink">{name}</h1>
            <p className="font-mono fs-13 text-muted">{d.admissionNo}</p>
          </div>
          <div className="tabular fs-14 text-body">
            Objective <span className="font-semibold text-ink">{a.objectiveScore ?? 0}</span>
            {theory.length ? (
              <>
                {" "}
                · Theory <span className="font-semibold text-ink">{a.theoryScore ?? "—"}</span>
              </>
            ) : null}{" "}
            · out of <span className="font-semibold text-ink">{d.total}</span>
          </div>
          {a.focusLosses ? <Badge tone={a.focusLosses >= 3 ? "danger" : "warning"}>Left the exam screen {a.focusLosses} time{a.focusLosses === 1 ? "" : "s"}</Badge> : null}
        </Card>

        <div className="flex w-full max-w-3xl flex-col gap-3">
          {d.questions.map((q, i) => {
            const ans = a.answers[q.id];
            if (q.kind === "theory") return null;
            const right = ans === q.answer;
            return (
              <Card key={q.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="whitespace-pre-wrap fs-14.5 text-ink">
                    <span className="mr-2 font-semibold text-muted">{i + 1}.</span>
                    {q.body}
                  </p>
                  <Badge tone={ans === undefined ? "neutral" : right ? "success" : "danger"}>{ans === undefined ? "Skipped" : right ? `+${q.marks}` : "0"}</Badge>
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((o, j) => (
                    <li
                      key={j}
                      className={cn(
                        "flex gap-2 rounded-chunk px-3 py-1.5 fs-14",
                        j === q.answer ? "bg-success-wash font-medium text-success-deep" : j === ans ? "bg-danger-wash text-danger-deep line-through" : "bg-paper text-body",
                      )}
                    >
                      <span className="font-semibold">{LETTERS[j]}.</span> {o}
                      {j === ans ? <span className="ml-auto fs-12.5 font-semibold no-underline">Their answer</span> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {theory.length ? (
            <TheoryMarks
              slug={slug}
              attemptId={a.id}
              examId={d.exam.id}
              nextToMark={d.nextToMark}
              questions={theory.map((q) => ({ id: q.id, number: d.questions.indexOf(q) + 1, body: q.body, marks: q.marks, answer: typeof a.answers[q.id] === "string" ? (a.answers[q.id] as string) : "", given: a.theoryMarks[q.id] ?? null }))}
            />
          ) : null}
        </div>
      </PageBody>
    </>
  );
}
