import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE } from "../config";
import { AppError } from "../errors";
import { getDb } from "../db/client";
import { createSession, getUserBySessionToken, revokeSession } from "../services/accounts";
import { can, loadAccess } from "../services/access";
import type { Permission } from "../rbac/permissions";

export async function requestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

export async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(getDb(), userId, await requestMeta());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserBySessionToken(getDb(), token);
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

const loadSchoolAccess = cache(async (slug: string) => {
  const user = await requireUser();
  const access = await loadAccess(getDb(), user.id, slug);
  if (!access) notFound();
  return access;
});

export const READ_ONLY_MESSAGE = "Your school is read-only until the overdue School OS bill is paid. A proprietor can pay it under Settings, Plan & billing.";

/**
 * The signed-in user's access to a school. 404s for non-members so school slugs can't be probed.
 * While the school is read-only for an unpaid bill, changes (server actions) are refused and
 * viewing carries on; paying the bill passes allowReadOnly.
 */
export async function requireAccess(slug: string, opts: { allowReadOnly?: boolean } = {}) {
  const access = await loadSchoolAccess(slug);
  if (access.school.status === "read_only" && !opts.allowReadOnly && (await headers()).has("next-action")) throw new AppError(READ_ONLY_MESSAGE, "forbidden");
  return access;
}

/** For pages: a missing permission looks the same as a missing page. */
export async function requirePageAccess(slug: string, anyOf: Permission[]) {
  const access = await requireAccess(slug);
  if (!anyOf.some((p) => can(access, p))) notFound();
  return access;
}

/** Only allows same-site relative paths, so a crafted ?next= can't bounce users to another site. */
export function safeNext(next: unknown, fallback = "/schools"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
