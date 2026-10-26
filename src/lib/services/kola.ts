import { z } from "zod";
import { KOLA_GENERAL, KOLA_GUIDE } from "../ai/kola-guide";
import type { DB } from "../db/client";
import { flattenNav, resolveNav } from "../navigation";
import type { Access } from "./access";
import { runAi } from "./ai";

/*
 * Kola, the helper: answers "how do I…" questions about SchoolHub from the help guide, for the pages
 * this person can open. It explains how to do things; it doesn't read or change the school's records.
 */

export const kolaSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1500) }))
    .min(1)
    .max(20),
  page: z.string().max(200).optional(),
});

/** What Kola is told about this person: their pages (with links) and what each one does. */
export function kolaBrief(access: Access) {
  const slug = access.school.slug;
  const pages = flattenNav(resolveNav(slug, { permissions: access.permissions, features: new Set(access.plan.features), isStaff: access.isStaff }));
  const lines = pages.map((p) => {
    const key = p.href.slice(`/s/${slug}`.length);
    const where = p.group ? `${p.group} → ${p.label}` : p.label;
    return `- ${where} (link: ${p.href})${p.locked ? " [locked: needs a higher plan]" : ""}\n  ${KOLA_GUIDE[key] ?? ""}`;
  });
  return { pages: lines.join("\n"), roles: access.roles.map((r) => r.name).join(", ") || "member" };
}

export async function askKola(db: DB, access: Access, input: z.infer<typeof kolaSchema>) {
  const brief = kolaBrief(access);
  const history = input.messages.slice(-8);
  const system = `[task:kola] You are Kola, the friendly helper inside Adalin SchoolHub, a school management app used by schools in Nigeria. You are talking to ${greetingName(access.user.name)}, whose role at ${access.school.name} is ${brief.roles}. The school is on the ${access.plan.name} plan.${input.page ? ` They are on the page ${input.page}.` : ""}

Answer questions about how to use SchoolHub, using only the guide below. Rules:
- Be short and warm: a sentence or two, or a few numbered steps. Plain English, no jargon.
- Make the page name itself the link, using the exact link given, e.g. "Open [Students](/s/${access.school.slug}/students)". Write each page name once; don't add the menu group or repeat the name beside the link. Only use links from the guide.
- Use only the button and tab names in the guide, word for word.
- Only mention pages in the guide; this person can't open others. If they ask about something not there, say their role doesn't include it and suggest asking the school's admin or proprietor.
- If a page is locked, say it comes with a higher plan (Settings → Plan & billing, for the proprietor).
- You can't see or change the school's records (students, scores, fees). If asked for figures or to do something, say where they can see or do it themselves.
- If the guide doesn't cover it, say you're not sure and suggest the page most likely to have it, or contacting Adalin support. Never make up buttons or features.
- Stay on SchoolHub and school work. Politely decline anything else.

${KOLA_GENERAL}

Pages this person can open:
${brief.pages}`;

  return runAi(db, access, "kola", "text", [{ role: "system", content: system }, ...history], { maxTokens: 700, temperature: 0.3 });
}

const TITLES = /^(mr|mrs|miss|ms|dr|prof|engr|chief|pastor|rev|alhaji|alhaja|hajia|barr|sir|madam|nurse)\.?$/i;

/** The name to greet someone by: "Mrs Funmilayo Adeyemi" is Funmilayo. */
export function greetingName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.find((p) => !TITLES.test(p)) ?? parts[0] ?? "";
}
