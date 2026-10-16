import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { Alert } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { bankForSubject, examBuilderOptions, getExam } from "@/lib/services/cbt";
import { toLagosInput } from "@/lib/services/teaching";
import { ExamBuilder } from "../../exam-builder";

export const metadata: Metadata = { title: "Edit exam" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditExamPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const access = await requirePageAccess(slug, ["teaching:cbt"]);
  const db = getDb();
  const d = await getExam(db, access, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const back = (
    <Link href={`/s/${slug}/cbt/exams/${id}`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
      <Icon name="chevronLeft" size={16} /> {d.exam.title}
    </Link>
  );
  if (d.attempts.length) {
    return (
      <>
        <Topbar title="Edit exam" context={d.exam.title} />
        <PageBody>
          {back}
          <Alert tone="warning">Students have started this exam, so its questions and settings are locked. You can still change when it closes from the exam page.</Alert>
        </PageBody>
      </>
    );
  }
  const [opts, bank] = await Promise.all([examBuilderOptions(db, access), bankForSubject(db, access, d.exam.subjectId)]);
  const e = d.exam;
  return (
    <>
      <Topbar title="Edit exam" context={e.title} />
      <PageBody>
        {back}
        <ExamBuilder
          slug={slug}
          subjects={opts.subjects}
          components={opts.components}
          defaults={{ opensAt: toLagosInput(e.opensAt), closesAt: toLagosInput(e.closesAt) }}
          initialBank={bank}
          editing={{
            id: e.id,
            subjectId: e.subjectId,
            classIds: d.classIds,
            title: e.title,
            instructions: e.instructions,
            durationMins: e.durationMins,
            opensAt: toLagosInput(e.opensAt),
            closesAt: toLagosInput(e.closesAt),
            shuffle: e.shuffle,
            showScore: e.showScore,
            componentId: e.componentId,
            questionIds: d.questions.map((q) => q.id),
            status: e.status,
          }}
        />
      </PageBody>
    </>
  );
}
