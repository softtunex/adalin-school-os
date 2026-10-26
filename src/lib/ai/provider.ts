/*
 * The one place SchoolHub talks to an AI model. Groq's free API speaks the OpenAI chat format, so
 * switching provider later is a change of base URL, key and model names here, nothing else.
 * AI_PROVIDER=fake gives canned answers for tests and demos without a key.
 */

export type AiTask = "text" | "fast" | "vision" | "guard";

export type AiContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export type AiMessage = { role: "system" | "user" | "assistant"; content: AiContent };

export type AiResult = { text: string; model: string; inputTokens: number; outputTokens: number };

const GROQ_URL = "https://api.groq.com/openai/v1";

export const MODELS: Record<AiTask, string> = {
  text: "openai/gpt-oss-120b",
  fast: "openai/gpt-oss-20b",
  vision: "qwen/qwen3.8-27b",
  guard: "openai/gpt-oss-safeguard-20b",
};

export class AiUnavailable extends Error {
  constructor(message = "AI is busy right now. Please try again in a minute.") {
    super(message);
    this.name = "AiUnavailable";
  }
}

export function aiProvider(): "groq" | "fake" | null {
  if (process.env.AI_PROVIDER === "fake") return "fake";
  return process.env.GROQ_API_KEY ? "groq" : null;
}

export type AiOptions = { maxTokens?: number; temperature?: number; json?: boolean; reasoning?: "low" | "medium" | "high" };

export async function complete(task: AiTask, messages: AiMessage[], opts: AiOptions = {}): Promise<AiResult> {
  const provider = aiProvider();
  if (!provider) throw new AiUnavailable("AI isn't set up on this server yet.");
  const model = MODELS[task];
  if (provider === "fake") return fakeComplete(model, messages);

  const res = await fetch(`${GROQ_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      // Reasoning models spend part of max_tokens thinking before they answer; keep it short so the answer fits.
      max_tokens: (opts.maxTokens ?? 1500) + (model.startsWith("openai/gpt-oss") ? 1500 : 0),
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: opts.reasoning ?? "low" } : {}),
      temperature: opts.temperature ?? 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!res) throw new AiUnavailable();
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    console.error(`AI ${model} ${res.status}: ${body?.error?.message ?? "no body"}`);
    throw new AiUnavailable(res.status === 429 ? "AI has had a lot of requests. Please try again in a minute." : undefined);
  }
  // An answer cut off mid-sentence is worse than none.
  if (body?.choices?.[0]?.finish_reason === "length") throw new AiUnavailable("AI's answer was cut short. Please try again.");
  return {
    text: stripThinking(body?.choices?.[0]?.message?.content ?? ""),
    model,
    inputTokens: body?.usage?.prompt_tokens ?? 0,
    outputTokens: body?.usage?.completion_tokens ?? 0,
  };
}

/** Some models show their working in <think> tags; people only need the answer. */
export function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function lastUserText(messages: AiMessage[]) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return typeof last.content === "string" ? last.content : last.content.map((c) => (c.type === "text" ? c.text : "")).join(" ");
}

function fakeComplete(model: string, messages: AiMessage[]): AiResult {
  const system = messages.find((m) => m.role === "system");
  const kind = typeof system?.content === "string" ? (system.content.match(/\[task:(\w+)\]/)?.[1] ?? "") : "";
  const ask = lastUserText(messages);
  const text =
    kind === "questions"
      ? "1. What is 2 + 3?\nA. 4\nB. 5 *\nC. 6\nD. 7\n\n2. Explain why the sum of two even numbers is even. [4 marks]"
      : kind === "comment"
        ? "A hardworking pupil who has made steady progress this term. Keep it up."
        : kind === "columns"
          ? "{}"
          : `I'm Kola (test mode). You asked: ${ask.slice(0, 120)}`;
  return { text, model, inputTokens: 10, outputTokens: 10 };
}
