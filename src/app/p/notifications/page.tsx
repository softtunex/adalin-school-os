import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, IconChip, type Tone } from "@/components/ui/display";
import type { IconName } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { parentNotifications } from "@/lib/services/parent-portal";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Updates" };

const KIND: Record<string, { icon: IconName; tone: Tone }> = {
  absence: { icon: "calendarCheck", tone: "danger" },
  result: { icon: "results", tone: "violet" },
  payment: { icon: "banknote", tone: "success" },
  announcement: { icon: "bell", tone: "brand" },
  message: { icon: "chat", tone: "blue" },
};

export default async function ParentNotifications() {
  const user = await requireUser();
  const rows = await parentNotifications(getDb(), user.id);
  const unread = rows.some((r) => !r.n.readAt);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="fs-26 font-bold tracking-[-0.02em]">Updates</h1>
        {unread ? <MarkAllRead /> : null}
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="bell" title="Nothing yet">
            Absences, results, receipts and school announcements show up here.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map(({ n, schoolName }) => {
              const k = KIND[n.kind] ?? { icon: "bell" as IconName, tone: "neutral" as Tone };
              const inner = (
                <>
                  <IconChip icon={k.icon} tone={k.tone} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block fs-15 text-ink", !n.readAt ? "font-bold" : "font-semibold")}>{n.title}</span>
                    {n.body ? <span className="line-clamp-2 block fs-14 text-body">{n.body}</span> : null}
                    <span className="block fs-12.5 text-muted">
                      {schoolName} · {n.createdAt.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}
                    </span>
                  </span>
                  {!n.readAt ? <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" aria-label="New" /> : null}
                </>
              );
              return (
                <li key={n.id}>
                  {n.link?.startsWith("/p") ? (
                    <Link href={n.link} className="flex items-start gap-3 px-4 py-3.5 hover:bg-paper">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
