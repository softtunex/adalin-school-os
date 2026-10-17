import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { apiKeys, plans, schools } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { schoolFeaturesSql } from "../plans/school-features";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

/** What a key may read. Every key can read the school's own profile. */
export const API_SCOPES = {
  "students:read": "Students and their parents",
  "academics:read": "Classes and terms",
  "staff:read": "Staff",
  "fees:read": "Invoices and payments",
  "attendance:read": "Attendance",
} as const;
export type ApiScope = keyof typeof API_SCOPES;

export const MAX_API_KEYS = 10;
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Give the key a name, e.g. the system that uses it.").max(60),
  scopes: z.array(z.enum(Object.keys(API_SCOPES) as [ApiScope])).min(1, "Choose what it can read."),
});

function requireApi(access: Access) {
  requirePermission(access, "school:api");
  requireFeature(access.plan, "api_access");
}

export async function listApiKeys(db: DB, access: Access) {
  requireApi(access);
  return withTenant(db, access.school.id, (tx) =>
    tx
      .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .orderBy(sql`${apiKeys.revokedAt} is not null`, asc(apiKeys.createdAt)),
  );
}

/** Makes a key and returns it in full, once. Only its hash is stored. */
export async function createApiKey(db: DB, access: Access, input: z.infer<typeof apiKeySchema>, ip?: string | null) {
  requireApi(access);
  const key = `sosk_${randomBytes(24).toString("base64url")}`;
  await withTenant(db, access.school.id, async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(apiKeys).where(isNull(apiKeys.revokedAt));
    if (n >= MAX_API_KEYS) throw new AppError(`You can have up to ${MAX_API_KEYS} keys. Revoke one you no longer use.`, "conflict");
    await tx.insert(apiKeys).values({ schoolId: access.school.id, name: input.name, prefix: key.slice(0, 12), keyHash: hash(key), scopes: input.scopes, createdBy: access.membershipId });
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "api.key_created", summary: `Created API key "${input.name}" (${input.scopes.join(", ")})` });
  });
  return key;
}

export async function revokeApiKey(db: DB, access: Access, keyId: string, ip?: string | null) {
  requireApi(access);
  await withTenant(db, access.school.id, async (tx) => {
    const [k] = await tx.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt))).returning();
    if (!k) throw new AppError("That key wasn't found or is already revoked.", "not_found");
    await recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip }, { action: "api.key_revoked", summary: `Revoked API key "${k.name}"` });
  });
}

// ---------- Using a key ----------

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ApiContext = { schoolId: string; slug: string; keyId: string; scopes: string[] };

/** Checks the bearer key on a request. Used by every /api/v1 route. */
export async function authenticateApiKey(db: DB, authorization: string | null): Promise<ApiContext> {
  const key = authorization?.match(/^Bearer\s+(sosk_[\w-]+)$/)?.[1];
  if (!key) throw new ApiError(401, "unauthenticated", "Send your API key as: Authorization: Bearer sosk_…");
  const [row] = await db
    .select({ key: apiKeys, slug: schools.slug, status: schools.status, features: schoolFeaturesSql })
    .from(apiKeys)
    .innerJoin(schools, eq(schools.id, apiKeys.schoolId))
    .innerJoin(plans, eq(plans.key, schools.planKey))
    .where(eq(apiKeys.keyHash, hash(key)));
  if (!row || row.key.revokedAt) throw new ApiError(401, "invalid_key", "That API key isn't valid. It may have been revoked.");
  if (row.status === "suspended") throw new ApiError(403, "school_suspended", "This school's account is suspended.");
  if (!row.features.includes("api_access")) throw new ApiError(403, "plan", "The school's plan doesn't include the API.");
  if (!allow(row.key.id)) throw new ApiError(429, "rate_limited", `Slow down: up to ${PER_MINUTE} requests a minute per key.`);
  // Note when it was last used, at most once a minute.
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKeys.id, row.key.id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, new Date(Date.now() - 60_000)))));
  return { schoolId: row.key.schoolId, slug: row.slug, keyId: row.key.id, scopes: row.key.scopes };
}

export function requireScope(ctx: ApiContext, scope: ApiScope) {
  if (!ctx.scopes.includes(scope)) throw new ApiError(403, "scope", `This key can't read that. It needs the "${scope}" permission.`);
}

// A per-instance window: enough to stop a runaway script hammering one server.
const PER_MINUTE = 120;
const windows = new Map<string, { start: number; n: number }>();
function allow(keyId: string) {
  const now = Date.now();
  const w = windows.get(keyId);
  if (!w || now - w.start >= 60_000) {
    windows.set(keyId, { start: now, n: 1 });
    if (windows.size > 5000) windows.clear();
    return true;
  }
  w.n++;
  return w.n <= PER_MINUTE;
}
