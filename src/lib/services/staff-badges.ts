import { and, count, eq, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { notifications } from "../db/schema";
import { withTenant } from "../db/tenant";
import type { Access } from "./access";
import { staffUnreadCount } from "./messaging";

/** Counts for the sidebar: unread conversations and unseen announcements. */
export async function staffBadges(db: DB, access: Access): Promise<Record<string, number>> {
  const [messages, [{ n }]] = await Promise.all([
    access.permissions.has("comms:message") ? staffUnreadCount(db, access) : Promise.resolve(0),
    withTenant(db, access.school.id, (tx) =>
      tx.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, access.user.id), eq(notifications.kind, "announcement"), isNull(notifications.readAt))),
    ),
  ]);
  return { "/messages": messages, "/announcements": n };
}

/** Opening a page clears its badge. */
export async function clearStaffBadge(db: DB, access: Access, kind: "announcement") {
  await withTenant(db, access.school.id, (tx) =>
    tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, access.user.id), eq(notifications.kind, kind), isNull(notifications.readAt))),
  );
}
