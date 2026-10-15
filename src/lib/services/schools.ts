import { eq, like } from "drizzle-orm";
import type { DB, Tx } from "../db/client";
import { roles, schools } from "../db/schema";
import { SYSTEM_ROLES } from "../rbac/roles";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "school"
  );
}

export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "login", "logout", "signup", "schools", "invite", "reset", "forgot-password", "settings", "s", "platform", "help",
]);

export async function uniqueSlug(db: DB | Tx, name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (await db.select({ slug: schools.slug }).from(schools).where(like(schools.slug, `${base}%`))).map((r) => r.slug),
  );
  if (!taken.has(base) && !RESERVED_SLUGS.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Creates the built-in roles for a new school. Their permissions are resolved from code at runtime. */
export async function provisionSystemRoles(tx: Tx, schoolId: string) {
  return tx
    .insert(roles)
    .values(
      SYSTEM_ROLES.map((r) => ({
        schoolId,
        key: r.key,
        name: r.name,
        description: r.description,
        kind: r.kind,
        isSystem: true,
        permissions: [],
      })),
    )
    .returning();
}

export async function getSchoolBySlug(db: DB, slug: string) {
  const [school] = await db.select().from(schools).where(eq(schools.slug, slug)).limit(1);
  return school ?? null;
}
