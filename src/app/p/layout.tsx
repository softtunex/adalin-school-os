import { and, count, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { parentInbox } from "@/lib/services/messaging";
import { myChildren } from "@/lib/services/parent-portal";
import { ParentShell } from "./parent-shell";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/parent");
  const db = getDb();
  const [[{ updates }], inbox, wards] = await Promise.all([
    db.select({ updates: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    parentInbox(db, user.id),
    myChildren(db, user.id),
  ]);
  const multiSchool = new Set(wards.map((c) => c.schoolId)).size > 1;
  const contact = user.phone?.startsWith("+234") && user.phone.length === 14 ? `0${user.phone.slice(4, 7)} ${user.phone.slice(7, 10)} ${user.phone.slice(10)}` : (user.phone ?? user.email ?? "");
  return (
    <ParentShell
      user={{ name: user.name, contact }}
      unread={{ messages: inbox.filter((c) => c.unread).length, updates }}
      kids={wards.map((c) => ({ id: c.studentId, name: `${c.firstName} ${c.lastName}`, detail: multiSchool ? c.school.name : c.relationship === "Parent" ? c.school.name : `${c.relationship} · ${c.school.name}` }))}
    >
      {children}
    </ParentShell>
  );
}
