import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileLinks } from "@/components/file-uploader";
import { PageBody, Topbar } from "@/components/topbar";
import { Alert, Badge, Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatWhen } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { getLessonNote, listLessonNotes } from "@/lib/services/lesson-notes";
import { NoteEditor, OwnerNoteActions, ReviewPanel } from "../notes-client";
import { NOTE_STATUS } from "../status";

export const metadata: Metadata = { title: "Lesson note" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NotePage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ saved?: string; edit?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const access = await requirePageAccess(slug, ["teaching:lessons", "teaching:review"]);
  const db = getDb();
  const d = await getLessonNote(db, access, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const n = d.n;
  const st = NOTE_STATUS[n.status];
  const back = (
    <Link href={`/s/${slug}/lesson-notes`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
      <Icon name="chevronLeft" size={16} /> Lesson notes
    </Link>
  );

  if (d.canEdit && (sp.edit === "1" || n.status === "returned" || (n.status === "draft" && sp.saved !== "1"))) {
    const list = await listLessonNotes(db, access, { page: 1 });
    return (
      <>
        <Topbar title={`Week ${n.week}: ${n.topic}`} context={`${d.levelName} · ${d.subjectName}`} />
        <PageBody>
          {back}
          <div className="w-full max-w-3xl">
            <NoteEditor
              slug={slug}
              options={list.options}
              weeks={list.weeks}
              defaultWeek={n.week}
              note={{ id: n.id, levelId: n.levelId, subjectId: n.subjectId, week: n.week, topic: n.topic, objectives: n.objectives, content: n.content, files: d.files, returned: n.status === "returned" ? n.reviewComment : null }}
            />
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <Topbar title={`Week ${n.week}: ${n.topic}`} context={`${d.levelName} · ${d.subjectName}`} />
      <PageBody>
        {back}
        <div className="flex w-full max-w-3xl flex-col gap-4">
          {sp.saved === "1" ? <Alert tone="success">{n.status === "submitted" ? "Sent for approval. You'll see it here once it's reviewed." : "Draft saved."}</Alert> : null}
          {n.status === "approved" ? (
            <Alert tone="success" title={`Approved${d.reviewerName ? ` by ${d.reviewerName}` : ""}`}>
              {n.reviewComment ?? (n.reviewedAt ? formatWhen(n.reviewedAt) : null)}
            </Alert>
          ) : null}
          <Card className="flex flex-col gap-4 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="fs-13 font-medium uppercase tracking-[0.06em] text-muted">
                  {d.levelName} · {d.subjectName} · Week {n.week}
                </p>
                <h1 className="mt-1 fs-22 font-semibold text-ink">{n.topic}</h1>
                <p className="mt-1 fs-14 text-muted">
                  By {d.author ?? "a former teacher"}
                  {n.submittedAt ? ` · Sent ${formatWhen(n.submittedAt)}` : ` · Updated ${formatWhen(n.updatedAt)}`}
                </p>
              </div>
              <Badge tone={st.tone} dot>
                {st.label}
              </Badge>
            </div>
            {d.plannedTopic && d.plannedTopic !== n.topic ? (
              <p className="rounded-chunk bg-warning-wash px-3.5 py-2.5 fs-14 text-warning-deep">Scheme of work planned &ldquo;{d.plannedTopic}&rdquo; for this week.</p>
            ) : null}
            {n.objectives ? (
              <section>
                <h2 className="fs-13 font-medium uppercase tracking-[0.06em] text-muted">Objectives</h2>
                <p className="mt-1.5 whitespace-pre-wrap fs-15 text-body">{n.objectives}</p>
              </section>
            ) : null}
            {n.content ? (
              <section>
                <h2 className="fs-13 font-medium uppercase tracking-[0.06em] text-muted">Lesson note</h2>
                <p className="mt-1.5 max-w-[75ch] whitespace-pre-wrap fs-15 leading-relaxed text-ink">{n.content}</p>
              </section>
            ) : null}
            <FileLinks files={d.files} />
            {d.canEdit || d.canWithdraw ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                {d.canEdit ? (
                  <Link href={`?edit=1`} className="inline-flex items-center gap-1.5 fs-14 font-semibold text-brand-ink hover:underline">
                    <Icon name="edit" size={16} /> Edit
                  </Link>
                ) : null}
                <OwnerNoteActions slug={slug} id={n.id} canWithdraw={d.canWithdraw} canDelete={d.canEdit} />
              </div>
            ) : null}
          </Card>
          {d.canReview ? <ReviewPanel slug={slug} id={n.id} /> : null}
        </div>
      </PageBody>
    </>
  );
}
