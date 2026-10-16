import type { DB } from "../db/client";
import { withTenant } from "../db/tenant";
import type { Access } from "./access";
import { studentScope } from "./academics";

/** True when this person oversees the whole school rather than particular classes. */
export async function studentScopeFor(db: DB, access: Access) {
  return withTenant(db, access.school.id, async (tx) => (await studentScope(tx, access)) === "all");
}
