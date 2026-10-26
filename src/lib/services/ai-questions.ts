import { z } from "zod";
import type { DB } from "../db/client";
import { AppError } from "../errors";
import { hasFeature } from "../plans/entitlements";
import { can, type Access } from "./access";
import { runAi } from "./ai";
import { parseQuestions } from "./cbt";

/*
 * AI for the question bank. Both helpers return text in the same format teachers paste in, so it
 * lands in the Paste questions box for the teacher to check and correct before anything is saved.
 */

const FORMAT = `Write the questions in exactly this plain-text format, with nothing before or after:

1. Question text
A. option
B. option *
C. option
D. option

2. A theory question has no options. [4 marks]

Rules: a blank line between questions. Objective questions have four options A to D, and the one correct option ends with " *". Theory questions have no options and end with the marks in square brackets. No markdown, no bold, no headings, no answer key at the end.`;

function requireBank(access: Access) {
  if (!hasFeature(access.plan, "cbt")) throw new AppError("CBT exams are on the Standard plan.", "upgrade");
  if (!can(access, "teaching:cbt")) throw new AppError("You don't have permission to do that.", "forbidden");
}

/** Tidies what the model wrote: drops markdown and stray lines, so it reads as the paste format. */
export function cleanQuestionText(raw: string) {
  return raw
    .replace(/\r/g, "")
    .replace(/^```[a-z]*\n?|```$/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#+\s.*$/gm, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const draftSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  level: z.string().trim().max(60).default(""),
  topic: z.string().trim().min(2, "Say what the questions are about.").max(200),
  count: z.number().int().min(1).max(30),
  kind: z.enum(["objective", "theory", "mixed"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export async function draftQuestions(db: DB, access: Access, input: z.infer<typeof draftSchema>) {
  requireBank(access);
  const kinds = input.kind === "objective" ? "objective (multiple choice) questions" : input.kind === "theory" ? "theory (written answer) questions" : "questions, about two thirds objective and one third theory";
  const text = await runAi(db, access, "questions", "text", [
    {
      role: "system",
      content: `[task:questions] You set exam questions for schools in Nigeria, following the Nigerian curriculum (NERDC) and WAEC/NECO style where it applies. Use clear, simple English suited to the pupils' age, Nigerian names, places and naira where an example needs them, and make sure every answer is correct.\n\n${FORMAT}`,
    },
    { role: "user", content: `Write ${input.count} ${input.difficulty} ${kinds} for ${input.subject}${input.level ? `, ${input.level}` : ""}, on: ${input.topic}` },
  ], { maxTokens: 400 + input.count * 180, temperature: 0.6, reasoning: "medium", publicData: true });
  return checked(text);
}

/** Copies questions from a photo of a test paper or textbook page. */
export async function readQuestionsFromPhoto(db: DB, access: Access, imageDataUrl: string) {
  requireBank(access);
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(imageDataUrl)) throw new AppError("Choose a photo (JPG or PNG).", "invalid");
  if (imageDataUrl.length > 5_000_000) throw new AppError("That photo is too large. Try a smaller one.", "invalid");
  const text = await runAi(db, access, "questions_photo", "vision", [
    {
      role: "system",
      content: `[task:questions] You copy exam questions from photos for a teacher, word for word. Fix only obvious spelling slips from the photo. If the paper marks an answer, use it; otherwise mark the option you are sure is correct. Write maths in plain text (3/4, x^2).\n\n${FORMAT}`,
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Copy out every question in this photo." },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ], { maxTokens: 3000, temperature: 0.1 });
  return checked(text);
}

function checked(raw: string) {
  const text = cleanQuestionText(raw);
  const { questions, errors } = parseQuestions(text);
  if (!questions.length) throw new AppError("AI couldn't find any questions there. Try again, or type them in.", "invalid");
  return { text, count: questions.length, problems: errors.length };
}
