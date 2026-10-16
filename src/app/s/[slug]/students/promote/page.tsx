import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAcademicOverview } from "@/lib/services/academics";
import { planPromotion } from "@/lib/services/promotion";
import { CreateNextSession, PromotionBoard } from "./promotion-board";

export const metadata: Metadata = { title: "Promote students" };

function nextSessionName(current: string | undefined) {
  const start = current ? Number(current.split("/")[0]) + 1 : new Date().getFullYear();
  return `${start}/${start + 1}`;
}

export default async function PromotePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ to?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["students:promote"]);
  const db = getDb();
  const overview = await getAcademicOverview(db, access);
  const current = overview.currentSession;
  const later = overview.sessions.filter((s) => !current || s.name > current.name);
  const target = later.find((s) => s.id === sp.to) ?? later[0];

  const title = (
    <span className="flex items-center gap-2">
      <Link href={`/s/${slug}/students`} className="text-muted hover:text-ink">
        Students
      </Link>
      <Icon name="chevronRight" size={18} className="text-muted" />
      End-of-session promotion
    </span>
  );

  if (!target) {
    return (
      <>
        <Topbar title={title} />
        <PageBody>
          <Card>
            <EmptyState icon="calendar" title={`Create the ${nextSessionName(current?.name)} session first`} action={<CreateNextSession slug={slug} name={nextSessionName(current?.name)} />}>
              Students are promoted into the next session. Create it here, and its three terms are set up automatically.
            </EmptyState>
          </Card>
        </PageBody>
      </>
    );
  }

  const plan = await planPromotion(db, access, target.id);
  return (
    <>
      <Topbar title={title} />
      <PageBody>
        <PromotionBoard
          slug={slug}
          fromSession={current?.name ?? null}
          toSession={{ id: target.id, name: target.name }}
          groups={plan.groups}
          classes={plan.classes.map((c) => ({ id: c.id, name: c.name }))}
          alreadyMoved={plan.alreadyMoved}
        />
      </PageBody>
    </>
  );
}
