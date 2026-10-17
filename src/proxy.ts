import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/config";
import { contentSecurityPolicy } from "./lib/security/headers";

// Pages that need a signed-in person. A cheap cookie-presence check sends signed-out visitors
// straight to login; real session validation happens on the server in every page and action.
const SIGNED_IN = [/^\/s\//, /^\/schools(\/|$)/, /^\/account$/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // A fresh nonce per page: Next.js reads it from the request's policy and stamps it on its scripts.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  if (SIGNED_IN.some((r) => r.test(pathname)) && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not API routes, files, or static assets.
      source: "/((?!api|_next/static|_next/image|favicon.ico|uploads|illustrations|files|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|xml|webmanifest|js)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
