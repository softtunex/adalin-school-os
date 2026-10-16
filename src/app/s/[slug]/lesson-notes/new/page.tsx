import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listLessonNotes } from "@/lib/services/lesson-notes";
import { NoteEditor } from "../notes-client";

export const metadata: Metadata = { title: "New lesson note" };

export default async function NewNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["teaching:lessons"]);
  const list = await listLessonNotes(getDb(), access, { page: 1 });
  if (list.options.length === 0) notFound();
  return (
    <>
      <Topbar title="New lesson note" context={list.term.name} />
      <PageBody>
        <Link href={`/s/${slug}/lesson-notes`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> Lesson notes
        </Link>
        <div className="w-full max-w-3xl">
          <NoteEditor slug={slug} options={list.options} weeks={list.weeks} defaultWeek={Math.min(list.currentWeek ?? 1, list.weeks)} />
        </div>
      </PageBody>
    </>
  );
}
