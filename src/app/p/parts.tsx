"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { readAnnouncementAction } from "./actions";

/** An announcement that expands in place and sends a read receipt the first time it's opened. */
export function AnnouncementItem({ schoolId, id, title, body, date, school, pinned, unread, defaultOpen }: { schoolId: string; id: string; title: string; body: string; date: string; school?: string; pinned: boolean; unread: boolean; defaultOpen?: boolean }) {
  const [isUnread, setUnread] = useState(unread && !defaultOpen);
  return (
    <details
      open={defaultOpen}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && isUnread) {
          setUnread(false);
          void readAnnouncementAction(schoolId, id);
        }
      }}
      className="group border-b border-line last:border-b-0"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className={cn("mt-2 size-2 shrink-0 rounded-full", isUnread ? "bg-brand" : "bg-transparent")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("fs-15 text-ink", isUnread ? "font-bold" : "font-semibold")}>{title}</span>
            {pinned ? <Badge tone="brand">Pinned</Badge> : null}
          </span>
          <span className="block fs-13 text-muted">
            {school ? `${school} · ` : ""}
            {date}
          </span>
          <span className="mt-1 line-clamp-2 block fs-14.5 text-body group-open:hidden">{body}</span>
        </span>
      </summary>
      <p className="whitespace-pre-line pb-4 pl-5 fs-15 leading-relaxed text-body">{body}</p>
    </details>
  );
}
