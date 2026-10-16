import { and, count, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { parentInbox } from "@/lib/services/messaging";
import { ParentShell } from "./parent-shell";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/parent");
  const db = getDb();
  const [[{ updates }], inbox] = await Promise.all([
    db.select({ updates: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    parentInbox(db, user.id),
  ]);
  return (
    <ParentShell user={{ name: user.name }} unread={{ messages: inbox.filter((c) => c.unread).length, updates }}>
      {children}
    </ParentShell>
  );
}
