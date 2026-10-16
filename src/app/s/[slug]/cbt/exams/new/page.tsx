import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { bankForSubject, examBuilderOptions } from "@/lib/services/cbt";
import { defaultDueInput } from "@/lib/services/teaching";
import { ExamBuilder } from "../exam-builder";

export const metadata: Metadata = { title: "New exam" };

export default async function NewExamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["teaching:cbt"]);
  const db = getDb();
  const opts = await examBuilderOptions(db, access);
  const first = opts.subjects[0];
  const bank = first ? await bankForSubject(db, access, first.subjectId) : [];
  // Tomorrow, 8am to 4pm.
  const day = defaultDueInput().slice(0, 10);
  return (
    <>
      <Topbar title="New CBT exam" context={access.school.name} />
      <PageBody>
        <Link href={`/s/${slug}/cbt`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> CBT exams
        </Link>
        {first ? (
          <ExamBuilder slug={slug} subjects={opts.subjects} components={opts.components} defaults={{ opensAt: `${day}T08:00`, closesAt: `${day}T16:00` }} initialBank={bank} />
        ) : (
          <Card>
            <EmptyState icon="monitor" title="No classes to set exams for">
              You&apos;ll be able to set exams once you&apos;re assigned to teach a subject.
            </EmptyState>
          </Card>
        )}
      </PageBody>
    </>
  );
}
