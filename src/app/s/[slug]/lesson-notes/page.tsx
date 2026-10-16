import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { ButtonLink } from "@/components/ui/button";
import { FilterSelect, Pagination } from "@/components/ui/data";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatWhen } from "@/lib/dates";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";
import { getScheme, listLessonNotes, NOTE_PAGE_SIZE } from "@/lib/services/lesson-notes";
import { SchemeEditor } from "./notes-client";
import { NOTE_STATUS } from "./status";

export const metadata: Metadata = { title: "Lesson notes" };

type SP = {
  view?: string;
  status?: string;
  level?: string;
  subject?: string;
  week?: string;
  page?: string;
  plan?: string;
};

export default async function LessonNotesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["teaching:lessons", "teaching:review"]);
  if (!hasFeature(access.plan, "assignments")) {
    return (
      <>
        <Topbar title="Lesson notes" context={access.school.name} />
        <PageBody>
          <UpgradeCard
            slug={slug}
            feature="assignments"
            text="Teachers plan the term in a scheme of work, write weekly lesson notes, and send them to the principal for approval."
          />
        </PageBody>
      </>
    );
  }
  const writer = can(access, "teaching:lessons");
  const reviewer = can(access, "teaching:review");
  // Reviewers land on their queue; teachers on their own notes.
  const view = sp.view === "scheme" ? "scheme" : sp.view === "all" && reviewer ? "all" : sp.view === "mine" && writer ? "mine" : reviewer ? "review" : "mine";
  const base = `/s/${slug}/lesson-notes`;

  const list = await listLessonNotes(getDb(), access, {
    view: view === "scheme" ? "mine" : view,
    status: sp.status,
    levelId: sp.level,
    subjectId: sp.subject,
    week: Number(sp.week) || undefined,
    page: Number(sp.page) || 1,
  });

  return (
    <>
      <Topbar
        title="Lesson notes"
        context={`${list.term.name}${list.currentWeek ? ` · Week ${list.currentWeek}` : ""}`}
        actions={
          writer && list.options.length ? (
            <ButtonLink href={`${base}/new`}>
              <Icon name="plus" size={18} strokeWidth={2.4} /> New lesson note
            </ButtonLink>
          ) : null
        }
      />
      <PageBody>
        <Tabs
          current={view}
          tabs={[
            ...(reviewer
              ? [
                  {
                    key: "review",
                    label: "For approval",
                    href: base,
                    count: list.queue?.waiting,
                  },
                ]
              : []),
            ...(writer
              ? [
                  {
                    key: "mine",
                    label: "My notes",
                    href: reviewer ? `${base}?view=mine` : base,
                  },
                ]
              : []),
            ...(reviewer ? [{ key: "all", label: "All notes", href: `${base}?view=all` }] : []),
            {
              key: "scheme",
              label: "Scheme of work",
              href: `${base}?view=scheme`,
            },
          ]}
        />
        {view === "scheme" ? (
          <Scheme slug={slug} access={access} plan={sp.plan} currentWeek={list.currentWeek} />
        ) : (
          <>
            {view === "mine" ? (
              <StatGrid>
                <StatCard label="Approved" value={list.mine.approved} icon="checkCircle" tone="success" caption="This term" />
                <StatCard label="Awaiting approval" value={list.mine.submitted} icon="clock" tone="warning" caption="With the principal" />
                <StatCard
                  label="Returned"
                  value={list.mine.returned}
                  icon="undo"
                  tone={list.mine.returned ? "danger" : "success"}
                  caption={list.mine.returned ? "Need your changes" : "Nothing returned"}
                />
                <StatCard label="Drafts" value={list.mine.drafts} icon="edit" tone="blue" caption="Not sent yet" />
              </StatGrid>
            ) : list.queue ? (
              <StatGrid>
                <StatCard
                  label="Awaiting approval"
                  value={list.queue.waiting}
                  icon="clock"
                  tone={list.queue.waiting ? "warning" : "success"}
                  caption={list.queue.waiting ? "Oldest first" : "All reviewed"}
                />
                <StatCard label="Approved" value={list.queue.approved} icon="checkCircle" tone="success" caption="This term" />
                <StatCard label="Returned" value={list.queue.returned} icon="undo" tone="danger" caption="Sent back for changes" />
                <StatCard label="Teachers submitting" value={list.queue.authors} icon="users" tone="blue" caption="At least one note this term" />
              </StatGrid>
            ) : null}
            <TableCard
              title={view === "review" ? "Waiting for you" : view === "all" ? "Every submitted note" : "My lesson notes"}
              toolbar={
                <>
                  <FilterSelect
                    label="Class"
                    param="level"
                    options={list.levels.map((l) => ({
                      value: l.id,
                      label: l.name,
                    }))}
                  />
                  <FilterSelect
                    label="Subject"
                    param="subject"
                    options={list.subjects.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                  />
                  <FilterSelect
                    label="Week"
                    param="week"
                    options={Array.from({ length: list.weeks }, (_, i) => ({
                      value: String(i + 1),
                      label: `Week ${i + 1}`,
                    }))}
                  />
                  {view !== "review" ? (
                    <FilterSelect
                      label="Status"
                      param="status"
                      options={Object.entries(NOTE_STATUS)
                        .filter(([k]) => view === "mine" || k !== "draft")
                        .map(([value, s]) => ({ value, label: s.label }))}
                    />
                  ) : null}
                </>
              }
              footer={<Pagination page={Number(sp.page) || 1} pageSize={NOTE_PAGE_SIZE} total={list.total} noun="notes" />}
            >
              {list.rows.length === 0 ? (
                <EmptyState icon="book" title={view === "review" ? "Nothing waiting for approval" : view === "all" ? "No notes submitted yet" : "No lesson notes yet"}>
                  {view === "review"
                    ? "Notes teachers send for approval show up here, oldest first."
                    : view === "all"
                      ? "Once teachers send notes for approval, every one shows here."
                      : list.options.length
                        ? "Write this week's note, or plan the term first in the scheme of work."
                        : "You'll be able to write notes once you're assigned to teach a subject."}
                </EmptyState>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th className="w-20">Week</Th>
                      <Th>Topic</Th>
                      {view !== "mine" ? <Th>Teacher</Th> : null}
                      <Th>{view === "review" ? "Sent" : "Updated"}</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((r) => (
                      <tr key={r.n.id} className="hover:bg-paper">
                        <Td className="tabular font-semibold text-body">{r.n.week}</Td>
                        <Td>
                          <Link href={`${base}/${r.n.id}`} className="block font-medium text-ink hover:text-brand-ink">
                            {r.n.topic}
                          </Link>
                          <span className="block fs-13 text-muted">
                            {r.levelName} · {r.subjectName}
                          </span>
                        </Td>
                        {view !== "mine" ? <Td className="text-body">{r.author ?? "—"}</Td> : null}
                        <Td className="whitespace-nowrap text-body">{formatWhen(view === "review" && r.n.submittedAt ? r.n.submittedAt : r.n.updatedAt)}</Td>
                        <Td>
                          <Badge tone={NOTE_STATUS[r.n.status].tone} dot>
                            {NOTE_STATUS[r.n.status].label}
                          </Badge>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </TableCard>
          </>
        )}
      </PageBody>
    </>
  );
}

async function Scheme({ slug, access, plan, currentWeek }: { slug: string; access: Access; plan?: string; currentWeek: number | null }) {
  const [levelId, subjectId] = (plan ?? "").split(":");
  const s = await getScheme(getDb(), access, { levelId, subjectId });
  if (!s.pick) {
    return (
      <Card>
        <EmptyState icon="book" title="No subjects to plan">
          You&apos;ll be able to plan a scheme of work once you&apos;re assigned to teach a subject.
        </EmptyState>
      </Card>
    );
  }
  const planned = s.weeks.filter((w) => w.topic).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Plan for"
          param="plan"
          includeAll={false}
          options={s.options.map((o) => ({
            value: `${o.levelId}:${o.subjectId}`,
            label: `${o.levelName} · ${o.subjectName}`,
          }))}
        />
        <span className="fs-14 text-muted">
          {planned} of {s.weeks.length} weeks planned · {s.term.name}
        </span>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <h2 className="fs-16 font-semibold">
            {s.pick.levelName} {s.pick.subjectName}: scheme of work
          </h2>
          <p className="fs-13.5 text-muted">One topic a week. Teachers&apos; lesson notes start from the topic planned here.</p>
        </div>
        <SchemeEditor
          key={`${s.pick.levelId}:${s.pick.subjectId}:${s.term.id}`}
          slug={slug}
          termId={s.term.id}
          levelId={s.pick.levelId}
          subjectId={s.pick.subjectId}
          weeks={s.weeks}
          editable={s.editable}
          currentWeek={currentWeek}
        />
      </Card>
    </>
  );
}
