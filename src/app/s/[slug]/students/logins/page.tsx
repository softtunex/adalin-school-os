import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { FilterSelect } from "@/components/ui/data";
import { Icon } from "@/components/ui/icons";
import { appUrl, requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { studentLoginStatus } from "@/lib/services/student-accounts";
import { StudentLogins } from "./logins-client";

export const metadata: Metadata = { title: "Student logins" };

export default async function StudentLoginsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ class?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["students:view"]);
  const db = getDb();
  const [classes, rows] = await Promise.all([listClassOptions(db, access), studentLoginStatus(db, access, sp.class)]);
  return (
    <>
      <Topbar title="Student logins" context={access.school.name} />
      <PageBody>
        <Link href={`/s/${slug}/students`} className="inline-flex items-center gap-1.5 self-start fs-14 font-medium text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> Students
        </Link>
        <p className="max-w-[70ch] fs-14.5 text-muted">
          Students sign in at <span className="font-mono text-ink">{await appUrl()}/student</span> with the school code, their admission number and a password. Issue logins for a class, print the slips, and students choose their own password the first time they sign in.
        </p>
        <div className="flex flex-wrap gap-2">
          <FilterSelect label="Class" param="class" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
        <StudentLogins slug={access.school.slug} schoolName={access.school.name} signInUrl={`${await appUrl()}/student`} rows={rows} canIssue={can(access, "students:update")} />
      </PageBody>
    </>
  );
}
