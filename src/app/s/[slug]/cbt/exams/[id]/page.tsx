import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { formatDue, formatWhen } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { getExam } from "@/lib/services/cbt";
import { toLagosInput } from "@/lib/services/teaching";
import { EXAM_STATE } from "../../shared";
import { ExamActions, ReopenAttempt } from "./exam-client";

export const metadata: Metadata = { title: "CBT exam" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LETTERS = "ABCDEF";

export default async function ExamPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug, id } = await params;
  const { tab: rawTab } = await searchParams;
  if (!UUID.test(id)) notFound();
  const access = await requirePageAccess(slug, ["teaching:cbt"]);
  const d = await getExam(getDb(), access, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const tab = rawTab === "questions" ? "questions" : "results";
  const e = d.exam;
  const st = EXAM_STATE[d.state];
  const roll = d.attempts.length + d.notStarted.length;
  const finished = d.attempts.filter((a) => a.a.status !== "in_progress");
  const graded = d.attempts.filter((a) => a.a.status === "graded");
  const toMark = d.attempts.filter((a) => a.a.status === "submitted").length;
  const pct = (a: (typeof d.attempts)[number]["a"]) => (d.total ? Math.round((((a.objectiveScore ?? 0) + (a.theoryScore ?? 0)) / d.total) * 100) : 0);
  const average = graded.length ? Math.round(graded.reduce((t, x) => t + pct(x.a), 0) / graded.length) : null;
  const flagged = d.attempts.filter((a) => a.a.focusLosses >= 3).length;
  const base = `/s/${slug}/cbt/exams/${id}`;

  return (
    <>
      <Topbar title={e.title} context={`${d.subject?.name} · ${d.classes.map((c) => c.name).join(", ")}`} />
      <PageBody>
        <Link href={`/s/${slug}/cbt`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> CBT exams
        </Link>
        <Card className="flex flex-col gap-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="fs-20 font-semibold text-ink">{e.title}</h1>
                <Badge tone={st.tone} dot>
                  {st.label}
                </Badge>
              </div>
              <p className="mt-1 fs-14 text-muted">
                {d.subject?.name} · {d.classes.map((c) => c.name).join(", ")} · {d.questions.length} questions, {d.total} marks · {e.durationMins} minutes
                {d.component ? ` · Counts towards ${d.component.name}` : ""}
              </p>
              <p className="fs-14 text-muted">
                Opens {formatDue(e.opensAt)} · Closes {formatDue(e.closesAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExamActions
                slug={slug}
                id={e.id}
                status={e.status}
                started={d.attempts.length > 0}
                closesAt={toLagosInput(e.closesAt)}
                column={d.component?.name ?? null}
                canSendToCA={!!d.component && d.currentTerm && graded.length > 0 && toMark === 0}
              />
            </div>
          </div>
        </Card>

        <StatGrid>
          <StatCard label="Finished" value={`${finished.length}/${roll}`} icon="checkCircle" tone="brand" caption={`${d.attempts.length - finished.length} writing now`} />
          <StatCard label="Scripts to mark" value={d.hasTheory ? toMark : "—"} icon="edit" tone={toMark ? "warning" : "success"} caption={d.hasTheory ? (toMark ? "Theory answers waiting" : "All marked") : "Objective only, marked instantly"} />
          <StatCard label="Average" value={average === null ? "—" : `${average}%`} icon="trending" tone="violet" caption={graded.length ? `Across ${graded.length} marked` : "Once scripts are marked"} />
          <StatCard label="Left the exam screen" value={flagged} icon="alert" tone={flagged ? "danger" : "success"} caption="Students who switched away 3+ times" />
        </StatGrid>

        <Tabs
          current={tab}
          tabs={[
            { key: "results", label: "Results", href: base, count: d.attempts.length },
            { key: "questions", label: "Questions", href: `${base}?tab=questions`, count: d.questions.length },
          ]}
        />

        {tab === "results" ? (
          <>
            <TableCard title="Students">
              {d.attempts.length === 0 ? (
                <EmptyState icon="monitor" title="No one has started yet">
                  {d.state === "scheduled" ? `Students can start ${formatDue(e.opensAt)}.` : d.state === "draft" ? "Publish the exam so students can see it." : "Students start from the Exams tab in their portal."}
                </EmptyState>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Student</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Objective</Th>
                      {d.hasTheory ? <Th className="text-right">Theory</Th> : null}
                      <Th className="text-right">Score</Th>
                      <Th>Left screen</Th>
                      <Th className="w-40">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.attempts.map((x) => {
                      const a = x.a;
                      return (
                        <tr key={a.id} className="hover:bg-paper">
                          <Td>
                            <span className="block font-medium text-ink">
                              {x.firstName} {x.lastName}
                            </span>
                            <span className="block fs-13 text-muted">
                              {x.className} · {a.submittedAt ? `Finished ${formatWhen(a.submittedAt)}` : `Started ${formatWhen(a.startedAt)}`}
                            </span>
                          </Td>
                          <Td>
                            {a.status === "in_progress" ? (
                              <Badge tone="blue" dot>
                                Writing
                              </Badge>
                            ) : a.status === "submitted" ? (
                              <Badge tone="warning" dot>
                                To mark
                              </Badge>
                            ) : (
                              <Badge tone="success" dot>
                                Marked
                              </Badge>
                            )}
                          </Td>
                          <Td className="tabular text-right text-body">{a.objectiveScore ?? "—"}</Td>
                          {d.hasTheory ? <Td className="tabular text-right text-body">{a.theoryScore ?? "—"}</Td> : null}
                          <Td className="tabular text-right font-semibold text-ink">{a.status === "graded" ? `${pct(a)}%` : "—"}</Td>
                          <Td>
                            {a.focusLosses ? (
                              <Badge tone={a.focusLosses >= 3 ? "danger" : "warning"}>
                                {a.focusLosses} time{a.focusLosses === 1 ? "" : "s"}
                              </Badge>
                            ) : (
                              <span className="fs-13.5 text-muted">Never</span>
                            )}
                          </Td>
                          <Td className="text-right">
                            <div className="flex justify-end gap-1">
                              {a.status !== "in_progress" ? (
                                <Link href={`/s/${slug}/cbt/scripts/${a.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-chunk px-2.5 fs-14 font-semibold text-brand-ink hover:bg-brand-wash">
                                  {a.status === "submitted" ? "Mark" : "View"}
                                </Link>
                              ) : null}
                              {!(a.status === "graded" && Object.keys(a.theoryMarks).length) ? <ReopenAttempt slug={slug} attemptId={a.id} name={x.firstName} /> : null}
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </TableCard>
            {d.notStarted.length && d.state !== "draft" ? (
              <Card className="p-5">
                <h2 className="fs-15 font-semibold">
                  {d.state === "closed" ? "Didn't sit the exam" : "Not started yet"} <span className="tabular text-muted">· {d.notStarted.length}</span>
                </h2>
                <p className="mt-2 fs-14.5 leading-relaxed text-body">{d.notStarted.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}</p>
              </Card>
            ) : null}
          </>
        ) : (
          <Card className="overflow-hidden p-0">
            <ol className="flex flex-col">
              {d.questions.map((q, i) => {
                const an = d.analysis.find((x) => x.id === q.id);
                return (
                  <li key={q.id} className="flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap fs-15 text-ink">
                        <span className="mr-2 font-semibold text-muted">{i + 1}.</span>
                        {q.body}
                      </p>
                      <span className="shrink-0 fs-13 text-muted">
                        {q.marks} mark{q.marks === 1 ? "" : "s"}
                      </span>
                    </div>
                    {q.kind === "objective" ? (
                      <ul className="grid gap-1.5 sm:grid-cols-2">
                        {q.options.map((o, j) => (
                          <li key={j} className={cn("flex gap-2 rounded-chunk px-3 py-1.5 fs-14", j === q.answer ? "bg-success-wash font-medium text-success-deep" : "bg-paper text-body")}>
                            <span className="font-semibold">{LETTERS[j]}.</span> {o}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Badge tone="blue" className="self-start">
                        Theory
                      </Badge>
                    )}
                    {finished.length && an ? (
                      an.correct !== null ? (
                        <div className="flex items-center gap-3">
                          <span className="h-1.5 w-40 overflow-hidden rounded-full bg-sunken">
                            <span className={cn("block h-full rounded-full", an.correct >= 60 ? "bg-success" : an.correct >= 35 ? "bg-warning" : "bg-danger")} style={{ width: `${an.correct}%` }} />
                          </span>
                          <span className="fs-13.5 text-muted">
                            <span className="tabular font-semibold text-ink">{an.correct}%</span> got it right{an.correct < 35 ? " · worth re-teaching" : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="fs-13.5 text-muted">{an.answered} answered</span>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </PageBody>
    </>
  );
}
