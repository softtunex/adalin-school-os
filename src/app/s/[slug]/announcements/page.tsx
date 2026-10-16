import type { Metadata } from "next";
import { CopyField } from "@/components/copy-field";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { Avatar, Badge, Card, EmptyState, Progress } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { appUrl, requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { hasFeature } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { describeAudience, listAnnouncements, parentAppReach } from "@/lib/services/announcements";
import { creditBalance } from "@/lib/services/outbox";
import { clearStaffBadge } from "@/lib/services/staff-badges";
import { AnnouncementMenu, ComposeButton } from "./announcements-client";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["school:view"]);
  if (!access.isStaff) return null;
  if (!hasFeature(access.plan, "announcements")) {
    return (
      <>
        <Topbar title="Announcements" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="announcements" />
        </PageBody>
      </>
    );
  }
  const db = getDb();
  const canPost = can(access, "comms:announce");
  const smsAllowed = hasFeature(access.plan, "sms") && can(access, "comms:sms");
  const [list, reach, credits] = await Promise.all([
    listAnnouncements(db, access),
    parentAppReach(db, access),
    smsAllowed ? withTenant(db, access.school.id, (tx) => creditBalance(tx)) : Promise.resolve(null),
  ]);
  await clearStaffBadge(db, access, "announcement");
  const parentUrl = `${await appUrl()}/parent`;
  const portal = hasFeature(access.plan, "parent_portal");

  return (
    <>
      <Topbar
        title="Announcements"
        context={access.school.name}
        actions={canPost ? <ComposeButton slug={slug} classes={list.classes} smsAllowed={smsAllowed} credits={access.plan.key === "enterprise" ? null : credits} /> : null}
      />
      <PageBody>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            {list.rows.length === 0 ? (
              <Card>
                <EmptyState icon="bell" title="No announcements yet">
                  Tell parents about holidays, PTA meetings, exams and anything else. Parents on the app see it at once, and you can email or text it too.
                </EmptyState>
              </Card>
            ) : (
              list.rows.map(({ a, reads }) => (
                <Card key={a.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <Avatar name={a.authorName} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="fs-16 font-semibold">{a.title}</h2>
                        {a.pinned ? <Badge tone="brand">Pinned</Badge> : null}
                      </div>
                      <p className="fs-13 text-muted">
                        {a.authorName} · {a.publishedAt.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}
                      </p>
                    </div>
                    {canPost ? <AnnouncementMenu slug={slug} id={a.id} title={a.title} /> : null}
                  </div>
                  <p className="whitespace-pre-line fs-15 leading-relaxed text-body">{a.body}</p>
                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 fs-13 text-muted">
                    <Badge tone="blue">{describeAudience(a.audience, a.classIds.length).replace(/^./, (c) => c.toUpperCase())}</Badge>
                    {a.channels.includes("email") ? <Badge>Emailed</Badge> : null}
                    {a.channels.includes("sms") ? <Badge>Texted</Badge> : null}
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      <Icon name="check" size={15} /> Read by {reads}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="fs-16 font-semibold">Parents on the app</h2>
              <p className="tabular fs-28 font-semibold leading-none">
                {reach.linked}
                <span className="fs-15 font-normal text-muted"> of {reach.total} parents</span>
              </p>
              <Progress value={reach.total ? (reach.linked / reach.total) * 100 : 0} tone="brand" />
              {portal ? (
                <>
                  <p className="fs-14 text-muted">Parents sign in with the phone number or email on their child&apos;s record. No passwords. Share this link in your WhatsApp groups:</p>
                  <CopyField value={parentUrl} label="Parent app link" />
                </>
              ) : (
                <p className="fs-14 text-muted">The parent app is on the Basic plan. Until then, announcements reach parents by email and SMS.</p>
              )}
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
