import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput, ToolbarLink } from "@/components/ui/data";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { lagosToday } from "@/lib/services/attendance";
import { formatTemp, healthSettings, listHealthRecords, listVisits, OUTCOME_LABEL, sickBayOverview, sickBayStudents, VISIT_PAGE_SIZE } from "@/lib/services/health";
import { lagosClock } from "@/lib/services/hr";
import { DateRange } from "../fees/payments/date-range";
import { CloseVisitButton, HealthFlags, NewVisitButton } from "./sick-bay-client";

export const metadata: Metadata = { title: "Sick bay" };

type SP = { tab?: string; q?: string; outcome?: string; from?: string; to?: string; page?: string };

const OUTCOME_TONE = { returned: "success", rested: "blue", sent_home: "warning", referred: "danger" } as const;

function when(d: Date) {
  return `${d.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" })}, ${lagosClock(d)}`;
}

export default async function SickBayPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["operations:health"]);
  if (!hasFeature(access.plan, "health")) {
    return (
      <>
        <Topbar title="Sick bay" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="health" text="Log every sick bay visit, check medicine against allergies before it's given, and let parents know straight away." />
        </PageBody>
      </>
    );
  }
  const db = getDb();
  const tab = sp.tab === "visits" || sp.tab === "records" ? sp.tab : "today";
  const base = `/s/${slug}/sick-bay`;
  const s = healthSettings(access.school.healthSettings);
  const [o, pupils] = await Promise.all([sickBayOverview(db, access), sickBayStudents(db, access)]);
  return (
    <>
      <Topbar title="Sick bay" context={access.school.name} actions={<NewVisitButton slug={slug} pupils={pupils} medicines={s.medicines} />} />
      <PageBody>
        <StatGrid>
          <StatCard label="In the bay now" value={o.inBay.length} icon="health" tone={o.inBay.length ? "warning" : "success"} caption={o.inBay.length ? "Waiting to be closed" : "Nobody resting"} />
          <StatCard label="Visits today" value={o.stats.today} icon="clock" tone="brand" caption="Open and closed" />
          <StatCard label="This month" value={o.stats.month} icon="calendar" tone="blue" caption={`${o.stats.sentHome} sent home or referred`} />
          <StatCard label="With allergies" value={o.stats.withAllergies} icon="alert" tone="danger" caption="Students on record" />
        </StatGrid>
        <Tabs
          current={tab}
          tabs={[
            { key: "today", label: "Today", href: base, count: o.inBay.length },
            { key: "visits", label: "All visits", href: `${base}?tab=visits` },
            { key: "records", label: "Health records", href: `${base}?tab=records` },
          ]}
        />
        {tab === "visits" ? <Visits slug={slug} access={access} sp={sp} /> : tab === "records" ? <Records slug={slug} access={access} q={sp.q} /> : <Today slug={slug} o={o} medicines={s.medicines} />}
      </PageBody>
    </>
  );
}

function Today({ slug, o, medicines }: { slug: string; o: Awaited<ReturnType<typeof sickBayOverview>>; medicines: string[] }) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="fs-15 font-semibold text-muted">In the sick bay now</h2>
        {o.inBay.length === 0 ? (
          <Card className="p-5">
            <p className="fs-14.5 text-muted">Nobody is resting in the sick bay. Record a visit with New visit.</p>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {o.inBay.map((r) => (
              <Card key={r.v.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="fs-16 font-semibold text-ink">{r.name}</p>
                    <p className="fs-13.5 text-muted">
                      {r.className ?? "No class"} · in since {lagosClock(r.v.arrivedAt)}
                    </p>
                  </div>
                  <CloseVisitButton slug={slug} id={r.v.id} name={r.name} allergies={r.allergies ?? []} medicines={medicines} />
                </div>
                <p className="fs-14.5 text-body">
                  <span className="font-medium text-ink">{r.v.complaint}</span>
                  {r.v.temperature ? ` · ${formatTemp(r.v.temperature)}` : ""}
                  {r.v.medicines.length ? ` · Given ${r.v.medicines.map((m) => `${m.medicine} ${m.dose}`).join(", ")}` : ""}
                </p>
                {r.allergies?.length || r.conditions?.length ? <HealthFlags allergies={r.allergies ?? []} conditions={r.conditions ?? []} /> : null}
              </Card>
            ))}
          </div>
        )}
      </section>
      <TableCard title="Seen today">
        {o.todays.length === 0 ? (
          <EmptyState icon="health" title="No visits closed today">
            Visits show here once the student leaves the sick bay.
          </EmptyState>
        ) : (
          <VisitTable rows={o.todays.map((r) => ({ ...r, admissionNo: null, by: null }))} timeOnly />
        )}
      </TableCard>
    </>
  );
}

type VisitRow = Awaited<ReturnType<typeof listVisits>>["rows"][number] | (Omit<Awaited<ReturnType<typeof listVisits>>["rows"][number], "admissionNo" | "by"> & { admissionNo: null; by: null });

function VisitTable({ rows, timeOnly }: { rows: VisitRow[]; timeOnly?: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>{timeOnly ? "Time" : "When"}</Th>
          <Th>Student</Th>
          <Th>Complaint</Th>
          <Th>Treatment</Th>
          <Th>Left</Th>
          <Th>Parents</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.v.id} className="hover:bg-paper">
            <Td className="whitespace-nowrap text-body">{timeOnly ? lagosClock(r.v.arrivedAt) : when(r.v.arrivedAt)}</Td>
            <Td>
              <span className="block font-medium text-ink">{r.name}</span>
              <span className="block fs-13 text-muted">{r.className ?? ""}</span>
            </Td>
            <Td className="text-body">
              {r.v.complaint}
              {r.v.temperature ? <span className="block fs-13 text-muted">{formatTemp(r.v.temperature)}</span> : null}
            </Td>
            <Td className="max-w-80 text-body">
              {r.v.treatment ? <span className="block">{r.v.treatment}</span> : null}
              {r.v.medicines.length ? <span className="block fs-13 text-muted">{r.v.medicines.map((m) => `${m.medicine} ${m.dose}`).join(", ")}</span> : null}
              {!r.v.treatment && !r.v.medicines.length ? "—" : null}
            </Td>
            <Td>{r.v.outcome ? <Badge tone={OUTCOME_TONE[r.v.outcome]}>{OUTCOME_LABEL[r.v.outcome]}</Badge> : null}</Td>
            <Td className="text-body">{r.v.parentsTold ? "Told" : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

async function Visits({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const page = Number(sp.page) || 1;
  const { rows, total } = await listVisits(getDb(), access, { q: sp.q, outcome: sp.outcome, from: sp.from, to: sp.to, page });
  const qs = new URLSearchParams(Object.entries({ q: sp.q, outcome: sp.outcome, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <TableCard
      title="All visits"
      toolbar={
        <>
          <SearchInput placeholder="Student or complaint…" />
          <FilterSelect label="Left" param="outcome" options={Object.entries(OUTCOME_LABEL).map(([value, label]) => ({ value, label }))} />
          <DateRange from={sp.from} to={sp.to} max={lagosToday()} />
          <ToolbarLink href={`/s/${slug}/sick-bay/export${qs ? `?${qs}` : ""}`} icon="download">
            Export
          </ToolbarLink>
        </>
      }
      footer={<Pagination page={page} pageSize={VISIT_PAGE_SIZE} total={total} noun="visits" />}
    >
      {rows.length === 0 ? (
        <EmptyState icon="health" title={sp.q || sp.outcome || sp.from || sp.to ? "No visits match" : "No visits yet"}>
          {sp.q || sp.outcome || sp.from || sp.to ? "Try a different search or clear the filters." : "Every sick bay visit is kept here once it's closed."}
        </EmptyState>
      ) : (
        <VisitTable rows={rows} />
      )}
    </TableCard>
  );
}

async function Records({ slug, access, q }: { slug: string; access: Access; q?: string }) {
  const rows = await listHealthRecords(getDb(), access, q);
  return (
    <TableCard title="Students with allergies or conditions" toolbar={<SearchInput placeholder="Student, allergy or condition…" />}>
      {rows.length === 0 ? (
        <EmptyState icon="health" title={q ? "Nobody matches" : "No health records yet"}>
          {q ? "Try a different search." : "Open a student's page and use the Health tab to record allergies and conditions."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Allergies</Th>
              <Th>Conditions</Th>
              <Th>Blood group · genotype</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-paper">
                <Td>
                  <Link href={`/s/${slug}/students/${r.id}?tab=health`} className="block font-medium text-ink hover:text-brand">
                    {r.name}
                  </Link>
                  <span className="block fs-13 text-muted">{r.className ?? ""}</span>
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {r.h.allergies.length
                      ? r.h.allergies.map((a) => (
                          <Badge key={a} tone="danger">
                            {a}
                          </Badge>
                        ))
                      : "—"}
                  </span>
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {r.h.conditions.length
                      ? r.h.conditions.map((c) => (
                          <Badge key={c} tone="warning">
                            {c}
                          </Badge>
                        ))
                      : "—"}
                  </span>
                </Td>
                <Td className="text-body">{[r.bloodGroup, r.genotype].filter(Boolean).join(" · ") || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}
