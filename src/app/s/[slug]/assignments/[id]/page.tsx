import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileLinks } from "@/components/file-uploader";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, Card, StatCard, StatGrid } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatDue, formatWhen } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { getAssessmentConfig } from "@/lib/services/assessment";
import { assignmentTargets, getAssignment } from "@/lib/services/assignments";
import { toLagosInput } from "@/lib/services/teaching";
import { EditAssignmentButton } from "../assignment-form";
import { assignmentState } from "../shared";
import { AssignmentActions, MarkingTable } from "./marking";

export const metadata: Metadata = { title: "Assignment" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssignmentPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const access = await requirePageAccess(slug, ["teaching:lessons"]);
  const db = getDb();
  const d = await getAssignment(db, access, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const [targets, config] = await Promise.all([assignmentTargets(db, access), getAssessmentConfig(db, access)]);
  const a = d.a;
  const st = assignmentState(a);
  const handedIn = d.students.filter((s) => s.submission?.submittedAt);
  const late = handedIn.filter((s) => s.submission?.late).length;
  const marked = d.students.filter((s) => s.submission?.score != null);
  const avg = marked.length && a.maxScore ? Math.round((marked.reduce((t, s) => t + (s.submission!.score ?? 0), 0) / marked.length / a.maxScore) * 100) : null;

  return (
    <>
      <Topbar title={a.title} context={`${d.className} · ${d.subjectName}`} />
      <PageBody>
        <Link href={`/s/${slug}/assignments`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> Assignments
        </Link>

        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="fs-20 font-semibold text-ink">{a.title}</h1>
                <Badge tone={st.tone} dot>
                  {st.label}
                </Badge>
              </div>
              <p className="mt-1 fs-14 text-muted">
                {d.className} · {d.subjectName} · Due {formatDue(a.dueAt)}
                {a.maxScore ? ` · Out of ${a.maxScore}` : ""}
                {d.component ? ` · Counts towards ${d.component.name}` : ""}
                {a.allowLate ? "" : " · No late work"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EditAssignmentButton
                slug={slug}
                targets={targets}
                components={config.components}
                editing={{
                  id: a.id,
                  classId: a.classId,
                  subjectId: a.subjectId,
                  title: a.title,
                  instructions: a.instructions,
                  dueAt: toLagosInput(a.dueAt),
                  maxScore: a.maxScore,
                  componentId: a.componentId,
                  allowLate: a.allowLate,
                  status: a.status,
                  files: d.files,
                }}
              />
              <AssignmentActions slug={slug} id={a.id} title={a.title} status={a.status} canSendToCA={!!d.component && !!a.maxScore && d.currentTerm && marked.length > 0} column={d.component?.name ?? null} />
            </div>
          </div>
          {a.instructions ? <p className="max-w-[75ch] whitespace-pre-wrap fs-15 text-body">{a.instructions}</p> : null}
          <FileLinks files={d.files} />
        </Card>

        <StatGrid>
          <StatCard label="Handed in" value={`${handedIn.length}/${d.students.length}`} icon="checkCircle" tone="brand" caption={d.students.length ? `${Math.round((handedIn.length / d.students.length) * 100)}% of the class` : "No students"} />
          <StatCard label="Late" value={late} icon="clock" tone={late ? "warning" : "success"} caption={late ? "After the due time" : "None late"} />
          <StatCard label="Marked" value={a.maxScore ? marked.length : "—"} icon="edit" tone="blue" caption={a.maxScore ? `${handedIn.filter((s) => s.submission?.score == null).length} handed in, not marked` : "Not scored"} />
          <StatCard label="Class average" value={avg === null ? "—" : `${avg}%`} icon="trending" tone="violet" caption={avg === null ? "Once you've marked some" : `Across ${marked.length} marked`} />
        </StatGrid>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <h2 className="fs-16 font-semibold">Students&apos; work</h2>
            <p className="fs-13.5 text-muted">Mark work handed in online, or enter marks for work handed in on paper.</p>
          </div>
          <MarkingTable
            slug={slug}
            assignmentId={a.id}
            maxScore={a.maxScore}
            rows={d.students.map((s) => ({
              id: s.id,
              name: `${s.firstName} ${s.lastName}`,
              admissionNo: s.admissionNo,
              submittedAt: s.submission?.submittedAt?.toISOString() ?? null,
              submittedLabel: s.submission?.submittedAt ? formatWhen(s.submission.submittedAt, { relative: false }) : null,
              late: s.submission?.late ?? false,
              text: s.submission?.text ?? "",
              files: s.files,
              score: s.submission?.score ?? null,
              feedback: s.submission?.feedback ?? "",
            }))}
          />
        </Card>
      </PageBody>
    </>
  );
}
