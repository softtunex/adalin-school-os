import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { Alert } from "@/components/ui/display";
import { UpgradeCard } from "@/components/upgrade-card";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getLimit } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { studentStats } from "@/lib/services/students";
import { createStudentAction } from "../actions";
import { StudentForm } from "../student-form";

export const metadata: Metadata = { title: "Add a student" };

export default async function NewStudentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ added?: string; class?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["students:create"]);
  const db = getDb();
  const [classes, stats] = await Promise.all([listClassOptions(db, access), studentStats(db, access)]);
  const limit = getLimit(access.plan, "students");
  const atLimit = limit !== null && stats.active >= limit;

  return (
    <>
      <Topbar title="Add a student" context={access.school.name} />
      <PageBody>
        {sp.added ? <Alert tone="success">Student saved. Add the next one below.</Alert> : null}
        {atLimit ? (
          <UpgradeCard slug={slug} title="You've reached your student limit" text={`Your ${access.plan.name} plan allows ${limit} active students. Upgrade to add more.`} />
        ) : (
          <StudentForm
            key={sp.added ?? "new"}
            action={createStudentAction.bind(null, slug)}
            mode="create"
            classes={classes}
            canMedical={can(access, "students:view_medical")}
            cancelHref={`/s/${slug}/students`}
            defaults={{ classId: sp.class ?? "", g1_relationship: "Mother" }}
          />
        )}
      </PageBody>
    </>
  );
}
