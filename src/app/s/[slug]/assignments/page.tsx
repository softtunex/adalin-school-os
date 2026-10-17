import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/data";
import { Badge, EmptyState, Progress, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatDue } from "@/lib/dates";
import { hasFeature } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { ASSIGNMENT_PAGE_SIZE, assignmentTargets, listAssignments } from "@/lib/services/assignments";
import { defaultDueInput } from "@/lib/services/teaching";
import { NewAssignmentButton } from "./assignment-form";
import { assignmentState } from "./shared";

export const metadata: Metadata = { title: "Assignments" };

type SP = { class?: string; subject?: string; status?: string; q?: string; page?: string };

export default async function AssignmentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["teaching:lessons", "teaching:review"]);

  if (!hasFeature(access.plan, "assignments")) {
    return (
      <>
        <Topbar title="Assignments" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="assignments" text="Set homework with worksheets, collect it online, mark it and send the marks straight into CA." />
        </PageBody>
      </>
    );
  }

  const db = getDb();
  const page = Number(sp.page) || 1;
  const [list, targets] = await Promise.all([
    listAssignments(db, access, { classId: sp.class, subjectId: sp.subject, status: sp.status, q: sp.q, page }),
    can(access, "teaching:lessons") ? assignmentTargets(db, access) : Promise.resolve([]),
  ]);
  const filtered = Boolean(sp.class || sp.subject || sp.status || sp.q);
  const due = defaultDueInput();

  return (
    <>
      <Topbar
        title="Assignments"
        context={list.term ? `${list.term.term.name} · ${list.term.session.name}` : access.school.name}
        actions={targets.length ? <NewAssignmentButton slug={slug} targets={targets} components={list.components} defaultDue={due} /> : null}
      />
      <PageBody>
        <StatGrid>
          <StatCard label="Open now" value={list.stats.active} icon="clipboard" tone="brand" caption="Students can still hand in" />
          <StatCard label="Due this week" value={list.stats.dueThisWeek} icon="calendar" tone="blue" caption="Next 7 days" />
          <StatCard label="Waiting to be marked" value={list.stats.toMark} icon="edit" tone={list.stats.toMark ? "warning" : "success"} caption={list.stats.toMark ? "Handed in, not marked yet" : "All caught up"} />
          <StatCard label="Handed in on time" value={list.stats.onTime === null ? "—" : `${list.stats.onTime}%`} icon="clock" tone="violet" caption="This term" />
        </StatGrid>
        <TableCard
          title="This term's work"
          toolbar={
            <>
              <SearchInput placeholder="Search by title…" />
              <FilterSelect label="Class" param="class" options={list.classes.map((c) => ({ value: c.id, label: c.name }))} />
              <FilterSelect label="Subject" param="subject" options={list.subjects.map((s) => ({ value: s.id, label: s.name }))} />
              <FilterSelect
                label="Status"
                param="status"
                options={[
                  { value: "open", label: "Open" },
                  { value: "past", label: "Past due" },
                  { value: "closed", label: "Closed" },
                  { value: "draft", label: "Drafts" },
                ]}
              />
            </>
          }
          footer={<Pagination page={page} pageSize={ASSIGNMENT_PAGE_SIZE} total={list.total} noun="assignments" />}
        >
          {list.rows.length === 0 ? (
            <EmptyState icon="clipboard" title={filtered ? "No assignments match these filters" : targets.length ? "No assignments yet this term" : "Nothing to show yet"}>
              {filtered
                ? "Try a different search or clear the filters."
                : targets.length
                  ? "Set homework with a worksheet attached. Students hand in from their portal, and you mark it here."
                  : "You'll see assignments here once you're assigned to teach a subject. Ask the admin to set that up in Academics."}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Assignment</Th>
                  <Th>Class</Th>
                  <Th>Due</Th>
                  <Th className="w-48">Handed in</Th>
                  <Th>Marked</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const st = assignmentState(r.a);
                  return (
                    <tr key={r.a.id} className="hover:bg-paper">
                      <Td>
                        <Link href={`/s/${slug}/assignments/${r.a.id}`} className="block font-medium text-ink hover:text-brand-ink">
                          {r.a.title}
                        </Link>
                        <span className="block fs-13 text-muted">
                          {r.subjectName}
                          {r.teacher ? ` · ${r.teacher}` : ""}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-body">{r.className}</Td>
                      <Td className="tabular whitespace-nowrap text-body">{formatDue(r.a.dueAt)}</Td>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1">
                            <Progress value={r.roll ? (r.submitted / r.roll) * 100 : 0} tone="brand" label="Handed in" />
                          </div>
                          <span className="tabular fs-13.5 text-body">
                            {r.submitted}/{r.roll}
                          </span>
                        </div>
                      </Td>
                      <Td className="tabular text-body">{r.a.maxScore ? `${r.marked}` : <span className="text-muted">Not marked</span>}</Td>
                      <Td>
                        <Badge tone={st.tone} dot>
                          {st.label}
                        </Badge>
                      </Td>
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
