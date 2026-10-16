import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { ButtonLink } from "@/components/ui/button";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/data";
import { Badge, EmptyState, Progress, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatDue } from "@/lib/dates";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { EXAM_PAGE_SIZE, listExams, listQuestions, QUESTION_PAGE_SIZE } from "@/lib/services/cbt";
import { BankButtons, QuestionActions } from "./bank-client";
import { EXAM_STATE } from "./shared";

export const metadata: Metadata = { title: "CBT exams" };

type SP = { tab?: string; subject?: string; class?: string; level?: string; kind?: string; state?: string; q?: string; page?: string };

export default async function CbtPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["teaching:cbt"]);
  if (!hasFeature(access.plan, "cbt")) {
    return (
      <>
        <Topbar title="CBT exams" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="cbt" text="Build a question bank, run timed computer-based tests on phones or the school lab, and get objective questions marked the moment students submit." />
        </PageBody>
      </>
    );
  }
  const tab = sp.tab === "bank" ? "bank" : "exams";
  const base = `/s/${slug}/cbt`;
  return (
    <>
      <Topbar
        title="CBT exams"
        context={access.school.name}
        actions={
          tab === "exams" ? (
            <ButtonLink href={`${base}/exams/new`}>
              <Icon name="plus" size={18} strokeWidth={2.4} /> New exam
            </ButtonLink>
          ) : null
        }
      />
      <PageBody>
        <Tabs
          current={tab}
          tabs={[
            { key: "exams", label: "Exams", href: base },
            { key: "bank", label: "Question bank", href: `${base}?tab=bank` },
          ]}
        />
        {tab === "bank" ? <Bank slug={slug} access={access} sp={sp} /> : <Exams slug={slug} access={access} sp={sp} />}
      </PageBody>
    </>
  );
}

async function Exams({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const page = Number(sp.page) || 1;
  const list = await listExams(getDb(), access, { subjectId: sp.subject, classId: sp.class, state: sp.state, q: sp.q, page });
  const filtered = Boolean(sp.subject || sp.class || sp.state || sp.q);
  return (
    <>
      <StatGrid>
        <StatCard label="Open now" value={list.stats.open} icon="monitor" tone="brand" caption="Students can write these" />
        <StatCard label="Scheduled" value={list.stats.scheduled} icon="calendar" tone="blue" caption="Opening later" />
        <StatCard label="Scripts to mark" value={list.stats.toMark} icon="edit" tone={list.stats.toMark ? "warning" : "success"} caption={list.stats.toMark ? "Theory answers waiting" : "All marked"} />
        <StatCard label="Average score" value={list.stats.average === null ? "—" : `${list.stats.average}%`} icon="trending" tone="violet" caption="Marked scripts this term" />
      </StatGrid>
      <TableCard
        title="This term's exams"
        toolbar={
          <>
            <SearchInput placeholder="Search exams…" />
            <FilterSelect label="Subject" param="subject" options={list.subjects.map((s) => ({ value: s.id, label: s.name }))} />
            <FilterSelect label="Class" param="class" options={list.classes.map((c) => ({ value: c.id, label: c.name }))} />
            <FilterSelect label="Status" param="state" options={Object.entries(EXAM_STATE).map(([value, s]) => ({ value, label: s.label }))} />
          </>
        }
        footer={<Pagination page={page} pageSize={EXAM_PAGE_SIZE} total={list.total} noun="exams" />}
      >
        {list.rows.length === 0 ? (
          <EmptyState icon="monitor" title={filtered ? "No exams match these filters" : "No CBT exams yet this term"}>
            {filtered ? "Try a different search or clear the filters." : "Add questions to the bank (or paste them from Word), then build a timed exam for your classes."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Exam</Th>
                <Th>Classes</Th>
                <Th>Window</Th>
                <Th className="w-44">Finished</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => {
                const st = EXAM_STATE[r.state];
                return (
                  <tr key={r.e.id} className="hover:bg-paper">
                    <Td>
                      <Link href={`/s/${slug}/cbt/exams/${r.e.id}`} className="block font-medium text-ink hover:text-brand-ink">
                        {r.e.title}
                      </Link>
                      <span className="block fs-13 text-muted">
                        {r.subjectName} · {r.questions} question{r.questions === 1 ? "" : "s"} · {r.e.durationMins} min
                      </span>
                    </Td>
                    <Td className="text-body">{r.classNames.join(", ")}</Td>
                    <Td className="whitespace-nowrap fs-14 text-body">
                      <span className="block">Opens {formatDue(r.e.opensAt)}</span>
                      <span className="block fs-13 text-muted">Closes {formatDue(r.e.closesAt)}</span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1">
                          <Progress value={r.roll ? (r.done / r.roll) * 100 : 0} tone="brand" />
                        </div>
                        <span className="tabular fs-13.5 text-body">
                          {r.done}/{r.roll}
                        </span>
                      </div>
                      {r.toMark ? <span className="mt-1 block fs-13 font-medium text-warning-deep">{r.toMark} to mark</span> : null}
                    </Td>
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
    </>
  );
}

async function Bank({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const page = Number(sp.page) || 1;
  const list = await listQuestions(getDb(), access, { subjectId: sp.subject, levelId: sp.level, kind: sp.kind, q: sp.q, page });
  const filtered = Boolean(sp.subject || sp.level || sp.kind || sp.q);
  return (
    <>
      <StatGrid>
        <StatCard label="Questions" value={list.stats.total} icon="layers" tone="brand" caption="In your bank" />
        <StatCard label="Objective" value={list.stats.objective} icon="checkCircle" tone="success" caption="Marked automatically" />
        <StatCard label="Theory" value={list.stats.theory} icon="edit" tone="blue" caption="You mark these" />
        <StatCard label="Subjects" value={list.stats.subjects} icon="bookOpen" tone="violet" caption="With questions" />
      </StatGrid>
      <TableCard
        title="Question bank"
        toolbar={
          <>
            <SearchInput placeholder="Search questions…" />
            <FilterSelect label="Subject" param="subject" options={list.subjects.map((s) => ({ value: s.id, label: s.name }))} />
            <FilterSelect label="Level" param="level" options={list.levels.map((l) => ({ value: l.id, label: l.name }))} />
            <FilterSelect
              label="Type"
              param="kind"
              options={[
                { value: "objective", label: "Objective" },
                { value: "theory", label: "Theory" },
              ]}
            />
            <BankButtons slug={slug} subjects={list.subjects} levels={list.levels} />
          </>
        }
        footer={<Pagination page={page} pageSize={QUESTION_PAGE_SIZE} total={list.total} noun="questions" />}
      >
        {list.rows.length === 0 ? (
          <EmptyState icon="layers" title={filtered ? "No questions match these filters" : "Your question bank is empty"}>
            {filtered ? "Try a different search or clear the filters." : list.subjects.length ? "Add questions one by one, or paste a whole test from Word in one go." : "You'll be able to add questions once you're assigned to teach a subject."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Question</Th>
                <Th>Subject</Th>
                <Th>Type</Th>
                <Th className="text-right">Marks</Th>
                <Th className="w-12">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(({ q, subjectName, levelName, used }) => (
                <tr key={q.id} className="align-top hover:bg-paper">
                  <Td>
                    <span className="line-clamp-2 block max-w-[52ch] text-ink">{q.body}</span>
                    {q.kind === "objective" ? (
                      <span className="mt-1 block fs-13 text-muted">
                        Answer: <span className="font-medium text-success-deep">{q.options[q.answer ?? 0]}</span>
                        {` · ${q.options.length} options`}
                      </span>
                    ) : null}
                    {q.topic || used ? <span className="mt-0.5 block fs-13 text-muted">{[q.topic, used ? `In ${used} exam${used === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-body">
                    {subjectName}
                    {levelName ? <span className="block fs-13 text-muted">{levelName}</span> : null}
                  </Td>
                  <Td>
                    <Badge tone={q.kind === "objective" ? "success" : "blue"}>{q.kind === "objective" ? "Objective" : "Theory"}</Badge>
                  </Td>
                  <Td className="tabular text-right text-body">{q.marks}</Td>
                  <Td className="text-right">
                    <QuestionActions
                      slug={slug}
                      subjects={list.subjects}
                      levels={list.levels}
                      locked={false}
                      question={{ id: q.id, subjectId: q.subjectId, levelId: q.levelId, topic: q.topic, kind: q.kind, body: q.body, options: q.options, answer: q.answer, marks: q.marks }}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableCard>
    </>
  );
}
