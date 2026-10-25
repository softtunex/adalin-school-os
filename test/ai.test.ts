import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stripThinking } from "@/lib/ai/provider";
import type { Database } from "@/lib/db/client";
import { aiUsage, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { loadAccess } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { AI_DAILY, aiAvailability, aiUsedToday, runAi, saveAiSettings } from "@/lib/services/ai";
import { cleanQuestionText, draftQuestions } from "@/lib/services/ai-questions";
import { parseQuestions } from "@/lib/services/cbt";
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

  it("stops at the daily allowance", async () => {
    const a = await access();
    await withTenant(database.db, schoolId, (tx) =>
      tx.insert(aiUsage).values(Array.from({ length: AI_DAILY.standard }, () => ({ schoolId, userId, feature: "kola", model: "test" }))),
    );
    await expect(runAi(database.db, a, "kola", "fast", [{ role: "user", content: "Hi" }])).rejects.toThrow(/today's 100 AI requests/);
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
