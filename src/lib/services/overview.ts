import { and, count, desc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { auditLogs, classes, membershipRoles, memberships, roles, students, subjects } from "../db/schema";
import { withTenant } from "../db/tenant";
import { hasFeature } from "../plans/entitlements";
import { can, type Access } from "./access";
import { getCurrentTerm } from "./academics";

export async function getOverview(db: DB, access: Access) {
  return withTenant(db, access.school.id, async (tx) => {
    const [[studentCounts], [femaleCount], [staffCount], [classCount], [subjectCount], current] = await Promise.all([
      tx.select({ n: count() }).from(students).where(eq(students.status, "active")),
      tx.select({ n: count() }).from(students).where(and(eq(students.status, "active"), eq(students.gender, "female"))),
      tx
        .selectDistinct({ id: memberships.id })
        .from(memberships)
        .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .where(and(eq(memberships.status, "active"), eq(roles.kind, "staff")))
        .then((rows) => [{ n: rows.length }]),
      tx.select({ n: count() }).from(classes).where(eq(classes.isActive, true)),
      tx.select({ n: count() }).from(subjects),
      getCurrentTerm(tx),
    ]);
    const showActivity = can(access, "audit:view") && hasFeature(access.plan, "audit_log");
    const activity = showActivity ? await tx.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(6) : null;
    return {
      students: studentCounts.n,
      female: femaleCount.n,
      staff: staffCount.n,
      classes: classCount.n,
      subjects: subjectCount.n,
      term: current?.term ?? null,
      session: current?.session ?? null,
      activity,
    };
  });
}
