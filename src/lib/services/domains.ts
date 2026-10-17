import { eq, sql } from "drizzle-orm";
import { cache } from "react";
import type { DB } from "../db/client";
import { plans, schools } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../errors";
import { requireFeature } from "../plans/entitlements";
import { schoolFeaturesSql } from "../plans/school-features";
import { requirePermission, type Access } from "./access";
import { recordAudit } from "./audit";

/*
 * Custom domains (Enterprise): a school uses School OS at its own address, e.g.
 * portal.yourschool.edu.ng, and on that address the school's name and logo replace ours.
 * The domain is added to our Vercel project through Vercel's API; the school points DNS at
 * Vercel; we check until it works. Without a Vercel token, Adalin connects it by hand.
 */

const HOSTNAME = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;
const RESERVED = [/\.vercel\.app$/, /(^|\.)schoolos\.ng$/, /(^|\.)adalin\./, /^localhost/];

export function normalizeDomain(raw: string) {
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (!HOSTNAME.test(d)) throw new AppError("Enter a web address like portal.yourschool.edu.ng, without https://", "invalid");
  if (RESERVED.some((r) => r.test(d))) throw new AppError("That address can't be used. Use one your school owns.", "invalid");
  return d;
}

// ---------- Vercel ----------

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type DnsRecord = { type: string; name: string; value: string };
export type DomainCheck = { live: boolean; records: DnsRecord[]; note?: string };

function vercel() {
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return null;
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  return { token, project, team };
}

export const vercelConfigured = () => Boolean(vercel());

/** The DNS records a domain needs: a CNAME for a subdomain, an A record for a bare domain. */
export function dnsFor(domain: string): DnsRecord[] {
  const parts = domain.split(".");
  // Nigerian and similar second-level suffixes: yourschool.edu.ng is a bare domain.
  const base = parts.length >= 3 && /^(com|edu|org|gov|sch|net|ac|co)\.[a-z]{2}$/.test(parts.slice(-2).join(".")) ? 3 : 2;
  if (parts.length <= base) return [{ type: "A", name: "@", value: "76.76.21.21" }];
  return [{ type: "CNAME", name: parts.slice(0, parts.length - base).join("."), value: "cname.vercel-dns.com" }];
}

async function call(fetcher: Fetch, path: string, init: RequestInit = {}) {
  const v = vercel()!;
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetcher(`https://api.vercel.com${path}${v.team ? `${sep}${v.team.slice(1)}` : ""}`, {
    ...init,
    headers: { Authorization: `Bearer ${v.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

async function vercelAdd(domain: string, fetcher: Fetch) {
  const v = vercel()!;
  const r = await call(fetcher, `/v10/projects/${v.project}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
  const code = (r.body.error as { code?: string } | undefined)?.code;
  if (!r.ok && code !== "domain_already_in_use_by_project" && code !== "domain_already_exists") {
    throw new AppError(code === "domain_taken" || code === "domain_already_in_use" ? "That address is already used by another website." : "We couldn't add that address. Check it and try again.", "invalid");
  }
}

async function vercelCheck(domain: string, fetcher: Fetch): Promise<DomainCheck> {
  const v = vercel()!;
  const info = await call(fetcher, `/v9/projects/${v.project}/domains/${domain}`);
  const verification = ((info.body.verification as { type: string; domain: string; value: string }[] | undefined) ?? []).map((x) => ({ type: x.type, name: x.domain, value: x.value }));
  if (info.body.verified === false) await call(fetcher, `/v9/projects/${v.project}/domains/${domain}/verify`, { method: "POST" });
  const config = await call(fetcher, `/v6/domains/${domain}/config`);
  const live = info.body.verified !== false && config.body.misconfigured === false;
  return { live, records: [...dnsFor(domain), ...verification] };
}

async function vercelRemove(domain: string, fetcher: Fetch) {
  const v = vercel()!;
  await call(fetcher, `/v9/projects/${v.project}/domains/${domain}`, { method: "DELETE" });
}

// ---------- The school's domain ----------

function requireDomains(access: Access) {
  requirePermission(access, "school:update");
  requirePermission(access, "school:billing");
  requireFeature(access.plan, "custom_domain");
}

export async function setCustomDomain(db: DB, access: Access, raw: string, opts: { fetch?: Fetch; ip?: string | null } = {}) {
  requireDomains(access);
  const domain = normalizeDomain(raw);
  const [taken] = await db.select({ id: schools.id }).from(schools).where(sql`lower(${schools.customDomain}) = ${domain}`);
  if (taken && taken.id !== access.school.id) throw new AppError("Another school already uses that address.", "conflict");
  if (access.school.customDomain && access.school.customDomain !== domain && vercelConfigured()) await vercelRemove(access.school.customDomain, opts.fetch ?? fetch);
  if (vercelConfigured()) await vercelAdd(domain, opts.fetch ?? fetch);
  await db.update(schools).set({ customDomain: domain, domainVerifiedAt: null }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) => recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip: opts.ip }, { action: "school.domain", summary: `Set the school's web address to ${domain}` }));
  return domain;
}

/** Asks whether DNS is right yet. Marks the domain live the first time it is. */
export async function checkCustomDomain(db: DB, access: Access, opts: { fetch?: Fetch } = {}): Promise<DomainCheck> {
  requireDomains(access);
  const domain = access.school.customDomain;
  if (!domain) throw new AppError("Add an address first.", "conflict");
  if (!vercelConfigured()) return { live: Boolean(access.school.domainVerifiedAt), records: dnsFor(domain), note: "Adalin connects new addresses by hand for now; we'll let you know when it's live." };
  const result = await vercelCheck(domain, opts.fetch ?? fetch);
  if (result.live && !access.school.domainVerifiedAt) await db.update(schools).set({ domainVerifiedAt: new Date() }).where(eq(schools.id, access.school.id));
  if (!result.live && access.school.domainVerifiedAt) await db.update(schools).set({ domainVerifiedAt: null }).where(eq(schools.id, access.school.id));
  return result;
}

export async function removeCustomDomain(db: DB, access: Access, opts: { fetch?: Fetch; ip?: string | null } = {}) {
  requireDomains(access);
  const domain = access.school.customDomain;
  if (!domain) return;
  if (vercelConfigured()) await vercelRemove(domain, opts.fetch ?? fetch);
  await db.update(schools).set({ customDomain: null, domainVerifiedAt: null }).where(eq(schools.id, access.school.id));
  await withTenant(db, access.school.id, (tx) => recordAudit(tx, access.school.id, { userId: access.user.id, name: access.user.name, ip: opts.ip }, { action: "school.domain", summary: `Stopped using ${domain}` }));
}

/** Adalin marks a hand-connected domain live from the admin console. */
export async function markDomainLive(db: DB, schoolId: string) {
  await db.update(schools).set({ domainVerifiedAt: new Date() }).where(eq(schools.id, schoolId));
}

// ---------- Serving a request on a school's own address ----------

export type HostSchool = { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null; features: string[] };

/** The school whose live custom domain this is, if any. Cached per request. */
export const schoolForHost = cache(async (db: DB, host: string | null): Promise<HostSchool | null> => {
  const domain = host?.toLowerCase().replace(/:\d+$/, "");
  if (!domain || !domain.includes(".") || domain.endsWith(".vercel.app")) return null;
  const [row] = await db
    .select({ id: schools.id, name: schools.name, slug: schools.slug, logoUrl: schools.logoUrl, brandColor: schools.brandColor, features: schoolFeaturesSql })
    .from(schools)
    .innerJoin(plans, eq(plans.key, schools.planKey))
    .where(sql`lower(${schools.customDomain}) = ${domain} and ${schools.domainVerifiedAt} is not null`);
  if (!row || !row.features.includes("custom_domain")) return null;
  return row;
});
