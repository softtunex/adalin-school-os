import { and, count, eq, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { exeats, leaveRequests, lessonNotes, notifications, sickBayVisits } from "../db/schema";
import { withTenant } from "../db/tenant";
import type { Access } from "./access";
import { lowStockCount } from "./inventory";
import { staffUnreadCount } from "./messaging";

/** Counts for the sidebar: unread conversations, unseen announcements, lesson notes to review. */
export async function staffBadges(db: DB, access: Access): Promise<Record<string, number>> {
  const reviews = access.permissions.has("teaching:review") && access.plan.features.includes("assignments");
  const approvesLeave = access.permissions.has("staff:leave") && access.plan.features.includes("staff_attendance");
  const [messages, [{ n }], [{ notes }], [{ leave }], low, [{ inBay }], [{ exeat }]] = await Promise.all([
    access.permissions.has("comms:message") ? staffUnreadCount(db, access) : Promise.resolve(0),
    withTenant(db, access.school.id, (tx) =>
      tx.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, access.user.id), eq(notifications.kind, "announcement"), isNull(notifications.readAt))),
    ),
    reviews
      ? withTenant(db, access.school.id, (tx) => tx.select({ notes: count() }).from(lessonNotes).where(eq(lessonNotes.status, "submitted")))
      : Promise.resolve([{ notes: 0 }]),
    approvesLeave
      ? withTenant(db, access.school.id, (tx) => tx.select({ leave: count() }).from(leaveRequests).where(eq(leaveRequests.status, "pending")))
      : Promise.resolve([{ leave: 0 }]),
    access.permissions.has("operations:inventory") ? lowStockCount(db, access) : Promise.resolve(0),
    access.permissions.has("operations:health") && access.plan.features.includes("health")
      ? withTenant(db, access.school.id, (tx) => tx.select({ inBay: count() }).from(sickBayVisits).where(isNull(sickBayVisits.leftAt)))
      : Promise.resolve([{ inBay: 0 }]),
    access.permissions.has("operations:hostel") && access.plan.features.includes("hostel")
      ? withTenant(db, access.school.id, (tx) => tx.select({ exeat: count() }).from(exeats).where(eq(exeats.status, "pending")))
      : Promise.resolve([{ exeat: 0 }]),
  ]);
  return { "/messages": messages, "/announcements": n, "/lesson-notes": notes, "/hr": leave, "/inventory": low, "/sick-bay": inBay, "/hostel": exeat };
}

/** Opening a page clears its badge. */
export async function clearStaffBadge(db: DB, access: Access, kind: "announcement") {
  await withTenant(db, access.school.id, (tx) =>
    tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, access.user.id), eq(notifications.kind, kind), isNull(notifications.readAt))),
  );
}
