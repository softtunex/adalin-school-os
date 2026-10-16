import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { UpgradeCard } from "@/components/upgrade-card";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getLimit, hasFeature } from "@/lib/plans/entitlements";
import { AUDIT_CATEGORIES, AUDIT_PAGE_SIZE, categoryOf, isImportant, listAuditLog } from "@/lib/services/audit-log";

export const metadata: Metadata = { title: "Audit log" };

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

function actionTitle(action: string) {
  const [, verb = action] = action.split(".");
  const text = verb.replace(/_/g, " ");
  const subject = action.split(".")[0];
  const nouns: Record<string, string> = { staff: "Staff", role: "Role", school: "School", student: "Student", guardian: "Guardian", class: "Class", subject: "Subject", session: "Session", term: "Term", teacher: "Teacher", level: "Class level", academics: "Academics" };
  return `${nouns[subject] ?? subject} ${text}`;
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["audit:view"]);

  if (!hasFeature(access.plan, "audit_log")) {
    return (
      <>
        <Topbar title="Audit log" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="audit_log" text="See every sensitive change made in your school: role changes, result edits, fee adjustments and more." />
        </PageBody>
      </>
    );
  }

  const { rows, total, page, stats } = await listAuditLog(getDb(), access, { q: sp.q, category: sp.category, page: Number(sp.page) || 1 });
  const days = getLimit(access.plan, "audit_days");
  const exportQs = new URLSearchParams(Object.entries({ q: sp.q, category: sp.category }).filter(([, v]) => v) as [string, string][]).toString();
  const windowLabel = days ? `Last ${days} days` : "All time";

  return (
    <>
      <Topbar title="Audit log" context={access.school.name} />
      <PageBody>
        <StatGrid>
          <StatCard label="Events" value={stats.events} icon="history" tone="neutral" caption={windowLabel} />
          <StatCard label="Needs review" value={stats.important} icon="alert" tone="danger" caption="Access changes and removals" />
          <StatCard label="Access & security" value={stats.access} icon="shield" tone="blue" caption="Invites, roles, deactivations" />
          <StatCard label="People involved" value={stats.actors} icon="users" tone="violet" caption="Distinct staff who made changes" />
        </StatGrid>

        <TableCard
          title="Activity trail"
          toolbar={
            <>
              <SearchInput placeholder="Search person, action or detail…" />
              <FilterSelect
                label="Category"
                param="category"
                options={[
                  ...Object.entries(AUDIT_CATEGORIES).map(([value, def]) => ({ value, label: def.label })),
                  { value: "important", label: "Needs review" },
                ]}
              />
              <ToolbarLink href={`/s/${slug}/audit/export${exportQs ? `?${exportQs}` : ""}`} icon="download">
                Export CSV
              </ToolbarLink>
            </>
          }
          footer={<Pagination page={page} pageSize={AUDIT_PAGE_SIZE} total={total} noun="events" />}
        >
          {rows.length === 0 ? (
            <EmptyState icon="history" title={sp.q || sp.category ? "Nothing matches these filters" : "Nothing recorded yet"}>
              Changes to staff, roles, students and settings appear here as they happen.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Action</Th>
                  <Th>Details</Th>
                  <Th>By</Th>
                  <Th>Category</Th>
                  <Th>Severity</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const cat = categoryOf(e.action);
                  const important = isImportant(e.action);
                  return (
                    <tr key={e.id} className="hover:bg-paper">
                      <Td className="whitespace-nowrap">
                        <p className="tabular font-medium">{dayFmt.format(e.createdAt)}</p>
                        <p className="tabular fs-13 text-muted">{timeFmt.format(e.createdAt)} WAT</p>
                      </Td>
                      <Td className="whitespace-nowrap font-medium">{actionTitle(e.action)}</Td>
                      <Td className="max-w-[360px] text-body">{e.summary}</Td>
                      <Td>
                        <p className="font-medium">{e.actorName ?? "System"}</p>
                        {e.ip ? <p className="tabular fs-13 text-muted">{e.ip}</p> : null}
                      </Td>
                      <Td className="whitespace-nowrap text-body">{cat ? AUDIT_CATEGORIES[cat].label : "Other"}</Td>
                      <Td>{important ? <Badge tone="danger">Review</Badge> : <Badge>Info</Badge>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </TableCard>
      </PageBody>
    </>
  );
}
