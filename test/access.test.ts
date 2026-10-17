import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/client";
import { plans, roles, schools } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import {
  authenticate,
  createPasswordReset,
  createSession,
  getUserBySessionToken,
  registerSchoolOwner,
  resetPassword,
} from "@/lib/services/accounts";
import { can, loadAccess, type Access } from "@/lib/services/access";
import { createCustomRole, listRoles } from "@/lib/services/roles";
import { acceptInvitation, inviteStaff, listStaff, setMemberRoles, setMemberStatus } from "@/lib/services/staff";
import { listAuditLog } from "@/lib/services/audit-log";
import { createTestDatabase } from "./helpers";

let database: Database;
let ownerAccess: Access;
let slug: string;

async function roleId(schoolId: string, key: string) {
  const [r] = await withTenant(database.db, schoolId, (tx) => tx.select().from(roles).where(eq(roles.key, key)));
  return r.id;
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { user, school } = await registerSchoolOwner(database.db, {
    name: "Mrs Adeyemi",
    email: "owner@adalin.test",
    password: "Adalin2026",
    schoolName: "Adalin College",
  });
  slug = school.slug;
  ownerAccess = (await loadAccess(database.db, user.id, slug))!;
});

afterAll(async () => {
  await database.close();
});

describe("registration and login", () => {
  it("creates a school with a slug and the owner as Proprietor", () => {
    expect(slug).toBe("adalin-college");
    expect(ownerAccess.roles.map((r) => r.key)).toEqual(["owner"]);
    expect(can(ownerAccess, "school:billing")).toBe(true);
  });

  it("refuses a duplicate email", async () => {
    await expect(
      registerSchoolOwner(database.db, { name: "X", email: "OWNER@adalin.test", password: "abc12345", schoolName: "Other" }),
    ).rejects.toThrow(/already exists/);
  });

  it("logs in with the right password and creates a working session", async () => {
    const user = await authenticate(database.db, "owner@adalin.test", "Adalin2026", "1.1.1.1");
    const { token } = await createSession(database.db, user.id);
    expect((await getUserBySessionToken(database.db, token))?.id).toBe(user.id);
    expect(await getUserBySessionToken(database.db, "forged-token")).toBeNull();
  });

  it("locks an account after repeated failures", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(authenticate(database.db, "victim@x.test", "wrong", "2.2.2.2")).rejects.toThrow(/don't match/);
    }
    await expect(authenticate(database.db, "victim@x.test", "wrong", "2.2.2.2")).rejects.toThrow(/Too many/);
  });

  it("resets a password once, and kills existing sessions", async () => {
    const user = await authenticate(database.db, "owner@adalin.test", "Adalin2026", null);
    const { token: sessionToken } = await createSession(database.db, user.id);
    const reset = await createPasswordReset(database.db, "owner@adalin.test");
    await resetPassword(database.db, reset!.token, "NewPassword9");
    await expect(resetPassword(database.db, reset!.token, "Another99")).rejects.toThrow(/expired/);
    expect(await getUserBySessionToken(database.db, sessionToken)).toBeNull();
    await authenticate(database.db, "owner@adalin.test", "NewPassword9", null);
    expect(await createPasswordReset(database.db, "nobody@x.test")).toBeNull();
  });

  it("sends at most three reset emails an hour, quietly", async () => {
    // One was already sent in the test above.
    expect(await createPasswordReset(database.db, "owner@adalin.test")).not.toBeNull();
    expect(await createPasswordReset(database.db, "owner@adalin.test")).not.toBeNull();
    expect(await createPasswordReset(database.db, "owner@adalin.test")).toBeNull();
  });
});

describe("staff, roles and permissions", () => {
  let teacherAccess: Access;

  it("invites a teacher who then only gets teacher permissions", async () => {
    const teacherRole = await roleId(ownerAccess.school.id, "subject_teacher");
    const { token } = await inviteStaff(database.db, ownerAccess, {
      name: "Mr Okon",
      email: "okon@adalin.test",
      roleIds: [teacherRole],
    });
    const { userId } = await acceptInvitation(database.db, token, { name: "Mr Okon", password: "Teacher2026" });
    teacherAccess = (await loadAccess(database.db, userId, slug))!;
    expect(can(teacherAccess, "results:enter")).toBe(true);
    expect(can(teacherAccess, "fees:view")).toBe(false);
    expect(can(teacherAccess, "staff:invite")).toBe(false);
    await expect(acceptInvitation(database.db, token, { name: "Again", password: "Again2026" })).rejects.toThrow(/expired/);
  });

  it("stops a teacher from managing staff", async () => {
    await expect(listStaff(database.db, teacherAccess)).rejects.toThrow(/permission/);
    await expect(
      inviteStaff(database.db, teacherAccess, { name: "X", email: "x@x.test", roleIds: [] }),
    ).rejects.toThrow(/permission/);
  });

  it("stops a principal from granting the Proprietor role", async () => {
    const principalRole = await roleId(ownerAccess.school.id, "principal");
    const ownerRole = await roleId(ownerAccess.school.id, "owner");
    const { token } = await inviteStaff(database.db, ownerAccess, {
      name: "Dr Bello",
      email: "bello@adalin.test",
      roleIds: [principalRole],
    });
    const { userId } = await acceptInvitation(database.db, token, { name: "Dr Bello", password: "Principal2026" });
    const principal = (await loadAccess(database.db, userId, slug))!;
    await expect(
      setMemberRoles(database.db, principal, teacherAccess.membershipId, [ownerRole]),
    ).rejects.toThrow(/permissions you don't have/);
    await expect(setMemberStatus(database.db, principal, ownerAccess.membershipId, "deactivated")).rejects.toThrow(
      /permissions you don't have/,
    );
  });

  it("never lets the last Proprietor lose the role", async () => {
    const principalRole = await roleId(ownerAccess.school.id, "principal");
    await expect(
      setMemberRoles(database.db, ownerAccess, ownerAccess.membershipId, [principalRole]),
    ).rejects.toThrow(/at least one Proprietor/);
  });

  it("enforces the Free plan's 5-staff limit", async () => {
    const teacherRole = await roleId(ownerAccess.school.id, "subject_teacher");
    // owner + teacher + principal = 3 used, 2 more allowed
    await inviteStaff(database.db, ownerAccess, { name: "T4", email: "t4@g.test", roleIds: [teacherRole] });
    await inviteStaff(database.db, ownerAccess, { name: "T5", email: "t5@g.test", roleIds: [teacherRole] });
    await expect(
      inviteStaff(database.db, ownerAccess, { name: "T6", email: "t6@g.test", roleIds: [teacherRole] }),
    ).rejects.toThrow(/allows 5/);
  });

  it("deactivated staff lose access", async () => {
    await setMemberStatus(database.db, ownerAccess, teacherAccess.membershipId, "deactivated");
    expect(await loadAccess(database.db, teacherAccess.user.id, slug)).toBeNull();
  });

  it("gates custom roles and the audit log by plan", async () => {
    await expect(
      createCustomRole(database.db, ownerAccess, { name: "Exams officer", description: "", permissions: ["results:view"] }),
    ).rejects.toThrow(/Premium plan/);
    await expect(listAuditLog(database.db, ownerAccess)).rejects.toThrow(/Standard plan/);

    await database.db.update(schools).set({ planKey: "premium" }).where(eq(schools.id, ownerAccess.school.id));
    const upgraded = (await loadAccess(database.db, ownerAccess.user.id, slug))!;
    const role = await createCustomRole(database.db, upgraded, {
      name: "Exams officer",
      description: "Runs exams",
      permissions: ["results:view", "results:pins", "not:a_permission"],
    });
    expect(role.permissions).toEqual(["results:view", "results:pins"]);
    const all = await listRoles(database.db, upgraded);
    expect(all.find((r) => r.key === "owner")?.memberCount).toBe(1);
    const log = await listAuditLog(database.db, upgraded);
    expect(log.rows.some((e) => e.action === "staff.deactivated")).toBe(true);
    expect(log.stats.important).toBeGreaterThan(0);
    const accessOnly = await listAuditLog(database.db, upgraded, { category: "access" });
    expect(accessOnly.rows.every((e) => e.action.startsWith("staff.") || e.action.startsWith("role."))).toBe(true);
    expect((await listAuditLog(database.db, upgraded, { q: "Exams officer" })).total).toBe(1);
  });

  it("plans in the database drive limits, not hard-coded values", async () => {
    const [free] = await database.db.select().from(plans).where(eq(plans.key, "free"));
    expect(free.limits.students).toBe(50);
  });
});
