import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stripThinking, type AiMessage } from "@/lib/ai/provider";
import type { Database } from "@/lib/db/client";
import { aiUsage, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { AI_DAILY, AI_PER_PERSON, aiAvailability, aiUsedToday, runAi, saveAiSettings } from "@/lib/services/ai";
import { cleanQuestionText, draftQuestions } from "@/lib/services/ai-questions";
import { parseQuestions } from "@/lib/services/cbt";
import { addVideo, askKola, greetingName, kolaBrief, placeVideos } from "@/lib/services/kola";
import { createTestDatabase } from "./helpers";

let database: Database;
let userId: string;
let slug: string;
let schoolId: string;

const access = async () => (await loadAccess(database.db, userId, slug))!;

beforeAll(async () => {
  process.env.AI_PROVIDER = "fake";
  database = await createTestDatabase();
  const r = await registerSchoolOwner(database.db, { name: "Mr Tunde Bello", email: "tunde@ai.test", password: "AiTests2026", schoolName: "Adalin AI College" });
  userId = r.user.id;
  slug = r.school.slug;
  schoolId = r.school.id;
});

afterAll(async () => {
  delete process.env.AI_PROVIDER;
  await database.close();
});

describe("AI helpers", () => {
  it("stays off on the Free plan", async () => {
    const a = await access();
    expect(aiAvailability(a)).toMatchObject({ ok: false, upgrade: true });
    await expect(runAi(database.db, a, "kola", "fast", [{ role: "user", content: "Hi" }])).rejects.toThrow(/Standard plan/);
  });

  it("works on Standard, records each request, and respects the school's switch", async () => {
    await database.db.update(schools).set({ planKey: "standard" }).where(eq(schools.id, schoolId));
    const a = await access();
    expect(aiAvailability(a).ok).toBe(true);
    const out = await runAi(database.db, a, "kola", "fast", [{ role: "system", content: "[task:kola] Help." }, { role: "user", content: "How do I add a student?" }]);
    expect(out).toContain("How do I add a student?");
    expect(await aiUsedToday(database.db, schoolId)).toBe(1);

    await saveAiSettings(database.db, a, { enabled: false, kolaForFamilies: true });
    const off = await access();
    expect(aiAvailability(off)).toMatchObject({ ok: false });
    await expect(runAi(database.db, off, "kola", "fast", [{ role: "user", content: "Hi" }])).rejects.toThrow(/switched off/);
    await saveAiSettings(database.db, off, { enabled: true, kolaForFamilies: true });
  });

  it("stops at the daily allowance, and offers whoever pays a bigger plan", async () => {
    const a = await access();
    await withTenant(database.db, schoolId, (tx) =>
      // Other people's requests: the school total, not this person's own allowance.
      tx.insert(aiUsage).values(Array.from({ length: AI_DAILY.standard }, () => ({ schoolId, userId: null, feature: "kola", model: "test" }))),
    );
    const hi: AiMessage[] = [{ role: "user", content: "Hi" }];
    // The proprietor can pay for more.
    await expect(runAi(database.db, a, "kola", "fast", hi)).rejects.toMatchObject({ code: "upgrade", message: expect.stringMatching(/today's 100 AI requests.*move to Premium in Settings → Plan & billing/) });
    // Staff without billing are told who can.
    const teacher = { ...a, permissions: new Set([...a.permissions].filter((p) => p !== "school:billing")) } as typeof a;
    await expect(runAi(database.db, teacher, "kola", "fast", hi)).rejects.toMatchObject({ code: "rate_limited", message: expect.stringMatching(/Your proprietor can move the school to Premium/) });
    // Families are never asked to pay for the school's plan.
    const parent = { user: { id: userId }, isStaff: false, school: a.school, plan: a.plan };
    await expect(runAi(database.db, parent, "kola", "fast", hi)).rejects.toMatchObject({ code: "rate_limited", message: expect.not.stringMatching(/Premium|proprietor/) });
    await withTenant(database.db, schoolId, (tx) => tx.delete(aiUsage).where(eq(aiUsage.schoolId, schoolId)));
  });

  it("drafts questions in the paste format", async () => {
    const a = await access();
    const r = await draftQuestions(database.db, a, { subject: "Mathematics", level: "JSS 1", topic: "Addition", count: 2, kind: "mixed", difficulty: "easy" });
    expect(r.count).toBe(2);
    expect(parseQuestions(r.text).errors).toEqual([]);
  });
});

describe("cleaning what the model writes", () => {
  it("drops markdown and thinking so the text parses", () => {
    const raw = "<think>planning</think>```\n**1. What is 2 + 2?**\nA. 3\nB. 4 *\nC. 5\nD. 6\n```";
    const text = cleanQuestionText(stripThinking(raw));
    const parsed = parseQuestions(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]).toMatchObject({ body: "What is 2 + 2?", answer: 1 });
  });
});

describe("Kola", () => {
  it("greets people by their first name, not their title", () => {
    expect(greetingName("Mrs Funmilayo Adeyemi")).toBe("Funmilayo");
    expect(greetingName("Dr. Adebayo Ogunleye")).toBe("Adebayo");
    expect(greetingName("Olatunji Buari")).toBe("Olatunji");
  });

  it("only tells Kola about pages this person can open", async () => {
    const a = await access();
    const brief = kolaBrief(a);
    expect(brief.pages).toContain(`/s/${slug}/students`);
    const teacher = { ...a, permissions: new Set(["teaching:cbt"] as const), roles: [{ id: "t", key: "teacher", name: "Teacher", kind: "system" as const }] } as unknown as typeof a;
    const t = kolaBrief(teacher);
    expect(t.pages).toContain(`/s/${slug}/cbt`);
    expect(t.pages).not.toContain(`/s/${slug}/fees`);
    expect(t.roles).toBe("Teacher");
  });

  it("answers through the school's AI allowance", async () => {
    const reply = await askKola(database.db, await access(), { messages: [{ role: "user", content: "How do I add a student?" }] });
    expect(reply).toContain("How do I add a student?");
  });
});

describe("allowances and Kola's brief", () => {
  it("stops one person at their own daily allowance before the school's", async () => {
    const a = await access();
    await withTenant(database.db, schoolId, (tx) =>
      tx.insert(aiUsage).values(Array.from({ length: AI_PER_PERSON.staff }, () => ({ schoolId, userId, feature: "kola", model: "test" }))),
    );
    await expect(runAi(database.db, a, "kola", "fast", [{ role: "user", content: "Hi" }])).rejects.toThrow(/your 30 AI requests/);
    // Failed requests never count against anyone.
    await withTenant(database.db, schoolId, (tx) => tx.update(aiUsage).set({ ok: false }).where(eq(aiUsage.schoolId, schoolId)));
    expect(await aiUsedToday(database.db, schoolId, userId)).toBe(0);
    await withTenant(database.db, schoolId, (tx) => tx.delete(aiUsage).where(eq(aiUsage.schoolId, schoolId)));
  });

  it("gives Kola the full guide only for the pages a question is about", async () => {
    const a = await access();
    const brief = kolaBrief(a, { question: "How do I invite a new teacher?" });
    expect(brief.detailed).toContain("/staff");
    expect(brief.detailed.length).toBeLessThanOrEqual(4);
    const all = kolaBrief(a, { question: "staff fees results students timetable library" });
    expect(brief.pages.length).toBeLessThan(kolaBrief(a, { question: "" }).pages.length + 2000);
    // Every page the person can open is still listed, with its link.
    expect(brief.pages).toContain(`/s/${slug}/fees`);
    expect(all.detailed.length).toBe(4);
    // The page they're on is always explained.
    expect(kolaBrief(a, { page: `/s/${slug}/library`, question: "what now" }).detailed).toContain("/library");
  });

  it("gives Kola the tutorial videos for the pages a question is about, and only those", async () => {
    const brief = kolaBrief(await access(), { question: "How do I invite a new teacher?" });
    const staff = brief.pages.split("\n- ").find((p) => p.includes(`/s/${slug}/staff)`))!;
    // Kola sees codes and titles, never the addresses.
    expect(staff).toMatch(/Videos: \[\[V\d\]\] \w/);
    expect(brief.pages).not.toMatch(/youtu/);
    expect(brief.videos[0].url).toMatch(/^https:\/\/youtu\.be\/[\w-]{11}(\?t=\d+)?$/);
    expect(brief.pages.match(/Videos:/g)?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("only ever links Kola's replies to our own videos", () => {
    const offered = [{ title: "Episode 21: Recording a payment", url: "https://youtu.be/abcdefghijk?t=40" }];
    expect(placeVideos("Open Fees.\n\nWatch how: [[V1]]", offered)).toBe("Open Fees.\n\nWatch how: [Episode 21: Recording a payment](https://youtu.be/abcdefghijk?t=40)");
    // A made-up code, title or address is dropped, along with its now-empty line.
    expect(placeVideos("Open Results.\n\nWatch how: [[V7]]", offered)).toBe("Open Results.");
    expect(placeVideos("Open Results.\n\nWatch how: [Episode 12: Viewing results](https://youtu.be/3K9ZxUeJQbU)", offered)).toBe("Open Results.");
    expect(placeVideos("See https://www.youtube.com/watch?v=3K9ZxUeJQbU for more.", offered)).toBe("See  for more.");
    expect(placeVideos("All of them: [[SERIES]]", offered)).toMatch(/\[SchoolHub video tutorials\]\(https:\/\/www\.youtube\.com\/playlist\?list=/);
    // Ordinary lines that mention videos stay.
    expect(placeVideos("To add a video:\n1. Open Materials.", offered)).toBe("To add a video:\n1. Open Materials.");
  });

  it("adds the video for the page a reply links to when Kola leaves it out, matching the question", () => {
    const academics = [
      { title: "Episode 7: Classes", url: "https://youtu.be/aaaaaaaaaaa" },
      { title: "Episode 7: Sessions & terms", url: "https://youtu.be/aaaaaaaaaaa?t=196" },
    ];
    const videosFor = (link: string) => (link.startsWith("/s/x/academics") ? academics : undefined);
    expect(addVideo("1. Open [Classes & subjects](/s/x/academics).", "It's a new term, what do I do?", videosFor)).toBe(
      "1. Open [Classes & subjects](/s/x/academics).\n\nWatch how: [Episode 7: Sessions & terms](https://youtu.be/aaaaaaaaaaa?t=196)",
    );
    // No close match: the page's main scene.
    expect(addVideo("Open [Classes & subjects](/s/x/academics).", "help", videosFor)).toMatch(/Episode 7: Classes\]/);
    // A reply that already has a video, or links nowhere with videos, is left alone.
    const has = "Open it.\n\nWatch how: [Episode 7: Classes](https://youtu.be/aaaaaaaaaaa)";
    expect(addVideo(has, "term", videosFor)).toBe(has);
    expect(addVideo("Ask your admin.", "term", videosFor)).toBe("Ask your admin.");
  });

  it("always tells Kola where AI can be used, so \"where can I use AI?\" has an answer", async () => {
    const brief = kolaBrief(await access(), { question: "Where are the places where I can use AI on this platform" });
    expect(brief.aiHelpers).toMatch(/Write questions with AI/);
    expect(brief.aiHelpers).toMatch(/Suggest with AI/);
    expect(brief.aiHelpers).toMatch(/AI & Kola/);
    expect(brief.aiHelpers).toMatch(/Ask Kola/);
    // A subject teacher only hears about what their role can do.
    const teacher = { ...(await access()), permissions: new Set(["teaching:cbt", "students:view", "results:enter"]) } as unknown as Awaited<ReturnType<typeof access>>;
    const t = kolaBrief(teacher, { question: "where can I use AI" }).aiHelpers;
    expect(t).toMatch(/Write questions with AI/);
    expect(t).not.toMatch(/Import from Excel|Suggest with AI|AI & Kola/);
  });

  it("explains scratch cards, and tells a teacher who makes them instead of how", async () => {
    const owner = kolaBrief(await access(), { question: "How does the result scratch card work?" });
    expect(owner.detailed).toContain("/results");
    expect(owner.pages).toMatch(/Result checker link/);
    expect(owner.pages).not.toMatch(/can't do: making Result PINs/);
    const teacher = { ...(await access()), permissions: new Set(["results:enter", "results:view"]) } as unknown as Awaited<ReturnType<typeof access>>;
    expect(kolaBrief(teacher, { question: "How does the result scratch card work?" }).pages).toMatch(/can't do: making Result PINs/);
  });
});
