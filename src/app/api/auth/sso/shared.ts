import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/auth/session";

export const SSO_COOKIE = "sos_sso";
/** A failed sign-in's reason, read once by the login or account page. Never put in the address. */
export const SSO_ERROR_COOKIE = "sos_sso_error";

export async function ssoFailed(mode: "login" | "link", message: string) {
  (await cookies()).set(SSO_ERROR_COOKIE, message.slice(0, 300), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 });
  return NextResponse.redirect(`${await appUrl()}${mode === "link" ? "/account?sso=failed" : "/login?sso=failed"}`, 302);
}
