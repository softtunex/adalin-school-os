import { z } from "zod";
import { eq } from "drizzle-orm";
import { KOLA_AI, KOLA_GENERAL, KOLA_GUIDE, KOLA_PARENT_GUIDE } from "../ai/kola-guide";
import type { DB } from "../db/client";
import { schools } from "../db/schema";
import { AppError } from "../errors";
import { flattenNav, resolveNav } from "../navigation";
import { can, type Access } from "./access";
import type { Permission } from "../rbac/permissions";
import { aiAvailability, aiSettings, runAi, type AiActor } from "./ai";
import { myChildren } from "./parent-portal";

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

const STOP = new Set(["what", "when", "where", "which", "with", "that", "this", "have", "there", "their", "they", "from", "into", "about", "does", "doing", "should", "could", "would", "your", "page", "help", "please", "kola", "schoolhub"]);
// Short words are mostly noise, but "AI" is exactly what some people ask about.
const words = (s: string) => s.toLowerCase().match(/\bai\b|[a-z]{4,}/g)?.filter((w) => !STOP.has(w)) ?? [];

/**
 * What Kola is told about this person: every page they can open (with links), and the full guide only
 * for the page they're on and the few pages the question is about. Sending the whole guide every time
 * would use several times the AI allowance for the same answer.
 */
export function kolaBrief(access: Access, focus: { page?: string; question?: string } = {}) {
  const slug = access.school.slug;
  const pages = flattenNav(resolveNav(slug, { permissions: access.permissions, features: new Set(access.plan.features), isStaff: access.isStaff }));
  const asked = new Set(words(focus.question ?? ""));
  const scored = pages.map((p) => {
    const key = p.href.slice(`/s/${slug}`.length);
    const text = `${p.label} ${p.keywords ?? ""} ${KOLA_GUIDE[key] ?? ""}`;
    // A word in the page's name or keywords counts more than one in its guide.
    const name = new Set(words(`${p.label} ${p.keywords ?? ""}`));
    const score = [...asked].reduce((n, w) => n + (name.has(w) ? 3 : 0) + (text.toLowerCase().includes(w) ? 1 : 0), 0);
    const here = !!focus.page && (focus.page === p.href || focus.page.startsWith(`${p.href}/`) || focus.page.startsWith(`${p.href}?`)) && key !== "";
    return { p, key, score: here ? score + 100 : score };
  });
  const detailed = new Set(
    scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((s) => s.key),
  );
  const lines = scored.map(({ p, key }) => {
    const where = p.group ? `${p.group} → ${p.label}` : p.label;
    const head = `- ${where} (link: ${p.href})${p.locked ? " [locked: needs a higher plan]" : ""}`;
    return detailed.has(key) && KOLA_GUIDE[key] ? `${head}\n  ${KOLA_GUIDE[key]}` : head;
  });
  // Always: the AI helpers on pages they can open, and Kola itself, so "where can I use AI?" has an answer.
  // Opening a page isn't enough: a subject teacher sees Students and Results but can't import or write report comments.
  const allowed: Record<string, Permission[]> = { "/students": ["students:import"], "/results": ["results:comment", "results:approve"], "/settings": ["school:update"], "/cbt": ["teaching:cbt"] };
  const ai = scored
    .filter(({ p, key }) => KOLA_AI[key] && !p.locked && (allowed[key] ?? []).some((perm) => can(access, perm)))
    .map(({ p, key }) => `- ${KOLA_AI[key]} (link: ${p.href})`);
  const aiHelpers = [...ai, "- Kola (you): the Ask Kola button at the bottom right of every page answers how-to questions."].join("\n");
  return { pages: lines.join("\n"), aiHelpers, roles: access.roles.map((r) => r.name).join(", ") || "member", detailed: [...detailed] };
}

export async function askKola(db: DB, access: Access, input: z.infer<typeof kolaSchema>) {
  const question = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const brief = kolaBrief(access, { page: input.page, question });
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

AI helpers this person can use:
${brief.aiHelpers}

Pages this person can open (full guide given for the ones that matter to this question; ask them to open a page for more):
${brief.pages}`;

  return runAi(db, access, "kola", "text", [{ role: "system", content: system }, ...history], { maxTokens: 700, temperature: 0.3 });
}

const TITLES = /^(mr|mrs|miss|ms|dr|prof|engr|chief|pastor|rev|alhaji|alhaja|hajia|barr|sir|madam|nurse)\.?$/i;

/** The name to greet someone by: "Mrs Funmilayo Adeyemi" is Funmilayo. */
export function greetingName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.find((p) => !TITLES.test(p)) ?? parts[0] ?? "";
}

// ---------- Kola for parents ----------

/** The school whose Kola a parent uses: the first of their children's schools that offers it to families. */
export async function parentKola(db: DB, userId: string) {
  const kids = await myChildren(db, userId);
  for (const schoolId of [...new Set(kids.map((k) => k.schoolId))]) {
    const kid = kids.find((k) => k.schoolId === schoolId)!;
    const [school] = await db.select({ id: schools.id, name: schools.name, aiSettings: schools.aiSettings, planKey: schools.planKey }).from(schools).where(eq(schools.id, schoolId));
    if (!school) continue;
    const actor: AiActor = { user: { id: userId }, isStaff: false, school, plan: { key: school.planKey, features: kid.school.features } };
    if (aiAvailability(actor).ok && aiSettings(school.aiSettings).kolaForFamilies) {
      return { actor, schoolName: school.name, children: kids.map((k) => ({ id: k.studentId, firstName: k.firstName, school: k.school.name })) };
    }
  }
  return null;
}

export async function askParentKola(db: DB, user: { id: string; name: string }, input: z.infer<typeof kolaSchema>) {
  const kola = await parentKola(db, user.id);
  if (!kola) throw new AppError("Kola isn't available for your school.", "forbidden");
  const kids = kola.children.map((c) => `- ${c.firstName} at ${c.school} (link: /p/children/${c.id}; a section: /p/children/${c.id}?tab=fees)`).join("\n");
  const system = `[task:kola] You are Kola, the friendly helper in the Adalin SchoolHub parent app, used by parents of schools in Nigeria. You are talking to ${greetingName(user.name)}, a parent.${input.page ? ` They are on the page ${input.page}.` : ""}

Answer questions about how to use the parent app, using only the guide below. Rules:
- Be short and warm: a sentence or two, or a few numbered steps. Plain English.
- Link pages as markdown with a readable name, e.g. "Open [Messages](/p/messages)" or "open [Folake's Fees](/p/children/<id>?tab=fees)". Never show a raw web address or put one in backticks. Use only links from the guide.
- You can't see the children's records (fees owed, scores, attendance) or change anything. Say where in the app to look.
- Questions about school policy, fees amounts, dates or a child's progress are for the school: suggest Message the teacher.
- Never make up buttons or features. If unsure, suggest messaging the school.
- Stay on the parent app and school matters. Politely decline anything else.

${KOLA_PARENT_GUIDE}

Their children:
${kids}`;
  return runAi(db, kola.actor, "kola", "text", [{ role: "system", content: system }, ...input.messages.slice(-8)], { maxTokens: 600, temperature: 0.3 });
}
