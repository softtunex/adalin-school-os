import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { schools, ssoIdentities, users } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

/*
 * Single sign-on with Google and Microsoft (OpenID Connect, authorisation code with PKCE).
 *
 * Who a person is comes from the provider's permanent subject id, never the email. Google
 * accounts with a verified email are linked to the School OS login with that email on first
 * use. Microsoft accounts must be connected once from "Your account" while signed in, because
 * a Microsoft email claim isn't proof of owning the address. Nobody gets a new account this
 * way: staff are still invited by their school.
 */

export type Provider = "google" | "microsoft";
export const PROVIDERS: Record<Provider, { name: string; auth: string; token: string; userinfo: string; env: string }> = {
  google: {
    name: "Google",
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    env: "GOOGLE",
  },
  microsoft: {
    name: "Microsoft",
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userinfo: "https://graph.microsoft.com/oidc/userinfo",
    env: "MICROSOFT",
  },
};

export const isProvider = (p: string): p is Provider => p === "google" || p === "microsoft";

function credentials(provider: Provider) {
  const env = PROVIDERS[provider].env;
  const id = process.env[`${env}_CLIENT_ID`];
  const secret = process.env[`${env}_CLIENT_SECRET`];
  return id && secret ? { id, secret } : null;
}

/** The providers set up on this server: only these get a button. */
export function configuredProviders(): Provider[] {
  return (Object.keys(PROVIDERS) as Provider[]).filter((p) => credentials(p));
}

export type SsoState = { provider: Provider; state: string; verifier: string; mode: "login" | "link"; next: string };

/** Where to send the person to sign in, and what to remember (in a cookie) until they come back. */
export function startSso(provider: Provider, redirectUri: string, opts: { mode: "login" | "link"; next: string }) {
  const creds = credentials(provider);
  if (!creds) throw new AppError(`Sign-in with ${PROVIDERS[provider].name} isn't set up on this server.`, "invalid");
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL(PROVIDERS[provider].auth);
  url.search = new URLSearchParams({
    client_id: creds.id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const remember: SsoState = { provider, state, verifier, mode: opts.mode, next: opts.next };
  return { url: url.toString(), remember };
}

export type SsoProfile = { subject: string; email: string | null; emailVerified: boolean; name: string | null };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Swaps the code for tokens and asks the provider who signed in. */
export async function finishSso(provider: Provider, code: string, verifier: string, redirectUri: string, fetcher: Fetch = fetch): Promise<SsoProfile> {
  const creds = credentials(provider);
  if (!creds) throw new AppError(`Sign-in with ${PROVIDERS[provider].name} isn't set up on this server.`, "invalid");
  const tokenRes = await fetcher(PROVIDERS[provider].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: creds.id, client_secret: creds.secret, code_verifier: verifier }).toString(),
  });
  if (!tokenRes.ok) throw new AppError(`${PROVIDERS[provider].name} didn't confirm the sign-in. Please try again.`, "invalid");
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new AppError(`${PROVIDERS[provider].name} didn't confirm the sign-in. Please try again.`, "invalid");
  const infoRes = await fetcher(PROVIDERS[provider].userinfo, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) throw new AppError(`We couldn't read your ${PROVIDERS[provider].name} account. Please try again.`, "invalid");
  const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean | string; name?: string };
  if (!info.sub) throw new AppError(`We couldn't read your ${PROVIDERS[provider].name} account. Please try again.`, "invalid");
  return { subject: info.sub, email: info.email?.toLowerCase() ?? null, emailVerified: info.email_verified === true || info.email_verified === "true", name: info.name ?? null };
}

/** Which School OS login this provider account signs in to. */
export async function resolveSsoLogin(db: DB, provider: Provider, profile: SsoProfile) {
  const [linked] = await db.select({ userId: ssoIdentities.userId, id: ssoIdentities.id }).from(ssoIdentities).where(and(eq(ssoIdentities.provider, provider), eq(ssoIdentities.subject, profile.subject)));
  if (linked) {
    await db.update(ssoIdentities).set({ lastUsedAt: new Date(), email: profile.email }).where(eq(ssoIdentities.id, linked.id));
    return linked.userId;
  }
  if (provider === "microsoft") {
    throw new AppError("This Microsoft account isn't connected to School OS yet. Log in with your email and password once, then connect it under Your account.", "not_found");
  }
  if (!profile.email || !profile.emailVerified) throw new AppError("Your Google account's email isn't verified, so we can't match it to a School OS login.", "invalid");
  const [user] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${profile.email}`);
  if (!user) throw new AppError(`No School OS login uses ${profile.email}. If your school invited you, open the link in the invitation email first.`, "not_found");
  await db.insert(ssoIdentities).values({ userId: user.id, provider, subject: profile.subject, email: profile.email, lastUsedAt: new Date() });
  return user.id;
}

/** Connects a provider account to the signed-in person, from Your account. */
export async function linkSsoIdentity(db: DB, userId: string, provider: Provider, profile: SsoProfile) {
  const [existing] = await db.select().from(ssoIdentities).where(and(eq(ssoIdentities.provider, provider), eq(ssoIdentities.subject, profile.subject)));
  if (existing && existing.userId !== userId) throw new AppError(`That ${PROVIDERS[provider].name} account is already connected to another School OS login.`, "conflict");
  if (existing) return;
  const [mine] = await db.select().from(ssoIdentities).where(and(eq(ssoIdentities.userId, userId), eq(ssoIdentities.provider, provider)));
  if (mine) throw new AppError(`You already have a ${PROVIDERS[provider].name} account connected. Disconnect it first.`, "conflict");
  await db.insert(ssoIdentities).values({ userId, provider, subject: profile.subject, email: profile.email });
}

export async function listSsoIdentities(db: DB, userId: string) {
  return db.select().from(ssoIdentities).where(eq(ssoIdentities.userId, userId));
}

export async function unlinkSsoIdentity(db: DB, userId: string, identityId: string) {
  const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!u?.passwordHash) throw new AppError("Set a password first, so you can still log in.", "conflict");
  const [row] = await db.delete(ssoIdentities).where(and(eq(ssoIdentities.id, identityId), eq(ssoIdentities.userId, userId))).returning();
  if (!row) throw new AppError("That connection wasn't found.", "not_found");
}

// ---------- A school's rule ----------

export type SsoSettings = { required?: boolean; providers?: Provider[] };

/**
 * Whether a session may use this school. Proprietors are never locked out (they can always use
 * their password), nor is Adalin support; the rule needs the plan's single sign-on feature.
 */
export function ssoAllows(settings: SsoSettings, method: string, who: { isOwner: boolean; isSupport: boolean; features: readonly string[] }) {
  if (!settings.required || !settings.providers?.length) return true;
  if (who.isOwner || who.isSupport || !who.features.includes("sso")) return true;
  return (settings.providers as string[]).includes(method);
}

export async function saveSsoSettings(db: DB, access: Access, input: SsoSettings, ip?: string | null) {
  requirePermission(access, "school:sso");
  requireFeature(access.plan, "sso");
  const providers = [...new Set((input.providers ?? []).filter(isProvider))];
  if (input.required && !providers.length) throw new AppError("Choose Google, Microsoft or both.", "invalid");
  const settings: SsoSettings = { required: Boolean(input.required), providers };
  await db.update(schools).set({ ssoSettings: settings }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) =>
    recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, {
      action: "school.sso",
      summary: settings.required ? `Staff must now sign in with ${providers.map((p) => PROVIDERS[p].name).join(" or ")}` : "Staff can sign in with a password again",
    }),
  );
}
