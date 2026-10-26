/*
 * The one place SchoolHub talks to an AI model. Every provider here speaks the OpenAI chat format.
 *
 * Each kind of task has a list of models to try in order. Each Groq model has its own daily allowance,
 * so when one is busy or nearly used up, the next one answers; a second company (OpenRouter) is the
 * last resort when its key is set. Google's free Gemini tier may use what it's sent to improve Google's
 * products, so it only ever gets jobs marked publicData (no personal details), and only as a backup:
 * it's much slower than Groq. One account per company: the providers' rules forbid spreading
 * use across several accounts to get round their limits.
 *
 * OLLAMA_URL (development only) sends everything to a model on this computer instead, with no limits.
 * AI_PROVIDER=fake gives canned answers for tests and demos without a key.
 */

export type AiTask = "text" | "fast" | "vision" | "guard";

export type AiContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export type AiMessage = { role: "system" | "user" | "assistant"; content: AiContent };

export type AiResult = { text: string; model: string; inputTokens: number; outputTokens: number };

type Provider = "groq" | "gemini" | "openrouter" | "ollama";
type Route = { provider: Provider; model: string };

const BASE: Record<Provider, () => string> = {
  groq: () => "https://api.groq.com/openai/v1",
  gemini: () => "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: () => "https://openrouter.ai/api/v1",
  ollama: () => `${(process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "")}/v1`,
};
const KEY: Record<Provider, () => string | undefined> = {
  groq: () => process.env.GROQ_API_KEY,
  gemini: () => process.env.GEMINI_API_KEY,
  openrouter: () => process.env.OPENROUTER_API_KEY,
  ollama: () => "ollama",
};

/** Groq models per task, best first. Only the Qwen model reads photos. */
export const GROQ_MODELS: Record<AiTask, string[]> = {
  text: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
  fast: ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"],
  vision: ["qwen/qwen3.8-27b"],
  guard: ["openai/gpt-oss-safeguard-20b"],
};

/** The models to try for a task, in order, given which providers are set up. */
export function routes(task: AiTask, opts: { publicData?: boolean } = {}): Route[] {
  // A model on this computer, for development: never on the live site.
  if (process.env.OLLAMA_URL && process.env.VERCEL_ENV !== "production") {
    // One small model that reads photos too, so a laptop needs a single ~3 GB download.
    const model = task === "vision" ? (process.env.OLLAMA_VISION_MODEL ?? process.env.OLLAMA_MODEL ?? "gemma3:4b") : (process.env.OLLAMA_MODEL ?? "gemma3:4b");
    return [{ provider: "ollama", model }];
  }
  const out: Route[] = process.env.GROQ_API_KEY ? GROQ_MODELS[task].map((model) => ({ provider: "groq" as const, model })) : [];
  if (opts.publicData && process.env.GEMINI_API_KEY && task !== "vision" && task !== "guard") {
    out.push({ provider: "gemini", model: process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest" });
  }
  if (process.env.OPENROUTER_API_KEY) {
    const model = task === "vision" ? process.env.OPENROUTER_VISION_MODEL : (process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b");
    if (model) out.push({ provider: "openrouter", model });
  }
  return out;
}

export class AiUnavailable extends Error {
  constructor(message = "AI is busy right now. Please try again in a minute.") {
    super(message);
    this.name = "AiUnavailable";
  }
}

export function aiProvider(): Provider | "fake" | null {
  if (process.env.AI_PROVIDER === "fake") return "fake";
  return routes("text")[0]?.provider ?? null;
}

// ---------- Resting models that are busy or nearly used up ----------

/** When each model may be tried again. Per server instance; a fresh instance simply finds out again. */
const restingUntil = new Map<string, number>();
const routeKey = (r: Route) => `${r.provider}:${r.model}`;

/** Groq writes waits like "2m59.56s", "7.66s" or "120ms"; Retry-After is plain seconds. */
export function parseWait(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw) * 1000;
  let ms = 0;
  let matched = false;
  for (const [, n, unit] of raw.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    ms += Number(n) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit as "ms" | "s" | "m" | "h"];
  }
  return matched ? ms : null;
}

/** Rests a model that's out of allowance, or about to be, until the provider says it resets. */
function noteLimits(route: Route, headers: Headers, status: number) {
  const now = Date.now();
  if (status === 429) {
    const wait = parseWait(headers.get("retry-after")) ?? parseWait(headers.get("x-ratelimit-reset-requests")) ?? 60_000;
    restingUntil.set(routeKey(route), now + Math.min(Math.max(wait, 5_000), 6 * 3_600_000));
    return;
  }
  // Nearly used up for the day: move on before people start seeing "busy".
  const left = Number(headers.get("x-ratelimit-remaining-requests"));
  if (headers.has("x-ratelimit-remaining-requests") && left <= 5) {
    const wait = parseWait(headers.get("x-ratelimit-reset-requests")) ?? 15 * 60_000;
    restingUntil.set(routeKey(route), now + wait);
  }
}

export function resetAiRouting() {
  restingUntil.clear();
}

// ---------- Asking ----------

export type AiOptions = {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  reasoning?: "low" | "medium" | "high";
  /** Nothing personal is sent (a topic, column headings), so free tiers that keep data may help. */
  publicData?: boolean;
};

/** Models that think before answering need room for it within max_tokens. */
const thinks = (model: string) => /gpt-oss|qwen3|gemini/i.test(model);

export async function complete(task: AiTask, messages: AiMessage[], opts: AiOptions = {}): Promise<AiResult> {
  if (process.env.AI_PROVIDER === "fake") return fakeComplete(GROQ_MODELS[task][0], messages);
  const all = routes(task, { publicData: opts.publicData });
  if (!all.length) throw new AiUnavailable("AI isn't set up on this server yet.");
  const now = Date.now();
  const ready = all.filter((r) => (restingUntil.get(routeKey(r)) ?? 0) <= now);
  // If everything is resting, try the one that comes back soonest rather than refuse outright.
  const order = ready.length ? ready : [...all].sort((a, b) => (restingUntil.get(routeKey(a)) ?? 0) - (restingUntil.get(routeKey(b)) ?? 0)).slice(0, 1);

  let last: AiUnavailable = new AiUnavailable();
  for (const route of order) {
    const outcome = await ask(route, messages, opts);
    if ("result" in outcome) return outcome.result;
    last = outcome.error;
    if (!outcome.tryNext) break;
  }
  throw last;
}

async function ask(route: Route, messages: AiMessage[], opts: AiOptions): Promise<{ result: AiResult } | { error: AiUnavailable; tryNext: boolean }> {
  const { provider, model } = route;
  const local = provider === "ollama";
  // Qwen3 on a laptop thinks at length; "/no_think" asks it to answer straight away.
  const sent = local && /qwen3/i.test(model) ? noThink(messages) : messages;
  const res = await fetch(`${BASE[provider]()}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY[provider]()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: sent,
      max_tokens: (opts.maxTokens ?? 1500) + (thinks(model) && !local ? 1500 : 0),
      ...((model.includes("gpt-oss") || provider === "gemini") && !local ? { reasoning_effort: opts.reasoning ?? "low" } : {}),
      temperature: opts.temperature ?? 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    // A laptop model is slower than a hosted one.
    signal: AbortSignal.timeout(local ? 180_000 : 60_000),
  }).catch(() => null);
  if (!res) {
    if (!local) restingUntil.set(routeKey(route), Date.now() + 30_000);
    return { error: new AiUnavailable(local ? "The AI on this computer isn't running. Start Ollama and try again." : undefined), tryNext: true };
  }
  noteLimits(route, res.headers, res.status);
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    console.error(`AI ${provider} ${model} ${res.status}: ${body?.error?.message ?? "no body"}`);
    // Busy, too large for this model's per-minute allowance, or down: the next model may manage.
    const tryNext = res.status === 429 || res.status === 413 || res.status >= 500;
    return { error: new AiUnavailable(res.status === 429 ? "AI has had a lot of requests. Please try again in a minute." : undefined), tryNext };
  }
  // An answer cut off mid-sentence is worse than none.
  if (body?.choices?.[0]?.finish_reason === "length") return { error: new AiUnavailable("AI's answer was cut short. Please try again."), tryNext: false };
  return {
    result: {
      text: stripThinking(body?.choices?.[0]?.message?.content ?? ""),
      model: provider === "groq" ? model : `${provider}:${model}`,
      inputTokens: body?.usage?.prompt_tokens ?? 0,
      outputTokens: body?.usage?.completion_tokens ?? 0,
    },
  };
}

function noThink(messages: AiMessage[]): AiMessage[] {
  const i = messages.map((m) => m.role).lastIndexOf("user");
  if (i < 0 || typeof messages[i].content !== "string") return messages;
  return messages.map((m, n) => (n === i ? { ...m, content: `${m.content} /no_think` } : m));
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
