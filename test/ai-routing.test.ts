import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { complete, parseWait, resetAiRouting, routes } from "@/lib/ai/provider";

const ok = (text: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 5 } }), { status: 200, headers });
const busy = (headers: Record<string, string> = {}) => new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429, headers });

describe("switching between AI models", () => {
  const env = { ...process.env };
  let calls: string[];

  beforeEach(() => {
    resetAiRouting();
    delete process.env.AI_PROVIDER;
    delete process.env.OLLAMA_URL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.GROQ_API_KEY = "test-key";
    calls = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  const mockFetch = (answer: (model: string, n: number) => Response) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const model = JSON.parse(String((init as RequestInit).body)).model as string;
      calls.push(model);
      return answer(model, calls.length);
    });

  it("reads Groq's wait times", () => {
    expect(parseWait("2m59.56s")).toBeCloseTo(179_560);
    expect(parseWait("7.66s")).toBeCloseTo(7_660);
    expect(parseWait("120ms")).toBe(120);
    expect(parseWait("30")).toBe(30_000);
    expect(parseWait(null)).toBeNull();
  });

  it("moves to the next model when one is busy, and rests the busy one", async () => {
    mockFetch((model) => (model === "openai/gpt-oss-120b" ? busy({ "retry-after": "600" }) : ok(`from ${model}`)));
    expect((await complete("text", [{ role: "user", content: "hi" }])).text).toBe("from qwen/qwen3.8-27b");
    expect(calls).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
    // The busy model is skipped until it resets.
    calls = [];
    await complete("text", [{ role: "user", content: "again" }]);
    expect(calls).toEqual(["qwen/qwen3.8-27b"]);
  });

  it("moves on before a model runs out, when it's nearly used up for the day", async () => {
    mockFetch((model) => ok(model, model === "openai/gpt-oss-120b" ? { "x-ratelimit-remaining-requests": "3", "x-ratelimit-reset-requests": "1h0m0s" } : {}));
    await complete("text", [{ role: "user", content: "one" }]);
    await complete("text", [{ role: "user", content: "two" }]);
    expect(calls).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  });

  it("uses the second company only after every Groq model, and only when its key is set", async () => {
    expect(routes("text").map((r) => r.provider)).toEqual(["groq", "groq", "groq"]);
    process.env.OPENROUTER_API_KEY = "or-key";
    expect(routes("text").at(-1)).toEqual({ provider: "openrouter", model: "openai/gpt-oss-120b" });
    mockFetch((model, n) => (n <= 3 ? busy() : ok(`backup ${model}`)));
    expect((await complete("text", [{ role: "user", content: "hi" }])).model).toBe("openrouter:openai/gpt-oss-120b");
  });

  it("doesn't try other models for a bad request, and says when everything is busy", async () => {
    mockFetch(() => new Response("{}", { status: 400 }));
    await expect(complete("text", [{ role: "user", content: "hi" }])).rejects.toThrow(/busy/);
    expect(calls).toHaveLength(1);
  });

  it("gives Google Gemini only jobs without personal details, and only after Groq", () => {
    process.env.GEMINI_API_KEY = "g-key";
    expect(routes("text").some((r) => r.provider === "gemini")).toBe(false);
    expect(routes("fast", { publicData: true }).map((r) => r.provider)).toEqual(["groq", "groq", "groq", "gemini"]);
    expect(routes("vision", { publicData: true }).some((r) => r.provider === "gemini")).toBe(false);
  });

  it("uses only the model on this computer when OLLAMA_URL is set, never on the live site", () => {
    process.env.OLLAMA_URL = "http://localhost:11434";
    expect(routes("text")).toEqual([{ provider: "ollama", model: "gemma3:4b" }]);
    expect(routes("vision")).toEqual([{ provider: "ollama", model: "gemma3:4b" }]);
    process.env.VERCEL_ENV = "production";
    expect(routes("text")[0].provider).toBe("groq");
  });
});
