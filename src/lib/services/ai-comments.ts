import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { students } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import type { Access } from "./access";
import { runAi } from "./ai";
import { getClassResults } from "./results";

/*
 * Report card comments drafted from a student's own results. Only scores, grades, attendance and
 * ratings are sent, never the student's name. The teacher edits the draft before saving it.
 */

export const suggestSchema = z.object({ studentId: z.string().uuid(), who: z.enum(["teacher", "principal"]), teacherComment: z.string().max(600).optional() });

export async function suggestComment(db: DB, access: Access, input: z.infer<typeof suggestSchema>) {
  const [student] = await withTenant(db, access.school.id, (tx) => tx.select({ classId: students.classId, gender: students.gender }).from(students).where(eq(students.id, input.studentId)));
  if (!student?.classId) throw new AppError("That student isn't in a class.", "not_found");
  const data = await getClassResults(db, access, student.classId);
  if (input.who === "teacher" ? !data.permissions.comment : !data.permissions.principalComment) {
    throw new AppError(input.who === "teacher" ? "Only the class teacher can write this comment." : "Only the principal can write this comment.", "forbidden");
  }
  const s = data.students.find((x) => x.id === input.studentId);
  if (!s) throw new AppError("That student isn't in this class.", "not_found");
  if (s.result.average === null) throw new AppError("Enter this student's scores first; the comment is drafted from them.", "invalid");

  const subjectName = new Map(data.subjects.map((x) => [x.id, x.name]));
  const subjects = Object.values(s.result.subjects)
    .filter((r) => r.total !== null)
    .map((r) => `${subjectName.get(r.subjectId) ?? "Subject"}: ${r.total} (${r.grade ?? "-"}; class average ${r.classAverage ?? "-"})`)
    .join("\n");
  const ratings = Object.entries(s.report?.ratings ?? {})
    .map(([k, v]) => `${k} ${v}/5`)
    .join(", ");
  const days = data.attendanceDays;
  const facts = [
    `Class: ${data.class.name}. Term: ${data.term.term.name}, ${data.term.session.name}.`,
    `The student is a ${student.gender === "female" ? "girl" : "boy"}.`,
    `Average ${s.result.average}, position ${s.result.position ?? "-"} of ${data.summary.withResults}; passed ${s.result.passed}, failed ${s.result.failed} subjects.`,
    `Subjects:\n${subjects}`,
    days ? `Attendance: present ${s.attendance.present + s.attendance.late} of ${days} school days.` : "",
    ratings ? `Behaviour and skills ratings: ${ratings}.` : "",
    input.who === "principal" && input.teacherComment?.trim() ? `The class teacher wrote: "${input.teacherComment.trim()}"` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const voice =
    input.who === "teacher"
      ? "the class teacher's comment: specific to these results, naming one or two strong subjects and one to improve, with practical encouragement"
      : "the principal's comment: shorter and more formal, an overall verdict with a word of encouragement or caution, that agrees with the class teacher";
  const text = await runAi(db, access, "comment", "text", [
    {
      role: "system",
      content: `[task:comment] You write report card comments for schools in Nigeria. Write ${voice}. One to two sentences, at most 45 words, in warm, professional British English as Nigerian schools write them. Use he or she, never a name. Be honest: praise real strengths, and for weak results be kind but clear. Don't invent anything that isn't in the facts. Reply with the comment only, no quotes.`,
    },
    { role: "user", content: facts },
  ], { maxTokens: 400, temperature: 0.7 });
  return text.replace(/^["“]|["”]$/g, "").trim().slice(0, 600);
}
