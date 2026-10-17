import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl, getCurrentUser, safeNext, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { userMessage } from "@/lib/errors";
import { finishSso, isProvider, linkSsoIdentity, PROVIDERS, resolveSsoLogin, type SsoState } from "@/lib/services/sso";
import { SSO_COOKIE, ssoFailed } from "../../shared";

/** Google or Microsoft sends the person back here with a code. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  const jar = await cookies();
  let remembered: SsoState | null = null;
  try {
    remembered = JSON.parse(jar.get(SSO_COOKIE)?.value ?? "null") as SsoState | null;
  } catch {
    remembered = null;
  }
  jar.delete({ name: SSO_COOKIE, path: "/api/auth/sso" });
  const mode = remembered?.mode ?? "login";
  const sp = new URL(request.url).searchParams;
  if (sp.get("error")) return ssoFailed(mode, `${PROVIDERS[provider].name} sign-in was cancelled.`);
  const code = sp.get("code");
  if (!remembered || remembered.provider !== provider || !code || sp.get("state") !== remembered.state) {
    return ssoFailed(mode, "That sign-in link has expired. Please try again.");
  }
  const base = await appUrl();
  try {
    const profile = await finishSso(provider, code, remembered.verifier, `${base}/api/auth/sso/${provider}/callback`);
    const db = getDb();
    if (mode === "link") {
      const user = await getCurrentUser();
      if (!user) return ssoFailed("login", "Log in first, then connect your account.");
      await linkSsoIdentity(db, user.id, provider, profile);
      return NextResponse.redirect(`${base}/account?sso=connected`, 302);
    }
    const userId = await resolveSsoLogin(db, provider, profile);
    await startSession(userId, provider);
    return NextResponse.redirect(`${base}${safeNext(remembered.next)}`, 302);
  } catch (error) {
    return ssoFailed(mode, userMessage(error));
  }
}
