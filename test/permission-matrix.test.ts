import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, type Permission } from "@/lib/rbac/permissions";
import { getSystemRole, SYSTEM_ROLES, type SystemRoleKey } from "@/lib/rbac/roles";

/*
 * What each built-in role must be able to do, and what it must never be able to do. A change to
 * a role that opens one of these doors fails here, on purpose.
 */

const MONEY: Permission[] = ["fees:refund", "expenses:payroll", "school:billing", "comms:credits"];
const OWNER_ONLY: Permission[] = ["school:billing", "school:export", "school:api", "school:sso", "roles:manage"];

const MATRIX: Record<SystemRoleKey, { must: Permission[]; never: Permission[] }> = {
  owner: { must: [...OWNER_ONLY, ...MONEY], never: [] },
  principal: { must: ["results:approve", "results:publish", "staff:invite", "students:create"], never: [...OWNER_ONLY, "fees:refund", "expenses:payroll", "comms:credits"] },
  admin: { must: ["students:create", "staff:invite", "documents:issue"], never: [...OWNER_ONLY, ...MONEY, "results:approve", "results:publish"] },
  bursar: { must: ["fees:manage", "fees:record_payment"], never: [...OWNER_ONLY, "results:enter", "results:approve", "results:publish", "staff:assign_roles", "students:view_medical"] },
  class_teacher: { must: ["attendance:take"], never: [...OWNER_ONLY, ...MONEY, "fees:manage", "results:publish", "staff:invite", "students:view_medical"] },
  subject_teacher: { must: ["results:enter"], never: [...OWNER_ONLY, ...MONEY, "fees:manage", "fees:record_payment", "results:approve", "results:publish", "students:create", "staff:invite", "students:view_medical"] },
  librarian: { must: ["operations:library"], never: [...OWNER_ONLY, ...MONEY, "fees:manage", "results:enter", "students:create", "students:view_medical"] },
  nurse: { must: ["operations:health", "students:view_medical"], never: [...OWNER_ONLY, ...MONEY, "fees:manage", "results:enter", "students:create"] },
  transport_officer: { must: ["operations:transport"], never: [...OWNER_ONLY, ...MONEY, "fees:manage", "results:enter", "students:view_medical"] },
  hostel_warden: { must: ["operations:hostel"], never: [...OWNER_ONLY, ...MONEY, "fees:manage", "results:enter", "students:view_medical"] },
  storekeeper: { must: ["operations:inventory"], never: [...OWNER_ONLY, ...MONEY, "fees:manage", "results:enter", "students:view", "students:view_medical"] },
  parent: { must: [], never: ALL_PERMISSIONS.filter((p) => p !== "school:view" && p !== "comms:message") },
  student: { must: [], never: ALL_PERMISSIONS.filter((p) => p !== "school:view") },
};

describe("permission matrix", () => {
  it("covers every built-in role", () => {
    expect(Object.keys(MATRIX).sort()).toEqual(SYSTEM_ROLES.map((r) => r.key).sort());
  });

  for (const [key, { must, never }] of Object.entries(MATRIX)) {
    it(`${key}: has what it needs and nothing it mustn't`, () => {
      const perms = new Set(getSystemRole(key)!.permissions);
      for (const p of must) expect(perms.has(p), `${key} should have ${p}`).toBe(true);
      for (const p of never) expect(perms.has(p), `${key} must not have ${p}`).toBe(false);
    });
  }

  it("names only permissions that exist", () => {
    for (const role of SYSTEM_ROLES) for (const p of role.permissions) expect(ALL_PERMISSIONS, `${role.key}: ${p}`).toContain(p);
  });
});

// ---------- Every server action checks who is calling ----------

const AUTH_CALLS = ["requireAccess", "requirePageAccess", "requireUser", "requirePlatformAdmin", "requirePermission", "getCurrentUser"];
// Actions anyone may call: signing in, signing up, public forms. Each is rate-limited or harmless.
const PUBLIC_ACTIONS = new Set([
  "loginAction",
  "logoutAction",
  "signupAction",
  "forgotPasswordAction",
  "resetPasswordAction",
  "acceptInviteAction",
  "requestParentCodeAction",
  "verifyParentCodeAction",
  "studentLoginAction",
  "setThemeAction",
  "setTextSizeAction",
  "applyAction",
  "submitApplicationAction",
  "applicantStatusAction",
  "payApplicationFeeAction",
  "acceptOfferAction",
  "checkResultAction",
  // Parent sign-in by one-time code (rate-limited per phone and device).
  "requestCodeAction",
  "verifyCodeAction",
  // Signing out needs no check.
  "studentLogoutAction",
  "parentLogoutAction",
  // Bound to an unguessable pay-link or applicant token; test approval only works in test mode.
  "startPaymentAction",
  "finishTestPaymentAction",
  "payFeeAction",
  "finishTestFeeAction",
  "respondAction",
]);

function serverActionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return serverActionFiles(full);
    return /\.tsx?$/.test(name) && /^["']use server["']/.test(readFileSync(full, "utf8").trimStart()) ? [full] : [];
  });
}

describe("server actions", () => {
  it("every exported action checks the caller, unless it's deliberately public", () => {
    const unguarded: string[] = [];
    for (const file of serverActionFiles(path.join(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf8");
      // Local helpers that check the caller, directly or through another helper (run → ctx → requireAccess).
      const locals = [...src.matchAll(/(?:async function|const)\s+(\w+)[^\n]*\n([\s\S]*?)\n\}/g)].map(([, name, body]) => ({ name, body }));
      const guards = [...AUTH_CALLS];
      for (let grew = true; grew; ) {
        grew = false;
        for (const l of locals) {
          if (!guards.includes(l.name) && guards.some((g) => l.body.includes(`${g}(`))) {
            guards.push(l.name);
            grew = true;
          }
        }
      }
      const exports = [...src.matchAll(/export async function (\w+)\s*\(([\s\S]*?)\n\}/g)];
      for (const [, name, body] of exports) {
        if (PUBLIC_ACTIONS.has(name)) continue;
        if (!guards.some((g) => body.includes(`${g}(`))) unguarded.push(`${path.relative(process.cwd(), file)}: ${name}`);
      }
    }
    expect(unguarded).toEqual([]);
  });
});
