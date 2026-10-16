import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/data";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th, type Tone } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requireAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";
import { listClassOptions } from "@/lib/services/academics";
import { lagosToday } from "@/lib/services/attendance";
import { BEHAVIOUR_PAGE_SIZE, behaviourStudents, disciplineSettings, getLeaderboard, listBehaviour, stillRemovable } from "@/lib/services/discipline";
import { BehaviourActions, RecordButton } from "./discipline-client";

export const metadata: Metadata = { title: "Behaviour" };

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  minor: { label: "Minor", tone: "neutral" },
  moderate: { label: "Moderate", tone: "warning" },
  serious: { label: "Serious", tone: "danger" },
};

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" });
}

type SP = { tab?: string; class?: string; kind?: string; category?: string; status?: string; q?: string; page?: string };

export default async function DisciplinePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.isStaff) notFound();
  if (!hasFeature(access.plan, "discipline")) {
    return (
      <>
        <Topbar title="Behaviour" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="discipline" text="Log merits and incidents in seconds, keep parents in the loop automatically, and see who's shining and who needs support." />
        </PageBody>
      </>
    );
  }
  const db = getDb();
  const settings = disciplineSettings(access.school.disciplineSettings);
  const pupils = await behaviourStudents(db, access);
  const tab = sp.tab === "board" ? "board" : "log";
  const base = `/s/${slug}/discipline`;
  return (
    <>
      <Topbar
        title="Behaviour"
        context={access.school.name}
        actions={pupils.length ? <RecordButton slug={slug} pupils={pupils} merits={settings.meritCategories} incidents={settings.incidentCategories} today={lagosToday()} /> : null}
      />
      <PageBody>
        <Tabs
          current={tab}
          tabs={[
            { key: "log", label: "Log", href: base },
            { key: "board", label: "Leaderboard", href: `${base}?tab=board` },
          ]}
        />
        {tab === "board" ? <Board /> : <Log slug={slug} access={access} sp={sp} categories={[...settings.meritCategories, ...settings.incidentCategories]} />}
      </PageBody>
    </>
  );

  async function Board() {
    const b = await getLeaderboard(db, access);
    const max = Math.max(1, ...b.classes.map((c) => Math.abs(c.points)));
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 fs-16 font-semibold">
            <Icon name="star" size={18} className="text-warning" /> Stars this term
          </h2>
          {b.stars.length ? (
            <ol className="flex flex-col divide-y divide-line">
              {b.stars.map((s, i) => (
                <li key={s.studentId} className="flex items-center gap-3 py-2.5">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full fs-13 font-bold", i < 3 ? "bg-warning-wash text-warning-deep" : "bg-sunken text-muted")}>{i + 1}</span>
                  <Link href={`/s/${slug}/students/${s.studentId}?tab=conduct`} className="min-w-0 flex-1 hover:text-brand-ink">
                    <span className="block truncate font-medium text-ink">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="block fs-13 text-muted">
                      {s.className} · {s.merits} merit{s.merits === 1 ? "" : "s"}
                    </span>
                  </Link>
                  <span className="tabular font-semibold text-success-deep">{s.points > 0 ? `+${s.points}` : s.points}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="fs-14.5 text-muted">No merits yet this term.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 fs-16 font-semibold">
            <Icon name="alert" size={18} className="text-danger" /> Needs support
          </h2>
          <p className="-mt-2 fs-13.5 text-muted">Two or more incidents this term.</p>
          {b.watch.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {b.watch.map((s) => (
                <li key={s.studentId} className="flex items-center gap-3 py-2.5">
                  <Link href={`/s/${slug}/students/${s.studentId}?tab=conduct`} className="min-w-0 flex-1 hover:text-brand-ink">
                    <span className="block truncate font-medium text-ink">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="block fs-13 text-muted">
                      {s.className} · {s.incidents} incidents
                    </span>
                  </Link>
                  <span className="tabular font-semibold text-danger">{s.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fs-14.5 text-muted">Nobody has more than one incident this term.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
          <h2 className="fs-16 font-semibold">Classes by points</h2>
          {b.classes.length ? (
            <ul className="flex flex-col">
              {b.classes.map((c) => (
                <li key={c.classId} className="grid grid-cols-[8rem_minmax(0,1fr)_4rem] items-center gap-3 border-b border-line py-2 last:border-b-0">
                  <span className="truncate fs-14.5 text-ink">{c.className}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-sunken">
                    <span className={cn("block h-full rounded-full", c.points >= 0 ? "bg-success" : "bg-danger")} style={{ width: `${Math.max(3, (Math.abs(c.points) / max) * 100)}%` }} />
                  </span>
                  <span className={cn("tabular text-right font-semibold", c.points >= 0 ? "text-success-deep" : "text-danger")}>{c.points > 0 ? `+${c.points}` : c.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fs-14.5 text-muted">Nothing recorded this term.</p>
          )}
        </Card>
      </div>
    );
  }
}

async function Log({ slug, access, sp, categories }: { slug: string; access: Access; sp: SP; categories: string[] }) {
  const db = getDb();
  const page = Number(sp.page) || 1;
  const [list, classes] = await Promise.all([listBehaviour(db, access, { classId: sp.class, kind: sp.kind, category: sp.category, status: sp.status, q: sp.q, page }), listClassOptions(db, access)]);
  const filtered = Boolean(sp.class || sp.kind || sp.category || sp.status || sp.q);
  const manager = can(access, "operations:discipline");
  return (
    <>
      <StatGrid>
        <StatCard label="Merits this term" value={list.stats.merits} icon="star" tone="success" caption="Good behaviour recorded" />
        <StatCard label="Incidents this term" value={list.stats.incidents} icon="alert" tone={list.stats.incidents ? "warning" : "success"} caption="Minor, moderate and serious" />
        <StatCard label="Open serious cases" value={list.stats.open} icon="shield" tone={list.stats.open ? "danger" : "success"} caption={list.stats.open ? "Waiting to be closed" : "None open"} />
        <StatCard label="Parents told" value={list.stats.told} icon="send" tone="blue" caption="By email or SMS" />
      </StatGrid>
      <TableCard
        title="Behaviour log"
        toolbar={
          <>
            <SearchInput placeholder="Student name or number…" />
            <FilterSelect label="Class" param="class" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
            <FilterSelect
              label="Type"
              param="kind"
              options={[
                { value: "merit", label: "Merits" },
                { value: "incident", label: "Incidents" },
              ]}
            />
            <FilterSelect label="Category" param="category" options={categories.map((c) => ({ value: c, label: c }))} />
            <FilterSelect label="Status" param="status" options={[{ value: "open", label: "Open cases" }]} />
          </>
        }
        footer={<Pagination page={page} pageSize={BEHAVIOUR_PAGE_SIZE} total={list.total} noun="entries" />}
      >
        {list.rows.length === 0 ? (
          <EmptyState icon="star" title={filtered ? "Nothing matches these filters" : "Nothing recorded yet"}>
            {filtered ? "Try a different search or clear the filters." : "Record a merit when a student does well, or an incident when something goes wrong. Parents can be told automatically."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>What</Th>
                <Th>Date</Th>
                <Th className="text-right">Points</Th>
                <Th>Status</Th>
                <Th className="w-12">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(({ r, firstName, lastName, className, by }) => (
                <tr key={r.id} className="align-top hover:bg-paper">
                  <Td>
                    <Link href={`/s/${slug}/students/${r.studentId}?tab=conduct`} className="block font-medium text-ink hover:text-brand-ink">
                      {firstName} {lastName}
                    </Link>
                    <span className="block fs-13 text-muted">{className}</span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {r.kind === "merit" ? <Badge tone="success">{r.category}</Badge> : <Badge tone={SEVERITY[r.severity ?? "minor"].tone}>{r.category}</Badge>}
                      {r.severity ? <span className="fs-12.5 text-muted">{SEVERITY[r.severity].label}</span> : null}
                    </span>
                    {r.description ? <span className="mt-1 block max-w-[48ch] fs-13.5 text-body">{r.description}</span> : null}
                    {r.actionTaken ? <span className="block fs-13 text-muted">Action: {r.actionTaken}</span> : null}
                    <span className="block fs-12.5 text-muted">
                      {by ? `By ${by}` : ""}
                      {r.parentNotifiedAt ? " · parent told" : ""}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-body">{day(r.occurredOn)}</Td>
                  <Td className={cn("tabular text-right font-semibold", r.points >= 0 ? "text-success-deep" : "text-danger")}>{r.points > 0 ? `+${r.points}` : r.points}</Td>
                  <Td>{r.status === "open" ? <Badge tone="danger" dot>Open</Badge> : <span className="fs-13.5 text-muted">{r.kind === "incident" ? "Closed" : "—"}</span>}</Td>
                  <Td className="text-right">
                    <BehaviourActions
                      slug={slug}
                      id={r.id}
                      open={r.status === "open"}
                      canManage={manager}
                      canDelete={manager || (r.recordedBy === access.membershipId && stillRemovable(r.createdAt))}
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
