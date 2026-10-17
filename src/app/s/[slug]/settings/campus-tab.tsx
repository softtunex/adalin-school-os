import Link from "next/link";
import { UpgradeCard } from "@/components/upgrade-card";
import { Card } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { campusesTab } from "@/lib/services/groups";
import { AddCampus, RemoveCampus, StartGroup } from "./campus-client";

/** Campuses: run several schools as one group, each with its own records and bill. */
export async function CampusTab({ slug, access }: { slug: string; access: Access }) {
  if (!hasFeature(access.plan, "multi_campus")) {
    return <UpgradeCard slug={slug} feature="multi_campus" text="Run several campuses as one group, and compare their rolls, attendance and fees on one page." />;
  }
  const t = await campusesTab(getDb(), access);
  if (!t.group) {
    return (
      <Card className="flex max-w-[720px] flex-col gap-4 p-5">
        <div>
          <h2 className="fs-16 font-semibold text-ink">Run more than one campus?</h2>
          <p className="mt-1 fs-14.5 text-body">
            Group your campuses to see them side by side: students, staff, today&apos;s attendance and this term&apos;s fees. Each campus keeps its own records, staff and bill.
          </p>
        </div>
        <StartGroup slug={slug} schoolName={access.school.name} />
      </Card>
    );
  }
  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="fs-16 font-semibold text-ink">{t.group.name}</h2>
            <p className="fs-14 text-muted">
              {t.campuses.length} {t.campuses.length === 1 ? "campus" : "campuses"}
            </p>
          </div>
          {t.isAdmin ? (
            <Link href={`/g/${t.group.id}`} className="fs-14.5 font-semibold text-brand hover:underline">
              Open the group dashboard
            </Link>
          ) : null}
        </div>
        <ul className="flex flex-col divide-y divide-line rounded-chunk border border-line">
          {t.campuses.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-medium text-ink">{c.name}</span>
                <span className="block fs-13 text-muted">
                  {c.slug}
                  {c.id === access.school.id ? " · this school" : ""}
                </span>
              </span>
              {t.isAdmin ? <RemoveCampus slug={slug} schoolId={c.id} name={c.name} last={t.campuses.length === 1} /> : null}
            </li>
          ))}
        </ul>
      </Card>
      {t.isAdmin ? (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="fs-16 font-semibold text-ink">Add a campus</h2>
          <p className="fs-14 text-body">A new campus starts empty on the same plan, with you as proprietor. It&apos;s billed for its own students.</p>
          <AddCampus slug={slug} linkable={t.linkable.filter((s) => s.id !== access.school.id)} />
        </Card>
      ) : null}
    </div>
  );
}
