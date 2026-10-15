import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { UpgradeCard } from "@/components/upgrade-card";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getLimit, hasFeature } from "@/lib/plans/entitlements";
import { AUDIT_PAGE_SIZE, listAuditLog } from "@/lib/services/audit-log";

export const metadata: Metadata = { title: "Audit log" };

const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

export default async function AuditPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ before?: string }> }) {
  const { slug } = await params;
  const { before } = await searchParams;
  const access = await requirePageAccess(slug, ["audit:view"]);

  if (!hasFeature(access.plan, "audit_log")) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Audit log" description="A record of who changed what, and when." />
        <UpgradeCard slug={slug} feature="audit_log" text="See every sensitive change made in your school: role changes, result edits, fee adjustments and more." />
      </div>
    );
  }

  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
  const entries = await listAuditLog(getDb(), access, beforeDate);
  const days = getLimit(access.plan, "audit_days");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Audit log" description={days ? `Who changed what, and when. Kept for ${days} days on your plan.` : "Who changed what, and when."} />
      {entries.length === 0 ? (
        <EmptyState icon={<Icon name="history" size={26} />} title="Nothing recorded yet">
          Changes to staff, roles, results and fees will appear here.
        </EmptyState>
      ) : (
        <ol className="flex flex-col">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-4 border-b border-line py-4 last:border-b-0">
              <Avatar name={e.actorName ?? "System"} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-ink">
                  <span className="font-bold">{e.actorName ?? "System"}</span> · {e.summary}
                </p>
                <p className="tabular mt-0.5 text-[13px] text-muted">
                  {timeFmt.format(e.createdAt)}
                  {e.ip ? ` · ${e.ip}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {entries.length === AUDIT_PAGE_SIZE ? (
        <Link href={`/s/${slug}/audit?before=${encodeURIComponent(entries[entries.length - 1].createdAt.toISOString())}`} className="self-center text-[14.5px] font-bold text-blue hover:underline">
          Show older entries
        </Link>
      ) : null}
    </div>
  );
}
