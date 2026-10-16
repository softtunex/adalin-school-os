import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getExamPaper } from "@/lib/services/cbt";
import { ExamRoom } from "./exam-room";

export const metadata: Metadata = { title: "Exam" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The exam room: full screen, no portal menus, for the student's open attempt only. */
export default async function ExamRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/student");
  if (user.mustChangePassword) redirect("/learn");
  const paper = await getExamPaper(getDb(), user.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  if (!paper) redirect(`/learn/exams/${id}`);
  return (
    <ExamRoom
      exam={{ id: paper.exam.id, title: paper.exam.title, subjectName: paper.exam.subjectName }}
      questions={paper.questions}
      initialAnswers={paper.answers}
      deadline={paper.deadline}
      serverNow={paper.serverNow}
      initialFocusLosses={paper.focusLosses}
    />
  );
}
