import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { ButtonLink } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { staffInbox } from "@/lib/services/messaging";

export const metadata: Metadata = { title: "Messages" };

function ago(d: Date) {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

export default async function MessagesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["comms:message"]);
  if (!hasFeature(access.plan, "messaging")) {
    return (
      <>
        <Topbar title="Messages" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="messaging" text="Parents and teachers message each other in the app, with every conversation visible to school leadership." />
        </PageBody>
      </>
    );
  }
  const moderator = can(access, "comms:moderate");
  const all = moderator && sp.view === "all";
  const inbox = await staffInbox(getDb(), access, { all });
  const base = `/s/${slug}/messages`;

  return (
    <>
      <Topbar
        title="Messages"
        context={access.school.name}
        actions={
          <ButtonLink href={`${base}/new`}>
            <Icon name="plus" size={18} strokeWidth={2.4} /> Message parents
          </ButtonLink>
        }
      />
      <PageBody>
        {moderator ? (
          <Tabs
            current={all ? "all" : "mine"}
            tabs={[
              { key: "mine", label: "My conversations", href: base },
              { key: "all", label: "Every conversation", href: `${base}?view=all` },
            ]}
          />
        ) : null}
        <Card className="overflow-hidden">
          {inbox.length === 0 ? (
            <EmptyState icon="chat" title={all ? "No conversations in the school yet" : "No messages yet"}>
              Parents write to their child&apos;s class teacher from the parent app. You can also start a conversation with any parent here.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {inbox.map((m) => (
                <li key={m.c.id}>
                  <Link href={`${base}/${m.c.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-paper">
                    <Avatar name={m.parents ?? m.c.subject} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate fs-15 text-ink", m.unread ? "font-bold" : "font-semibold")}>
                          {m.parents ?? "Staff"}
                          {m.studentName ? <span className="font-normal text-muted"> · {m.studentName}</span> : null}
                        </span>
                        <span className="shrink-0 fs-12.5 text-muted">{ago(m.c.lastMessageAt)}</span>
                      </span>
                      <span className="block truncate fs-14 font-medium text-body">{m.c.subject}</span>
                      <span className={cn("block truncate fs-14", m.unread ? "text-ink" : "text-muted")}>
                        {m.lastFrom ? `${m.lastFrom}: ` : ""}
                        {m.last}
                      </span>
                    </span>
                    {all && !m.mine ? <Badge>Not yours</Badge> : null}
                    {m.unread ? <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
