import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/client";
import { schools, webhookDeliveries, webhooks } from "@/lib/db/schema";
import { loadAccess, type Access } from "@/lib/services/access";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { getAcademicOverview, setupAcademics } from "@/lib/services/academics";
import { ApiError, authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "@/lib/services/api-keys";
import { apiInvoices, apiSchool, apiStudent, apiStudents } from "@/lib/services/public-api";
import { createStudent, setStudentStatus, studentInputSchema } from "@/lib/services/students";
import { assertDeliverable, createWebhook, drainWebhooks, isPrivateAddress, listWebhooks, signPayload, testWebhook } from "@/lib/services/webhooks";
import { createTestDatabase } from "./helpers";

let database: Database;
let owner: Access;
let other: Access;
let classId: string;

async function school(name: string, email: string) {
  const r = await registerSchoolOwner(database.db, { name: "Owner", email, password: "ApiTest123", schoolName: name });
  await database.db.update(schools).set({ planKey: "enterprise" }).where(eq(schools.id, r.school.id));
  const access = (await loadAccess(database.db, r.user.id, r.school.slug))!;
  await setupAcademics(database.db, access, { template: "nigerian", sections: ["junior_secondary"], arms: ["Gold"], sessionName: "2026/2027" });
  return access;
}

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    return e instanceof ApiError ? e.status : 500;
  }
};

beforeAll(async () => {
  database = await createTestDatabase();
  owner = await school("Api College", "owner@api.test");
  other = await school("Other Api College", "other@api.test");
  classId = (await getAcademicOverview(database.db, owner)).levels[0].classes[0].id;
  const otherClass = (await getAcademicOverview(database.db, other)).levels[0].classes[0].id;
  await createStudent(database.db, other, studentInputSchema.parse({ firstName: "Hidden", lastName: "Elsewhere", gender: "male", classId: otherClass }), []);
});

afterAll(async () => {
  await database.close();
});

describe("API keys", () => {
  let key: string;

  it("are an Enterprise feature for the proprietor", async () => {
    const basic = { ...owner, plan: { ...owner.plan, features: owner.plan.features.filter((f) => f !== "api_access") } };
    await expect(createApiKey(database.db, basic, { name: "SIS", scopes: ["students:read"] })).rejects.toThrow();
  });

  it("are shown once and stored as a hash", async () => {
    key = await createApiKey(database.db, owner, { name: "Website", scopes: ["students:read"] });
    expect(key).toMatch(/^sosk_[\w-]{32}$/);
    const [listed] = await listApiKeys(database.db, owner);
    expect(listed.prefix).toBe(key.slice(0, 12));
    expect(JSON.stringify(listed)).not.toContain(key);
  });

  it("read only the key's own school, within its scopes", async () => {
    expect(await status(authenticateApiKey(database.db, null))).toBe(401);
    expect(await status(authenticateApiKey(database.db, "Bearer sosk_not-a-real-key"))).toBe(401);
    const ctx = await authenticateApiKey(database.db, `Bearer ${key}`);
    expect((await apiSchool(database.db, ctx)).data.name).toBe("Api College");
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: "Ngozi", lastName: "Api", gender: "female", classId }), []);
    const list = await apiStudents(database.db, ctx, new URLSearchParams());
    expect(list.data.map((x) => x.first_name)).toEqual(["Ngozi"]);
    expect(list.total).toBe(1);
    expect((await apiStudent(database.db, ctx, s.id)).data.parents).toEqual([]);
    const hidden = (await apiStudents(database.db, await authenticateApiKey(database.db, `Bearer ${await createApiKey(database.db, other, { name: "x", scopes: ["students:read"] })}`), new URLSearchParams())).data[0];
    expect(await status(apiStudent(database.db, ctx, hidden.id))).toBe(404);
    expect(await status(apiInvoices(database.db, ctx, new URLSearchParams()))).toBe(403);
    expect(await status(apiStudents(database.db, ctx, new URLSearchParams("status=expelled")))).toBe(400);
  });

  it("stop working when revoked", async () => {
    const [k] = await listApiKeys(database.db, owner);
    await revokeApiKey(database.db, owner, k.id);
    expect(await status(authenticateApiKey(database.db, `Bearer ${key}`))).toBe(401);
  });
});

describe("webhooks", () => {
  const sent: { url: string; headers: Record<string, string>; body: string }[] = [];
  const ok = async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    return { status: 200 };
  };
  let secret: string;

  it("tell the school's system about a new student, signed", async () => {
    ({ secret } = await createWebhook(database.db, owner, { url: "https://hooks.example.test/school-os", events: ["student.created", "student.status_changed"] }));
    expect(secret).toMatch(/^whsec_/);
    const s = await createStudent(database.db, owner, studentInputSchema.parse({ firstName: "Tobi", lastName: "Hook", gender: "male", classId }), []);
    expect(await drainWebhooks(database.db, { send: ok })).toEqual({ sent: 1, failed: 0 });
    const [d] = sent;
    expect(d.headers["X-SchoolOS-Event"]).toBe("student.created");
    const [, t, v1] = d.headers["X-SchoolOS-Signature"].match(/^t=(\d+),v1=([0-9a-f]{64})$/)!;
    expect(v1).toBe(signPayload(secret, Number(t), d.body));
    const body = JSON.parse(d.body);
    expect(body).toMatchObject({ event: "student.created", data: { id: s.id, first_name: "Tobi" } });
    await setStudentStatus(database.db, owner, s.id, "withdrawn");
    await drainWebhooks(database.db, { send: ok });
    expect(JSON.parse(sent[1].body).data).toMatchObject({ status: "withdrawn", previous_status: "active" });
  });

  it("retry later when the receiver fails, and record why", async () => {
    await createStudent(database.db, owner, studentInputSchema.parse({ firstName: "Retry", lastName: "Hook", gender: "male", classId }), []);
    expect(await drainWebhooks(database.db, { send: async () => ({ status: 503 }) })).toEqual({ sent: 0, failed: 0 });
    const [d] = await database.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.status, "pending"));
    expect(d.attempts).toBe(1);
    expect(d.error).toBe("The address answered 503.");
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    const [h] = await database.db.select().from(webhooks);
    expect(h.failures).toBe(1);
    // Not due yet: nothing goes out.
    expect(await drainWebhooks(database.db, { send: ok })).toEqual({ sent: 0, failed: 0 });
  });

  it("send a test ping on request", async () => {
    const [h] = await listWebhooks(database.db, owner);
    expect(h.secretHint).toMatch(/^whsec_.{4}…$/);
    const d = await testWebhook(database.db, owner, h.id, { send: ok });
    expect(d.status).toBe("sent");
    expect(sent.at(-1)?.headers["X-SchoolOS-Event"]).toBe("ping");
  });

  it("only go to the public internet", async () => {
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("102.89.1.1")).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCAL_DB", "");
    try {
      await expect(assertDeliverable("http://example.com/x")).rejects.toThrow(/https/);
      await expect(assertDeliverable("https://internal.example/x", async () => ["10.0.0.5"])).rejects.toThrow(/private network/);
      await expect(assertDeliverable("https://hooks.example/x", async () => ["102.89.1.1"])).resolves.toBeInstanceOf(URL);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
