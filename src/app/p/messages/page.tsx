import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { Avatar, Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { parentInbox } from "@/lib/services/messaging";
import { myChildren } from "@/lib/services/parent-portal";

export const metadata: Metadata = { title: "Messages" };

function ago(d: Date) {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

export default async function ParentMessages() {
  const user = await requireUser();
  const db = getDb();
  const [inbox, children] = await Promise.all([parentInbox(db, user.id), myChildren(db, user.id)]);
  const canStart = children.some((c) => c.school.features.includes("messaging"));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="fs-26 font-bold tracking-[-0.02em]">Messages</h1>
        {canStart ? (
          <Link href="/p/messages/new" className={buttonClass("primary", "md")}>
            <Icon name="plus" size={18} strokeWidth={2.4} /> New message
          </Link>
        ) : null}
      </div>
      <Card className="overflow-hidden">
        {inbox.length === 0 ? (
          <EmptyState icon="chat" title="No messages yet">
            {canStart ? "Write to your child's class teacher about anything: an absence, homework, a concern." : "Your child's school hasn't switched on messaging yet."}
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {inbox.map((m) => (
              <li key={m.c.id}>
                <Link href={`/p/messages/${m.c.id}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-paper">
                  <Avatar name={m.staff ?? m.schoolName} size={42} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate fs-15 text-ink", m.unread ? "font-bold" : "font-semibold")}>{m.staff ?? m.schoolName}</span>
                      <span className="shrink-0 fs-12.5 text-muted">{ago(m.c.lastMessageAt)}</span>
                    </span>
                    <span className="block truncate fs-14 font-medium text-body">
                      {m.c.subject}
                      {m.studentName ? ` · ${m.studentName}` : ""}
                    </span>
                    <span className={cn("block truncate fs-14", m.unread ? "text-ink" : "text-muted")}>{m.last}</span>
                  </span>
                  {m.unread ? <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
