import { afterEach, describe, expect, it, vi } from "vitest";
import { productionEnvProblems, reportError } from "@/lib/monitoring";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("error reporting", () => {
  it("only logs when Sentry isn't set up", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError(new Error("boom"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends an envelope to Sentry with nothing personal in it", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc123@o1.ingest.sentry.io/42");
    const sent: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push({ url, body: String(init.body) });
      return new Response(null, { status: 200 });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError(new TypeError("cannot read x"), { url: "/pay/secret-token?reference=abc", method: "GET", route: "/pay/[token]" });
    expect(sent[0].url).toBe("https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc123&sentry_version=7");
    const [, item, eventLine] = sent[0].body.split("\n");
    expect(JSON.parse(item)).toEqual({ type: "event" });
    const event = JSON.parse(eventLine);
    expect(event.exception.values[0]).toMatchObject({ type: "TypeError", value: "cannot read x" });
    expect(event.request.url).toBe("/pay/secret-token");
    expect(sent[0].body).not.toContain("reference=abc");
  });

  it("never throws when Sentry is down", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc123@o1.ingest.sentry.io/42");
    vi.stubGlobal("fetch", async () => {
      throw new Error("network");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(reportError(new Error("boom"))).resolves.toBeUndefined();
  });
});

describe("live site settings", () => {
  const good = { DATABASE_URL: "postgres://x", APP_URL: "https://app.example", CRON_SECRET: "c", SESSION_SECRET: "s" };

  it("passes a properly configured live site", () => {
    expect(productionEnvProblems(good as NodeJS.ProcessEnv).fatal).toEqual([]);
  });

  it("refuses test switches, missing secrets and plain http", () => {
    const { fatal } = productionEnvProblems({ ...good, CRON_SECRET: "", PAYMENTS_TEST_MODE: "1", ALLOW_TEST_LOGIN_CODES: "1", APP_URL: "http://app.example" } as NodeJS.ProcessEnv);
    expect(fatal).toEqual(expect.arrayContaining(["CRON_SECRET is not set.", "PAYMENTS_TEST_MODE must not be set on the live site.", "ALLOW_TEST_LOGIN_CODES must not be set on the live site.", "APP_URL must start with https://"]));
  });
});
