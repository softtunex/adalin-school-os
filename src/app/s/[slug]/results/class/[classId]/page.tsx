import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { ToolbarLink } from "@/components/ui/data";
import { Alert, Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { ordinal } from "@/lib/results/compute";
import { getClassResults } from "@/lib/services/results";
import { RESULT_STATUS } from "../../status";
import { ReportEditor, WorkflowBar } from "./class-client";

export const metadata: Metadata = { title: "Class results" };

export default async function ClassResultsPage({ params, searchParams }: { params: Promise<{ slug: string; classId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug, classId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(classId)) notFound();
  const access = await requirePageAccess(slug, ["results:view"]);

  let data;
  try {
    data = await getClassResults(getDb(), access, classId);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }

  const tab = ["broadsheet", "reports", "subjects"].includes(sp.tab ?? "") ? sp.tab! : "broadsheet";
  const base = `/s/${slug}/results/class/${classId}`;
  const submitted = data.sheets.filter((s) => s.status === "submitted").length;
  const ranked = [...data.students].sort((a, b) => (a.result.position ?? 9999) - (b.result.position ?? 9999) || a.lastName.localeCompare(b.lastName));
  const locked = data.status === "approved" || data.status === "published";
  const commentsDone = data.students.filter((s) => s.report?.classTeacherComment).length;

  return (
    <>
      <Topbar
        title={
          <span className="flex items-center gap-2">
            <Link href={`/s/${slug}/results`} className="text-muted hover:text-ink">
              Results
            </Link>
            <Icon name="chevronRight" size={18} className="text-muted" />
            {data.class.name}
          </span>
        }
        actions={
          <>
            <Badge tone={RESULT_STATUS[data.status].tone} dot>
              {RESULT_STATUS[data.status].label}
            </Badge>
            {data.subjects.length ? (
              <ButtonLink href={`${base}/report-cards`} variant="secondary" target="_blank" prefetch={false}>
                <Icon name="download" size={17} /> Report cards (PDF)
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <PageBody>
        <p className="-mt-2 text-[14px] text-muted">
          {data.term.term.name}, {data.term.session.name} session
        </p>
        <WorkflowBar
          slug={slug}
          classId={classId}
          status={data.status}
          permissions={data.permissions}
          submitted={submitted}
          subjects={data.sheets.length}
          commentsDone={commentsDone}
          students={data.students.length}
          nextTermBegins={data.nextTermBegins}
        />

        <StatGrid>
          <StatCard label="Class average" value={data.summary.classAverage ?? "—"} sub={data.summary.classAverage !== null ? "%" : undefined} icon="activity" tone="brand" caption={`${data.summary.withResults} of ${data.summary.students} students have scores`} />
          <StatCard label="Highest average" value={data.summary.highestAverage ?? "—"} icon="star" tone="success" caption={ranked[0]?.result.position === 1 ? `${ranked[0].firstName} ${ranked[0].lastName}` : "—"} />
          <StatCard label="Sheets submitted" value={`${submitted} / ${data.sheets.length}`} icon="clipboard" tone="blue" progress={{ value: data.sheets.length ? (submitted / data.sheets.length) * 100 : 0, tone: submitted === data.sheets.length ? "success" : "blue" }} />
          <StatCard label="Report comments" value={`${commentsDone} / ${data.students.length}`} icon="edit" tone="violet" caption="Written by the class teacher" />
        </StatGrid>

        <Tabs
          current={tab}
          tabs={[
            { key: "broadsheet", label: "Broadsheet", href: base },
            { key: "reports", label: "Report cards", href: `${base}?tab=reports`, count: data.students.length },
            { key: "subjects", label: "Subject sheets", href: `${base}?tab=subjects`, count: data.sheets.length },
          ]}
        />

        {tab === "broadsheet" ? (
          data.subjects.length === 0 ? (
            <TableCard>
              <EmptyState icon="results" title="No scores yet">
                The broadsheet fills in as subject teachers enter scores.
              </EmptyState>
            </TableCard>
          ) : (
            <TableCard title="Broadsheet" toolbar={<ToolbarLink href={`${base}/broadsheet.csv`} icon="download">Export CSV</ToolbarLink>}>
              <div className="overflow-x-auto px-3 pb-3 sm:px-4">
                <table className="w-full border-separate border-spacing-0 text-[14px]">
                  <thead>
                    <tr>
                      <Th className="sticky left-0 z-10 w-12">Pos.</Th>
                      <Th className="sticky left-12 z-10 min-w-[200px]">Student</Th>
                      {data.subjects.map((s) => (
                        <Th key={s.id} className="min-w-[72px] text-center" title={s.name}>
                          {s.code ?? s.name.slice(0, 4)}
                        </Th>
                      ))}
                      <Th className="text-center">Total</Th>
                      <Th className="text-center">Average</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((s) => (
                      <tr key={s.id} className="hover:bg-paper">
                        <Td className="tabular sticky left-0 z-10 bg-canvas font-semibold">{s.result.position ? ordinal(s.result.position) : "—"}</Td>
                        <Td className="sticky left-12 z-10 bg-canvas">
                          <p className="font-medium">
                            {s.lastName} {s.firstName}
                          </p>
                          <p className="font-mono text-[12px] text-muted">{s.admissionNo}</p>
                        </Td>
                        {data.subjects.map((sub) => {
                          const r = s.result.subjects[sub.id];
                          const failed = r?.grade && data.bands.find((b) => b.grade === r.grade)?.passes === false;
                          return (
                            <Td key={sub.id} className="tabular text-center">
                              {r?.total ?? <span className="text-muted">—</span>}
                              {r?.grade ? <span className={cn("block text-[11.5px] font-semibold", failed ? "text-danger" : "text-muted")}>{r.grade}</span> : null}
                            </Td>
                          );
                        })}
                        <Td className="tabular text-center font-semibold">{s.result.subjectsTaken ? s.result.grandTotal : "—"}</Td>
                        <Td className="tabular text-center font-semibold">{s.result.average ?? "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableCard>
          )
        ) : null}

        {tab === "reports" ? (
          <div className="flex flex-col gap-3">
            {locked ? <Alert tone="blue">These results are locked, so comments and ratings can&apos;t be changed.</Alert> : null}
            {!data.permissions.comment && !data.permissions.principalComment ? (
              <Alert tone="blue">Only the class teacher and principal can write report card comments.</Alert>
            ) : null}
            {ranked.map((s) => (
              <ReportEditor
                key={s.id}
                slug={slug}
                pdfHref={`${base}/report-cards?student=${s.id}`}
                student={{
                  id: s.id,
                  name: `${s.firstName} ${s.lastName}`,
                  admissionNo: s.admissionNo,
                  position: s.result.position ? `${ordinal(s.result.position)} of ${data.summary.withResults}` : null,
                  average: s.result.average,
                }}
                report={{ classTeacherComment: s.report?.classTeacherComment ?? "", principalComment: s.report?.principalComment ?? "", ratings: s.report?.ratings ?? {} }}
                canComment={data.permissions.comment && !locked}
                canPrincipal={data.permissions.principalComment && !locked}
              />
            ))}
          </div>
        ) : null}

        {tab === "subjects" ? (
          <TableCard title="Subject sheets">
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th>Students scored</Th>
                  <Th>Status</Th>
                  <Th className="w-40">
                    <span className="sr-only">Action</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.sheets.map((s) => (
                  <tr key={s.subjectId} className="hover:bg-paper">
                    <Td className="font-medium">{s.subjectName}</Td>
                    <Td className="tabular text-body">
                      {s.scored} of {data.students.length}
                    </Td>
                    <Td>{s.status === "submitted" ? <Badge tone="success" dot>Submitted</Badge> : s.scored ? <Badge tone="warning" dot>In progress</Badge> : <Badge dot>Not started</Badge>}</Td>
                    <Td className="text-right">
                      <ButtonLink href={`/s/${slug}/results/sheet?class=${classId}&subject=${s.subjectId}`} variant="secondary" size="sm">
                        Open sheet
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableCard>
        ) : null}
      </PageBody>
    </>
  );
}
