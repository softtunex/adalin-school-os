import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl, safeNext } from "@/lib/auth/session";
import { userMessage } from "@/lib/errors";
import { isProvider, startSso } from "@/lib/services/sso";
import { SSO_COOKIE, ssoFailed } from "../../shared";

/** Sends the person to Google or Microsoft. ?mode=link connects the account to the signed-in login instead. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  const sp = new URL(request.url).searchParams;
  const mode = sp.get("mode") === "link" ? "link" : "login";
  try {
    const { url, remember } = startSso(provider, `${await appUrl()}/api/auth/sso/${provider}/callback`, { mode, next: safeNext(sp.get("next")) });
    (await cookies()).set(SSO_COOKIE, JSON.stringify(remember), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/sso", maxAge: 600 });
    return NextResponse.redirect(url, 302);
  } catch (error) {
    return ssoFailed(mode, userMessage(error));
  }
}
