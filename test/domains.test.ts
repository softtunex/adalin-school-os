import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/client";
import { schools } from "@/lib/db/schema";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { checkCustomDomain, dnsFor, normalizeDomain, removeCustomDomain, schoolForHost, setCustomDomain } from "@/lib/services/domains";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let other: Access;

async function enterpriseOwner(name: string, email: string) {
  const r = await registerSchoolOwner(database.db, { name: "Owner", email, password: "Domains123", schoolName: name });
  await database.db.update(schools).set({ planKey: "enterprise" }).where(eq(schools.id, r.school.id));
  return (await loadAccess(database.db, r.user.id, r.school.slug))!;
}
const reload = async () => {
  owner = (await loadAccess(database.db, owner.user.id, owner.school.slug))!;
};

beforeAll(async () => {
  database = await createTestDatabase();
  owner = await enterpriseOwner("Domain College", "owner@domains.test");
  other = await enterpriseOwner("Other Domain College", "other@domains.test");
});

afterAll(async () => {
  await database.close();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("addresses", () => {
  it("are cleaned up and checked", () => {
    expect(normalizeDomain(" https://Portal.Example-School.edu.ng/login ")).toBe("portal.example-school.edu.ng");
    expect(() => normalizeDomain("not a domain")).toThrow(/web address/);
    expect(() => normalizeDomain("myschool.vercel.app")).toThrow(/can't be used/);
    // Adalin's own addresses, including the live site, can't be claimed by a school.
    for (const ours of ["schoolhub.adalintech.com", "portal.adalintech.com", "adalintechnologies.com", "app.adalinschoolhub.com"]) {
      expect(() => normalizeDomain(ours)).toThrow(/can't be used/);
    }
    expect(normalizeDomain("portal.adalintechcollege.edu.ng")).toBe("portal.adalintechcollege.edu.ng");
  });

  it("get the right DNS record", () => {
    expect(dnsFor("portal.example-school.edu.ng")).toEqual([{ type: "CNAME", name: "portal", value: "cname.vercel-dns.com" }]);
    expect(dnsFor("app.portal.example-school.com")).toEqual([{ type: "CNAME", name: "app.portal", value: "cname.vercel-dns.com" }]);
    expect(dnsFor("example-school.edu.ng")).toEqual([{ type: "A", name: "@", value: "76.76.21.21" }]);
    expect(dnsFor("example-school.com")).toEqual([{ type: "A", name: "@", value: "76.76.21.21" }]);
  });
});

describe("a school's own address", () => {
  it("is added to Vercel, and goes live once DNS works", async () => {
    vi.stubEnv("VERCEL_TOKEN", "tok");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj");
    vi.stubEnv("VERCEL_TEAM_ID", "team");
    const calls: string[] = [];
    let dnsReady = false;
    const fake = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      if (url.includes("/config")) return Response.json({ misconfigured: !dnsReady });
      if (url.includes("/verify")) return Response.json({});
      if (init?.method === "POST") return Response.json({ name: "portal.domain.edu.ng" });
      return Response.json({ verified: true });
    };
    await setCustomDomain(database.db, owner, "portal.domain.edu.ng", { fetch: fake });
    expect(calls[0]).toBe("POST https://api.vercel.com/v10/projects/prj/domains?teamId=team");
    await reload();
    expect(await schoolForHost(database.db, "portal.domain.edu.ng")).toBeNull();
    expect((await checkCustomDomain(database.db, owner, { fetch: fake })).live).toBe(false);
    dnsReady = true;
    expect((await checkCustomDomain(database.db, owner, { fetch: fake })).live).toBe(true);
    expect((await schoolForHost(database.db, "Portal.Domain.edu.ng:443"))?.name).toBe("Domain College");
  });

  it("belongs to one school only", async () => {
    await expect(setCustomDomain(database.db, other, "portal.domain.edu.ng")).rejects.toThrow(/Another school/);
  });

  it("is saved for Adalin to connect when Vercel isn't set up", async () => {
    vi.stubEnv("VERCEL_TOKEN", "");
    await setCustomDomain(database.db, other, "app.other.sch.ng");
    other = (await loadAccess(database.db, other.user.id, other.school.slug))!;
    const r = await checkCustomDomain(database.db, other);
    expect(r.note).toMatch(/Adalin connects/);
    expect(r.live).toBe(false);
  });

  it("stops serving the school when removed, or when the plan loses the feature", async () => {
    await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, owner.school.id));
    expect(await schoolForHost(database.db, "portal.domain.edu.ng")).toBeNull();
    await database.db.update(schools).set({ planKey: "enterprise" }).where(eq(schools.id, owner.school.id));
    await reload();
    vi.stubEnv("VERCEL_TOKEN", "");
    await removeCustomDomain(database.db, owner);
    expect(await schoolForHost(database.db, "portal.domain.edu.ng")).toBeNull();
  });
});
