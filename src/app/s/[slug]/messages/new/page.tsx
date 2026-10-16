import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { Tabs } from "@/components/ui/tabs";
import { listColleagues, messageableStudents } from "@/lib/services/messaging";
import { ColleagueMessage, StaffNewMessage } from "./staff-new-message";

export const metadata: Metadata = { title: "New message" };

export default async function NewStaffMessage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ student?: string; to?: string }> }) {
  const { slug } = await params;
  const { student, to } = await searchParams;
  const access = await requirePageAccess(slug, ["comms:message"]);
  const colleague = to === "colleague";
  const [kids, colleagues] = await Promise.all([colleague ? Promise.resolve([]) : messageableStudents(getDb(), access), colleague ? listColleagues(getDb(), access) : Promise.resolve([])]);
  const onApp = kids.filter((k) => k.onApp);
  return (
    <>
      <Topbar title="New message" context={access.school.name} />
      <PageBody>
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
          <Link href={`/s/${slug}/messages`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
            <Icon name="chevronLeft" size={16} /> Messages
          </Link>
          <Tabs
            current={colleague ? "colleague" : "parents"}
            tabs={[
              { key: "parents", label: "To parents", href: `/s/${slug}/messages/new` },
              { key: "colleague", label: "To colleagues", href: `/s/${slug}/messages/new?to=colleague` },
            ]}
          />
          <Card className="p-5 sm:p-6">
            {colleague ? (
              colleagues.length ? <ColleagueMessage slug={slug} colleagues={colleagues} /> : <p className="fs-14.5 text-muted">There are no other active staff yet.</p>
            ) : onApp.length === 0 ? (
              <p className="fs-14.5 text-muted">None of the parents of children you teach use the parent app yet. Share the parent app link from Announcements so they can sign in.</p>
            ) : (
              <StaffNewMessage
                slug={slug}
                defaultStudent={onApp.some((k) => k.id === student) ? student! : ""}
                kids={onApp.map((k) => ({ id: k.id, label: `${k.firstName} ${k.lastName}`, group: k.className ?? "No class" }))}
                offApp={kids.length - onApp.length}
              />
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
