import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { Alert, Badge } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getScoreSheet } from "@/lib/services/results";
import { ScoreGrid } from "./score-grid";

export const metadata: Metadata = { title: "Enter scores" };

export default async function ScoreSheetPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ class?: string; subject?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!sp.class || !sp.subject || !uuid.test(sp.class) || !uuid.test(sp.subject)) notFound();
  const access = await requirePageAccess(slug, ["results:enter", "results:review"]);

  let sheet;
  try {
    sheet = await getScoreSheet(getDb(), access, sp.class, sp.subject);
  } catch (error) {
    if (error instanceof AppError) {
      return (
        <>
          <Topbar title="Enter scores" />
          <PageBody>
            <Alert tone="warning">{error.message}</Alert>
          </PageBody>
        </>
      );
    }
    throw error;
  }

  const statusBadge =
    sheet.classStatus === "published" ? (
      <Badge tone="blue" dot>Published</Badge>
    ) : sheet.classStatus === "approved" ? (
      <Badge tone="violet" dot>Approved</Badge>
    ) : sheet.status === "submitted" ? (
      <Badge tone="success" dot>Submitted</Badge>
    ) : (
      <Badge tone="warning" dot>In progress</Badge>
    );

  return (
    <>
      <Topbar
        title={
          <span className="flex items-center gap-2">
            <Link href={`/s/${slug}/results`} className="text-muted hover:text-ink">
              Results
            </Link>
            <Icon name="chevronRight" size={18} className="text-muted" />
            <span className="truncate">
              {sheet.subject.name} · {sheet.class.name}
            </span>
          </span>
        }
        actions={statusBadge}
      />
      <PageBody>
        <p className="text-[14px] text-muted">
          {sheet.term.term.name}, {sheet.term.session.name} session · {sheet.components.map((c) => `${c.name} (${c.maxScore})`).join(" + ")}
        </p>
        {sheet.classStatus === "approved" || sheet.classStatus === "published" ? (
          <Alert tone="blue" title="These results are locked">They&apos;ve been approved. Ask the principal to unlock them if a score needs to change.</Alert>
        ) : sheet.status === "submitted" && !sheet.editable ? (
          <Alert tone="success" title="You've submitted this sheet">Your class teacher can reopen it if something needs to change.</Alert>
        ) : null}
        {sheet.students.length === 0 ? (
          <Alert tone="blue">There are no students in {sheet.class.name} yet.</Alert>
        ) : (
          <ScoreGrid
            slug={slug}
            classId={sheet.class.id}
            subjectId={sheet.subject.id}
            components={sheet.components.map((c) => ({ id: c.id, name: c.name, maxScore: c.maxScore }))}
            bands={sheet.bands.map((b) => ({ grade: b.grade, minScore: b.minScore, remark: b.remark, passes: b.passes }))}
            students={sheet.students.map((s) => ({ id: s.id, name: `${s.lastName} ${s.firstName}`, admissionNo: s.admissionNo }))}
            initial={sheet.scores}
            editable={sheet.editable}
            canSubmit={sheet.canSubmit}
            canReopen={sheet.canReopen}
          />
        )}
      </PageBody>
    </>
  );
}
