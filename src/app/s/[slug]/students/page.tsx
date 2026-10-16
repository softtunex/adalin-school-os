import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Avatar, Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th, type Tone } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { STUDENT_STATUSES } from "@/lib/db/schema";
import { getLimit } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { listStudents, STUDENT_PAGE_SIZE, studentStats } from "@/lib/services/students";
import { StudentRowActions } from "./students-client";

export const metadata: Metadata = { title: "Students" };

const STATUS_TONE: Record<string, Tone> = { active: "success", graduated: "blue", withdrawn: "neutral", suspended: "danger" };
const STATUS_LABEL: Record<string, string> = { active: "Active", graduated: "Graduated", withdrawn: "Withdrawn", suspended: "Suspended" };

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) years--;
  return years;
}

function formatPhone(p: string | null) {
  if (!p) return null;
  return p.startsWith("+234") && p.length === 14 ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p;
}

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; class?: string; status?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["students:view"]);
  const db = getDb();
  const status = (STUDENT_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STUDENT_STATUSES)[number]) : sp.status === "all" ? "all" : "active";
  const [list, stats, classes] = await Promise.all([
    listStudents(db, access, { q: sp.q, classId: sp.class, status, page: Number(sp.page) || 1 }),
    studentStats(db, access),
    listClassOptions(db, access),
  ]);
  const limit = getLimit(access.plan, "students");
  const canCreate = can(access, "students:create");
  const filtered = Boolean(sp.q || sp.class || (sp.status && sp.status !== "active"));
  const exportQs = new URLSearchParams(Object.entries({ q: sp.q, class: sp.class, status: sp.status }).filter(([, v]) => v) as [string, string][]).toString();
  const base = `/s/${slug}/students`;

  return (
    <>
      <Topbar
        title="Students"
        context={access.school.name}
        actions={
          canCreate ? (
            <>
              {can(access, "students:promote") ? (
                <ButtonLink href={`${base}/promote`} variant="ghost" className="hidden sm:inline-flex">
                  <Icon name="upgrade" size={18} />
                  Promote
                </ButtonLink>
              ) : null}
              <ButtonLink href={`${base}/logins`} variant="ghost" className="hidden sm:inline-flex">
                <Icon name="key" size={18} />
                Logins
              </ButtonLink>
              {can(access, "students:import") ? (
                <ButtonLink href={`${base}/import`} variant="secondary">
                  <Icon name="upload" size={18} />
                  Import
                </ButtonLink>
              ) : null}
              <ButtonLink href={`${base}/new`}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                Add student
              </ButtonLink>
            </>
          ) : null
        }
      />
      <PageBody>
        {list.scoped ? (
          <p className="fs-14 text-muted">Showing students in the classes you teach.</p>
        ) : null}
        <StatGrid>
          <StatCard
            label="Active students"
            value={stats.active}
            icon="graduation"
            tone="brand"
            progress={limit !== null ? { value: (stats.active / limit) * 100, tone: stats.active >= limit ? "danger" : "brand" } : undefined}
            caption={limit !== null ? `${stats.active} of ${limit} on the ${access.plan.name} plan` : `${classes.length} classes`}
          />
          <StatCard
            label="Girls · Boys"
            value={
              <>
                {stats.female}
                <span className="text-muted"> · </span>
                {stats.male}
              </>
            }
            icon="users"
            tone="violet"
            caption={stats.active ? `${Math.round((stats.female / stats.active) * 100)}% girls · ${100 - Math.round((stats.female / stats.active) * 100)}% boys` : "No students yet"}
          />
          <StatCard label="Missing a parent" value={stats.noGuardian} icon="alert" tone={stats.noGuardian ? "warning" : "success"} caption={stats.noGuardian ? "No parent contact on file" : "Every student has a contact"} />
          <StatCard label="Not in a class" value={stats.noClass} icon="layers" tone={stats.noClass ? "danger" : "success"} caption={stats.left ? `${stats.left} withdrawn or graduated` : "All placed"} />
        </StatGrid>

        <TableCard
          title="All students"
          toolbar={
            <>
              <SearchInput placeholder="Search name or admission no…" />
              <FilterSelect label="Class" param="class" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
              <FilterSelect
                label="Status"
                param="status"
                options={[
                  { value: "all", label: "Any status" },
                  ...STUDENT_STATUSES.filter((s) => s !== "active").map((s) => ({ value: s, label: STATUS_LABEL[s] })),
                ]}
              />
              {can(access, "students:export") ? (
                <ToolbarLink href={`${base}/export${exportQs ? `?${exportQs}` : ""}`} icon="download">
                  Export CSV
                </ToolbarLink>
              ) : null}
            </>
          }
          footer={<Pagination page={Number(sp.page) || 1} pageSize={STUDENT_PAGE_SIZE} total={list.total} noun="students" />}
        >
          {list.rows.length === 0 ? (
            <EmptyState
              icon="graduation"
              title={filtered ? "No students match these filters" : list.scoped ? "No students in your classes yet" : "No students yet"}
              action={
                !filtered && canCreate ? (
                  <div className="flex flex-wrap justify-center gap-2.5">
                    <ButtonLink href={`${base}/import`} variant="secondary">
                      Import from Excel
                    </ButtonLink>
                    <ButtonLink href={`${base}/new`}>Add a student</ButtonLink>
                  </div>
                ) : null
              }
            >
              {filtered ? "Try a different search or clear the filters." : "Add students one by one, or import your whole register from an Excel sheet in one go."}
            </EmptyState>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line border-t border-line md:hidden">
                {list.rows.map((s) => {
                  const name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <Link href={`${base}/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size={40} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{name}</span>
                          <span className="block truncate fs-13 text-muted">
                            {s.className ?? "No class"} · <span className="font-mono">{s.admissionNo}</span>
                          </span>
                        </span>
                      </Link>
                      {s.status !== "active" ? <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge> : null}
                      <StudentRowActions
                        slug={slug}
                        student={{ id: s.id, name, status: s.status }}
                        canUpdate={can(access, "students:update")}
                        canChangeStatus={can(access, "students:deactivate")}
                      />
                    </li>
                  );
                })}
              </ul>
              <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Class</Th>
                  <Th>Gender · Age</Th>
                  <Th>Parent or guardian</Th>
                  <Th>Status</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((s) => {
                  const name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
                  const years = age(s.dateOfBirth);
                  return (
                    <tr key={s.id} className="group hover:bg-paper">
                      <Td>
                        <Link href={`${base}/${s.id}`} className="flex items-center gap-3">
                          <Avatar name={`${s.firstName} ${s.lastName}`} size={36} />
                          <span className="min-w-0">
                            <span className="block font-medium text-ink group-hover:text-blue">{name}</span>
                            <span className="tabular block font-mono fs-12.5 text-muted">{s.admissionNo}</span>
                          </span>
                        </Link>
                      </Td>
                      <Td>{s.className ?? <span className="text-muted">No class</span>}</Td>
                      <Td className="text-body">
                        {s.gender === "female" ? "Female" : "Male"}
                        {years !== null ? <span className="text-muted"> · {years}</span> : null}
                      </Td>
                      <Td>
                        {s.guardian ? (
                          <>
                            <p className="text-ink">{s.guardian.name}</p>
                            <p className="tabular fs-13 text-muted">{formatPhone(s.guardian.phone) ?? "No phone"}</p>
                          </>
                        ) : (
                          <Badge tone="warning">No contact</Badge>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[s.status]} dot>
                          {STATUS_LABEL[s.status]}
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        <StudentRowActions
                          slug={slug}
                          student={{ id: s.id, name, status: s.status }}
                          canUpdate={can(access, "students:update")}
                          canChangeStatus={can(access, "students:deactivate")}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
              </div>
            </>
          )}
        </TableCard>

        {!filtered && list.rows.length > 0 && stats.noGuardian > 0 && canCreate ? (
          <Card className="flex flex-wrap items-center gap-3 p-4 fs-14 text-body">
            <Icon name="info" size={18} className="text-warning" />
            {stats.noGuardian} active {stats.noGuardian === 1 ? "student has" : "students have"} no parent contact. Open their profile to add one so fee reminders and results can reach home.
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}
