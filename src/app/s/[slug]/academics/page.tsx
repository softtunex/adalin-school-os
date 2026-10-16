import type { Metadata } from "next";
import { ReportScene } from "@/components/illustrations/art";
import { Illustration } from "@/components/illustrations";
import { PageBody, Topbar } from "@/components/topbar";
import { FilterSelect } from "@/components/ui/data";
import { Avatar, Badge, Card, EmptyState, IconChip, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { SECTION_LABELS, sessionNameFor } from "@/lib/academics/templates";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/services/access";
import { getAcademicOverview } from "@/lib/services/academics";
import { getElectiveMatrix } from "@/lib/services/electives";
import type { Access } from "@/lib/services/access";
import { ElectivesGrid } from "./electives-grid";
import { BandsEditor, ComponentsEditor } from "./assessment-editor";
import { getAssessmentConfig } from "@/lib/services/assessment";
import {
  AddArmButton,
  AddLevelButton,
  ClassActions,
  NewSessionButton,
  SetupWizard,
  SubjectActions,
  SubjectEditorButton,
  TeacherSelect,
  TermActions,
} from "./academics-client";

export const metadata: Metadata = { title: "Academics" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : null);

export default async function AcademicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; class?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["academics:view"]);
  const data = await getAcademicOverview(getDb(), access);
  const canManage = can(access, "academics:manage");
  const base = `/s/${slug}/academics`;

  if (data.levels.length === 0) {
    return (
      <>
        <Topbar title="Academics" context={access.school.name} />
        <PageBody>
          {canManage ? (
            <Card className="overflow-hidden">
              <div className="grid lg:grid-cols-[1fr_380px]">
                <div className="p-6 sm:p-8">
                  <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-brand-ink">One-click setup</p>
                  <h2 className="mt-1 font-display text-[30px] font-black leading-tight">Set up your classes and subjects</h2>
                  <p className="mt-2 max-w-[56ch] text-[15px] text-muted">
                    Pick your curriculum and the sections you run. We&apos;ll create every class, the three terms and the standard subjects. You can rename, add or remove anything afterwards.
                  </p>
                  <SetupWizard slug={slug} defaultSession={sessionNameFor()} defaultTemplate={access.school.curriculum === "british" ? "british" : "nigerian"} />
                </div>
                <div className="hidden items-center justify-center bg-violet-wash p-8 lg:flex">
                  <Illustration name="report-cards" fallback={<ReportScene className="w-full" />} className="w-full" />
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState icon="bookOpen" title="Classes haven't been set up yet">
                Your school admin will set up classes and subjects. They&apos;ll appear here once that&apos;s done.
              </EmptyState>
            </Card>
          )}
        </PageBody>
      </>
    );
  }

  const tab = ["classes", "subjects", "terms", "teachers", "electives", "assessment"].includes(sp.tab ?? "") ? sp.tab! : "classes";
  const classes = data.levels.flatMap((l) => l.classes);
  const staffName = new Map(data.staff.map((s) => [s.membershipId, s.name]));
  const totalStudents = classes.reduce((n, c) => n + c.studentCount, 0);
  const levelName = new Map(data.levels.map((l) => [l.id, l.name]));

  return (
    <>
      <Topbar
        title="Academics"
        context={access.school.name}
        actions={
          canManage ? (
            tab === "subjects" ? (
              <SubjectEditorButton slug={slug} levels={data.levels.map((l) => ({ id: l.id, name: l.name }))} />
            ) : tab === "terms" ? (
              <>
                {can(access, "students:promote") ? (
                  <ButtonLink href={`/s/${slug}/students/promote`} variant="secondary">
                    <Icon name="upgrade" size={18} /> Promote students
                  </ButtonLink>
                ) : null}
                <NewSessionButton slug={slug} />
              </>
            ) : tab === "classes" ? (
              <AddLevelButton slug={slug} />
            ) : null
          ) : null
        }
      />
      <PageBody>
        <StatGrid>
          <StatCard label="Classes" value={classes.length} icon="layers" tone="brand" caption={`${data.levels.length} class levels`} />
          <StatCard label="Subjects" value={data.subjects.length} icon="bookOpen" tone="success" caption={`${data.assignments.length} teacher assignments`} />
          <StatCard label="Students in classes" value={totalStudents} icon="graduation" tone="blue" caption={classes.length ? `About ${Math.round(totalStudents / classes.length)} per class` : undefined} />
          <StatCard label="Current term" value={data.currentTerm?.name.replace(" Term", "") ?? "—"} sub={data.currentTerm ? "term" : undefined} icon="calendarCheck" tone="violet" caption={data.currentSession ? `${data.currentSession.name} session` : "No current term"} />
        </StatGrid>

        <Tabs
          current={tab}
          tabs={[
            { key: "classes", label: "Classes", href: base, count: classes.length },
            { key: "subjects", label: "Subjects", href: `${base}?tab=subjects`, count: data.subjects.length },
            { key: "terms", label: "Sessions & terms", href: `${base}?tab=terms` },
            { key: "teachers", label: "Subject teachers", href: `${base}?tab=teachers` },
            { key: "electives", label: "Electives", href: `${base}?tab=electives` },
            { key: "assessment", label: "Assessment & grading", href: `${base}?tab=assessment` },
          ]}
        />

        {tab === "classes" ? (
          <div className="flex flex-col gap-5">
            {data.levels.map((level) => (
              <TableCard
                key={level.id}
                title={
                  <span className="flex items-center gap-2.5">
                    {level.name}
                    <Badge>{SECTION_LABELS[level.section]}</Badge>
                  </span>
                }
                toolbar={canManage ? <AddArmButton slug={slug} levelId={level.id} levelName={level.name} /> : null}
              >
                <Table fixed>
                  <thead>
                    <tr>
                      <Th className="w-[26%]">Class</Th>
                      <Th className="w-[34%]">Class teacher</Th>
                      <Th className="w-[22%]">Students</Th>
                      <Th>Subjects</Th>
                      <Th className="w-12">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {level.classes.map((c) => {
                      const teacher = c.classTeacherId ? staffName.get(c.classTeacherId) : null;
                      const fill = c.capacity ? Math.min(100, (c.studentCount / c.capacity) * 100) : null;
                      return (
                        <tr key={c.id} className="hover:bg-paper">
                          <Td className="font-medium">{c.name}</Td>
                          <Td>
                            {teacher ? (
                              <span className="flex items-center gap-2.5">
                                <Avatar name={teacher} size={28} />
                                {teacher}
                              </span>
                            ) : (
                              <span className="text-muted">Not assigned</span>
                            )}
                          </Td>
                          <Td className="min-w-[160px]">
                            <span className="tabular">
                              {c.studentCount}
                              {c.capacity ? <span className="text-muted"> / {c.capacity}</span> : null}
                            </span>
                            {fill !== null ? (
                              <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-sunken">
                                <div className={fill >= 100 ? "h-full bg-danger" : "h-full bg-success"} style={{ width: `${fill}%` }} />
                              </div>
                            ) : null}
                          </Td>
                          <Td className="tabular text-body">{level.subjectIds.length}</Td>
                          <Td className="text-right">
                            {canManage ? (
                              <ClassActions
                                slug={slug}
                                cls={{ id: c.id, name: c.name, classTeacherId: c.classTeacherId, capacity: c.capacity, studentCount: c.studentCount }}
                                staff={data.staff}
                              />
                            ) : null}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableCard>
            ))}
          </div>
        ) : null}

        {tab === "subjects" ? (
          <TableCard title="All subjects">
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th>Code</Th>
                  <Th>Offered in</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.subjects.map((s) => {
                  const links = data.levelSubjects.filter((ls) => ls.subjectId === s.id);
                  return (
                    <tr key={s.id} className="hover:bg-paper">
                      <Td className="font-medium">{s.name}</Td>
                      <Td className="font-mono text-[13px] text-body">{s.code ?? "—"}</Td>
                      <Td>
                        <div className="flex max-w-[560px] flex-wrap gap-1.5">
                          {links.length === 0 ? <span className="text-muted">Not offered yet</span> : null}
                          {links.map((ls) => (
                            <Badge key={ls.levelId} tone={ls.isElective ? "violet" : "neutral"}>
                              {levelName.get(ls.levelId)}
                              {ls.isElective ? " · elective" : ""}
                            </Badge>
                          ))}
                        </div>
                      </Td>
                      <Td className="text-right">
                        {canManage ? (
                          <SubjectActions
                            slug={slug}
                            subject={{ id: s.id, name: s.name, code: s.code ?? "", levelIds: links.map((l) => l.levelId), electiveLevelIds: links.filter((l) => l.isElective).map((l) => l.levelId) }}
                            levels={data.levels.map((l) => ({ id: l.id, name: l.name }))}
                          />
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableCard>
        ) : null}

        {tab === "terms" ? (
          <div className="flex flex-col gap-5">
            {[...data.sessions].reverse().map((session) => (
              <TableCard
                key={session.id}
                title={
                  <span className="flex items-center gap-2.5">
                    {session.name} session
                    {session.isCurrent ? <Badge tone="success" dot>Current</Badge> : null}
                  </span>
                }
              >
                <Table>
                  <thead>
                    <tr>
                      <Th>Term</Th>
                      <Th>Starts</Th>
                      <Th>Ends</Th>
                      <Th>Status</Th>
                      <Th className="w-12">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.terms.map((t) => (
                      <tr key={t.id} className="hover:bg-paper">
                        <Td className="font-medium">
                          <span className="flex items-center gap-3">
                            <IconChip icon="calendar" tone={t.isCurrent ? "brand" : "neutral"} size={32} />
                            {t.name}
                          </span>
                        </Td>
                        <Td className="tabular text-body">{fmtDate(t.startsOn) ?? <span className="text-muted">Not set</span>}</Td>
                        <Td className="tabular text-body">{fmtDate(t.endsOn) ?? <span className="text-muted">Not set</span>}</Td>
                        <Td>{t.isCurrent ? <Badge tone="brand" dot>Current term</Badge> : <Badge>Not current</Badge>}</Td>
                        <Td className="text-right">{canManage ? <TermActions slug={slug} term={{ id: t.id, name: t.name, startsOn: t.startsOn, endsOn: t.endsOn, isCurrent: t.isCurrent }} /> : null}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableCard>
            ))}
          </div>
        ) : null}

        {tab === "teachers" ? <TeachersTab slug={slug} sp={sp} data={data} canManage={canManage} /> : null}
        {tab === "electives" ? <ElectivesTab slug={slug} classId={sp.class} data={data} access={access} /> : null}
        {tab === "assessment" ? <AssessmentTab slug={slug} access={access} /> : null}
      </PageBody>
    </>
  );
}

function TeachersTab({
  slug,
  sp,
  data,
  canManage,
}: {
  slug: string;
  sp: { class?: string };
  data: Awaited<ReturnType<typeof getAcademicOverview>>;
  canManage: boolean;
}) {
  const classes = data.levels.flatMap((l) => l.classes.map((c) => ({ ...c, level: l })));
  const selected = classes.find((c) => c.id === sp.class) ?? classes[0];
  const subjects = data.subjects.filter((s) => selected.level.subjectIds.includes(s.id));
  const assigned = new Map(data.assignments.filter((a) => a.classId === selected.id).map((a) => [a.subjectId, a.membershipId]));
  const done = subjects.filter((s) => assigned.has(s.id)).length;

  return (
    <TableCard
      title={
        <span className="flex flex-wrap items-center gap-2.5">
          {selected.name}
          <Badge tone={done === subjects.length ? "success" : "warning"}>
            {done} of {subjects.length} subjects assigned
          </Badge>
        </span>
      }
      toolbar={<FilterSelect label="Class" param="class" includeAll={false} options={classes.map((c) => ({ value: c.id, label: c.name }))} />}
    >
      {subjects.length === 0 ? (
        <EmptyState icon="bookOpen" title="No subjects offered in this class">
          Add subjects to {selected.level.name} from the Subjects tab.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Subject</Th>
              <Th>Teacher</Th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className="hover:bg-paper">
                <Td className="w-1/3 font-medium">{s.name}</Td>
                <Td>
                  <TeacherSelect slug={slug} classId={selected.id} subjectId={s.id} current={assigned.get(s.id) ?? ""} staff={data.staff} disabled={!canManage} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}

async function ElectivesTab({ slug, classId, data, access }: { slug: string; classId?: string; data: Awaited<ReturnType<typeof getAcademicOverview>>; access: Access }) {
  const classesWithElectives = data.levels
    .filter((l) => data.levelSubjects.some((ls) => ls.levelId === l.id && ls.isElective))
    .flatMap((l) => l.classes);
  if (classesWithElectives.length === 0) {
    return (
      <TableCard>
        <EmptyState icon="bookOpen" title="No elective subjects yet">
          Mark a subject as elective for a class level in the Subjects tab, then choose which students take it here.
        </EmptyState>
      </TableCard>
    );
  }
  const selected = classesWithElectives.find((c) => c.id === classId) ?? classesWithElectives[0];
  const matrix = await getElectiveMatrix(getDb(), access, selected.id);
  return (
    <TableCard
      title={
        <span className="flex flex-wrap items-center gap-2.5">
          {matrix.class.name}
          <Badge>{matrix.electives.length} electives</Badge>
        </span>
      }
      toolbar={<FilterSelect label="Class" param="class" includeAll={false} options={classesWithElectives.map((c) => ({ value: c.id, label: c.name }))} />}
    >
      <p className="px-5 pb-3 text-[14px] text-muted">Tick the elective subjects each student takes. Compulsory subjects are added automatically. Only ticked students appear on an elective&apos;s score sheet.</p>
      {matrix.students.length === 0 ? (
        <EmptyState icon="graduation" title="No students in this class">Add students first.</EmptyState>
      ) : (
        <ElectivesGrid key={matrix.class.id} slug={slug} classId={matrix.class.id} electives={matrix.electives} students={matrix.students} initial={matrix.picks} editable={can(access, "students:update")} />
      )}
    </TableCard>
  );
}

async function AssessmentTab({ slug, access }: { slug: string; access: Access }) {
  const config = await getAssessmentConfig(getDb(), access);
  const editable = can(access, "academics:manage");
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
      <ComponentsEditor slug={slug} initial={config.components.map((c) => ({ name: c.name, maxScore: c.maxScore }))} locked={config.hasScores} editable={editable} />
      <BandsEditor slug={slug} initial={config.bands.map((b) => ({ grade: b.grade, minScore: b.minScore, remark: b.remark, passes: b.passes }))} editable={editable} />
    </div>
  );
}
