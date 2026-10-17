import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { loadAccess, type Access } from "@/lib/services/access";
import { createSession, getSessionByToken, registerSchoolOwner } from "@/lib/services/accounts";
import { configuredProviders, finishSso, linkSsoIdentity, listSsoIdentities, resolveSsoLogin, saveSsoSettings, ssoAllows, startSso, unlinkSsoIdentity } from "@/lib/services/sso";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let otherUserId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  const a = await registerSchoolOwner(database.db, { name: "Mrs Single", email: "Single@SSO.test", password: "SsoTest123", schoolName: "Sso College" });
  owner = (await loadAccess(database.db, a.user.id, a.school.slug))!;
  otherUserId = (await registerSchoolOwner(database.db, { name: "Mr Other", email: "other@sso.test", password: "SsoTest123", schoolName: "Other Sso College" })).user.id;
});

afterAll(async () => {
  await database.close();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const google = (sub: string, email: string, verified = true) => ({ subject: sub, email, emailVerified: verified, name: "Someone" });

describe("starting and finishing", () => {
  it("only offers providers the server has set up", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    expect(configuredProviders()).toEqual([]);
    expect(() => startSso("google", "https://x/cb", { mode: "login", next: "/" })).toThrow(/isn't set up/);
  });

  it("sends people to the provider with PKCE and a state", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "gid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "gsecret");
    const { url, remember } = startSso("google", "https://school.example/api/auth/sso/google/callback", { mode: "login", next: "/schools" });
    const u = new URL(url);
    expect(u.origin).toBe("https://accounts.google.com");
    expect(u.searchParams.get("state")).toBe(remember.state);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).not.toBe(remember.verifier);
    expect(u.searchParams.get("client_secret")).toBeNull();
  });

  it("reads who signed in from the provider", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "gid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "gsecret");
    const calls: string[] = [];
    const fake = async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes("token")) {
        expect(String(init?.body)).toContain("code_verifier=v1");
        return Response.json({ access_token: "at" });
      }
      return Response.json({ sub: "g-123", email: "Ada@Example.com", email_verified: true, name: "Ada" });
    };
    expect(await finishSso("google", "code", "v1", "https://x/cb", fake)).toEqual({ subject: "g-123", email: "ada@example.com", emailVerified: true, name: "Ada" });
    expect(calls).toHaveLength(2);
    await expect(finishSso("google", "code", "v1", "https://x/cb", async () => new Response("no", { status: 400 }))).rejects.toThrow(/didn't confirm/);
  });
});

describe("matching a login", () => {
  it("links a verified Google email to the existing login, then uses the link", async () => {
    expect(await resolveSsoLogin(database.db, "google", google("g-1", "single@sso.test"))).toBe(owner.user.id);
    // Same Google account, email since changed: the permanent id still finds them.
    expect(await resolveSsoLogin(database.db, "google", google("g-1", "renamed@elsewhere.test"))).toBe(owner.user.id);
  });

  it("refuses unverified emails, unknown people and unconnected Microsoft accounts", async () => {
    await expect(resolveSsoLogin(database.db, "google", google("g-2", "other@sso.test", false))).rejects.toThrow(/isn't verified/);
    await expect(resolveSsoLogin(database.db, "google", google("g-3", "nobody@sso.test"))).rejects.toThrow(/No School OS login/);
    await expect(resolveSsoLogin(database.db, "microsoft", google("m-1", "other@sso.test"))).rejects.toThrow(/isn't connected/);
  });

  it("connects Microsoft from Your account, once, to one login", async () => {
    await linkSsoIdentity(database.db, otherUserId, "microsoft", google("m-1", "other@sso.test"));
    expect(await resolveSsoLogin(database.db, "microsoft", google("m-1", "other@sso.test"))).toBe(otherUserId);
    await expect(linkSsoIdentity(database.db, owner.user.id, "microsoft", google("m-1", "x"))).rejects.toThrow(/another School OS login/);
    const [identity] = (await listSsoIdentities(database.db, otherUserId)).filter((i) => i.provider === "microsoft");
    await unlinkSsoIdentity(database.db, otherUserId, identity.id);
    await expect(resolveSsoLogin(database.db, "microsoft", google("m-1", "other@sso.test"))).rejects.toThrow(/isn't connected/);
  });

  it("remembers how a session signed in", async () => {
    const { token } = await createSession(database.db, owner.user.id, { method: "google" });
    expect((await getSessionByToken(database.db, token))?.method).toBe("google");
  });
});

describe("a school's rule", () => {
  const who = { isOwner: false, isSupport: false, features: ["sso"] };
  it("keeps password users out when required, except proprietors and support", () => {
    const rule = { required: true, providers: ["google" as const] };
    expect(ssoAllows(rule, "password", who)).toBe(false);
    expect(ssoAllows(rule, "microsoft", who)).toBe(false);
    expect(ssoAllows(rule, "google", who)).toBe(true);
    expect(ssoAllows(rule, "password", { ...who, isOwner: true })).toBe(true);
    expect(ssoAllows(rule, "password", { ...who, isSupport: true })).toBe(true);
    expect(ssoAllows(rule, "password", { ...who, features: [] })).toBe(true);
    expect(ssoAllows({}, "password", who)).toBe(true);
  });

  it("is set by the proprietor on Enterprise", async () => {
    await expect(saveSsoSettings(database.db, owner, { required: true, providers: ["google"] })).rejects.toThrow();
    await database.db.update(schools).set({ planKey: "enterprise" }).where(eq(schools.id, owner.school.id));
    const ent = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
    await expect(saveSsoSettings(database.db, ent, { required: true, providers: [] })).rejects.toThrow(/Choose Google/);
    await saveSsoSettings(database.db, ent, { required: true, providers: ["google"] });
    expect((await loadAccess(database.db, owner.user.id, owner.school.slug))!.school.ssoSettings).toEqual({ required: true, providers: ["google"] });
  });
});
