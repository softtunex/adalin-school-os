import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { loginAttempts, notifications, outboundMessages, passwordResets, schools, sessions } from "@/lib/db/schema";
import { TERMS_VERSION } from "@/lib/legal";
import { registerSchoolOwner } from "@/lib/services/accounts";
import { purgeExpiredData, REMOVED_BODY } from "@/lib/services/retention";
import { createTestDatabase } from "./helpers";

let database: Database;
let schoolId: string;
let userId: string;
const days = (n: number) => new Date(Date.now() - n * 86_400_000);

beforeAll(async () => {
  database = await createTestDatabase();
  const r = await registerSchoolOwner(database.db, { name: "Mrs Keep", email: "keep@retention.test", password: "Retain1234", schoolName: "Retention College" });
  schoolId = r.school.id;
  userId = r.user.id;
});

afterAll(async () => {
  await database.close();
});

describe("NDPA", () => {
  it("records that the school accepted the terms, which version, and who", async () => {
    const [s] = await database.db.select().from(schools).where(eq(schools.id, schoolId));
    expect(s.termsVersion).toBe(TERMS_VERSION);
    expect(s.termsAcceptedBy).toBe(userId);
    expect(s.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("deletes data past its retention period and keeps the rest", async () => {
    const { db } = database;
    await db.insert(sessions).values([
      { tokenHash: "old-session", userId, expiresAt: days(31) },
      { tokenHash: "live-session", userId, expiresAt: days(-10) },
    ]);
    await db.insert(loginAttempts).values([
      { key: "old", succeeded: false, createdAt: days(40) },
      { key: "new", succeeded: false },
    ]);
    await db.insert(passwordResets).values([
      { tokenHash: "old-reset", userId, expiresAt: days(8) },
      { tokenHash: "new-reset", userId, expiresAt: days(-1) },
    ]);
    await db.insert(outboundMessages).values([
      { schoolId, channel: "sms", to: "+2348030000000", body: "Your child was absent today.", kind: "absence", status: "sent", createdAt: days(200) },
      { schoolId, channel: "sms", to: "+2348030000000", body: "Fees reminder", kind: "fees", status: "sent", createdAt: days(10) },
    ]);
    await db.insert(notifications).values([
      { schoolId, userId, kind: "x", title: "Old", createdAt: days(400) },
      { schoolId, userId, kind: "x", title: "New" },
    ]);

    const report = await purgeExpiredData(db);
    expect(report).toMatchObject({ sessions: 1, loginAttempts: 1, passwordResets: 1, messageText: 1, notifications: 1 });

    expect((await db.select().from(sessions)).map((s) => s.tokenHash)).toContain("live-session");
    expect((await db.select().from(sessions)).map((s) => s.tokenHash)).not.toContain("old-session");
    const msgs = await db.select().from(outboundMessages).where(eq(outboundMessages.schoolId, schoolId));
    expect(msgs.map((m) => m.body).sort()).toEqual(["Fees reminder", REMOVED_BODY].sort());
    expect((await db.select().from(notifications)).map((n) => n.title)).toEqual(["New"]);

    // Running again changes nothing.
    expect(Object.values(await purgeExpiredData(db)).every((n) => n === 0)).toBe(true);
  });
});
