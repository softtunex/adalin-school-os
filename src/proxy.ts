import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/config";

// Cheap cookie-presence check so signed-out visitors go straight to login.
// Real session validation happens on the server in every page and action.
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/s/:path*", "/schools/:path*", "/account"],
};
