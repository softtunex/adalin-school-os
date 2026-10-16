import type { Metadata } from "next";
import Link from "next/link";
import { ReportScene } from "@/components/illustrations/art";
import { Illustration } from "@/components/illustrations";
import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, Card, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/services/access";
import { studentScopeFor } from "@/lib/services/results-scope";
import { listClassResultProgress, listMySheets } from "@/lib/services/results";
import { RESULT_STATUS } from "./status";

export const metadata: Metadata = { title: "Results" };


export default async function ResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePageAccess(slug, ["results:enter", "results:view"]);
  const db = getDb();

  let sheets: Awaited<ReturnType<typeof listMySheets>>;
  let progress: Awaited<ReturnType<typeof listClassResultProgress>>;
  try {
    [sheets, progress] = await Promise.all([listMySheets(db, access), listClassResultProgress(db, access)]);
  } catch (error) {
    if (error instanceof AppError) {
      return (
        <>
          <Topbar title="Results" />
          <PageBody>
            <Card className="overflow-hidden">
              <div className="grid items-center lg:grid-cols-[1fr_360px]">
                <div className="p-8">
                  <h2 className="font-display text-[26px] font-black">Results start once a term is running</h2>
                  <p className="mt-2 text-[15px] text-muted">{error.message}</p>
                  {can(access, "academics:manage") ? (
                    <ButtonLink href={`/s/${slug}/academics`} className="mt-6">
                      Go to Academics
                    </ButtonLink>
                  ) : null}
                </div>
                <div className="hidden bg-violet-wash p-8 lg:block">
                  <Illustration name="report-cards" fallback={<ReportScene className="w-full" />} className="w-full" />
                </div>
              </div>
            </Card>
          </PageBody>
        </>
      );
    }
    throw error;
  }

  const allScope = await studentScopeFor(db, access);
  const term = progress.term;
  const mySheets = allScope ? [] : sheets.sheets;
  const submittedSheets = mySheets.filter((s) => s.status === "submitted").length;
  const classes = progress.classes;
  const published = classes.filter((c) => c.status === "published").length;
  const totalSubjects = classes.reduce((n, c) => n + c.subjects, 0);
  const totalSubmitted = classes.reduce((n, c) => n + c.submitted, 0);

  return (
    <>
      <Topbar title="Results" context={`${term.term.name}, ${term.session.name}`} />
      <PageBody>
        <StatGrid>
          {mySheets.length ? (
            <StatCard
              label="Your score sheets"
              value={`${submittedSheets} / ${mySheets.length}`}
              icon="edit"
              tone="brand"
              progress={{ value: (submittedSheets / mySheets.length) * 100, tone: submittedSheets === mySheets.length ? "success" : "brand" }}
              caption="Submitted to class teachers"
            />
          ) : (
            <StatCard
              label="Sheets submitted"
              value={`${totalSubmitted} / ${totalSubjects}`}
              icon="edit"
              tone="brand"
              progress={{ value: totalSubjects ? (totalSubmitted / totalSubjects) * 100 : 0, tone: "brand" }}
              caption="Across every class and subject"
            />
          )}
          <StatCard label="Classes" value={classes.length} icon="layers" tone="blue" caption={`${classes.filter((c) => c.isMine).length ? "Including your form class" : "You can view"}`} />
          <StatCard label="Ready to publish" value={classes.filter((c) => c.status === "approved").length} icon="badgeCheck" tone="violet" caption="Approved, waiting to publish" />
          <StatCard label="Published" value={`${published} / ${classes.length}`} icon="checkCircle" tone="success" caption="Visible to parents" />
        </StatGrid>

        {mySheets.length ? (
          <TableCard title="Your score sheets">
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th>Class</Th>
                  <Th>Progress</Th>
                  <Th>Status</Th>
                  <Th className="w-40">
                    <span className="sr-only">Action</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {mySheets.map((s) => {
                  const locked = s.classStatus === "approved" || s.classStatus === "published";
                  return (
                    <tr key={`${s.classId}-${s.subjectId}`} className="hover:bg-paper">
                      <Td className="font-medium">{s.subjectName}</Td>
                      <Td>{s.className}</Td>
                      <Td className="min-w-[160px]">
                        <span className="tabular text-body">
                          {s.scored} of {s.roll} students
                        </span>
                        <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full bg-success" style={{ width: `${s.roll ? (s.scored / s.roll) * 100 : 0}%` }} />
                        </div>
                      </Td>
                      <Td>
                        {locked ? (
                          <Badge tone="violet" dot>Locked</Badge>
                        ) : s.status === "submitted" ? (
                          <Badge tone="success" dot>Submitted</Badge>
                        ) : (
                          <Badge tone="warning" dot>Draft</Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        <ButtonLink href={`/s/${slug}/results/sheet?class=${s.classId}&subject=${s.subjectId}`} variant={s.status === "submitted" || locked ? "secondary" : "primary"} size="sm">
                          {s.status === "submitted" || locked ? "View scores" : "Enter scores"}
                        </ButtonLink>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableCard>
        ) : null}

        {classes.length ? (
          <TableCard title="Class results">
            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th>Subject sheets submitted</Th>
                  <Th>Status</Th>
                  <Th className="w-40">
                    <span className="sr-only">Action</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id} className="hover:bg-paper">
                    <Td>
                      <Link href={`/s/${slug}/results/class/${c.id}`} className="font-medium text-ink hover:text-blue">
                        {c.name}
                      </Link>
                      {c.isMine ? <Badge tone="brand" className="ml-2">Your class</Badge> : null}
                    </Td>
                    <Td className="min-w-[180px]">
                      <span className="tabular text-body">
                        {c.submitted} of {c.subjects}
                      </span>
                      <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-sunken">
                        <div className={c.submitted === c.subjects && c.subjects ? "h-full bg-success" : "h-full bg-brand"} style={{ width: `${c.subjects ? (c.submitted / c.subjects) * 100 : 0}%` }} />
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={RESULT_STATUS[c.status].tone} dot>
                        {RESULT_STATUS[c.status].label}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <ButtonLink href={`/s/${slug}/results/class/${c.id}`} variant="secondary" size="sm">
                        Open results
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableCard>
        ) : null}

        {!mySheets.length && !classes.length ? (
          <Alert tone="blue" title="Nothing assigned to you yet">
            Score sheets appear here once you&apos;re assigned subjects in Academics, or made the class teacher of a class.
          </Alert>
        ) : null}
      </PageBody>
    </>
  );
}
