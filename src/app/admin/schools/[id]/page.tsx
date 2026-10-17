import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageBody, Topbar } from "@/components/topbar";
import { Badge, Card, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { FEATURES, type FeatureKey } from "@/lib/plans/catalog";
import { lagosToday } from "@/lib/services/attendance";
import { schoolDetail } from "@/lib/services/platform";
import { BillActions, ConfirmDomain, ExtendTrial, FeatureOverrides, ManualBill, NoteForm, OpenAsSupport, PlanControl, StatusControl } from "../../admin-client";
import { BillStatus, KIND_LABEL, SchoolStatus, when, whenTime } from "../../shared";

export const metadata = { title: "School" };

function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="fs-17 font-semibold text-ink">{title}</h2>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export default async function AdminSchool({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await schoolDetail(getDb(), id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { school, stats } = d;
  const today = lagosToday();
  const plan = d.plans.find((p) => p.key === school.planKey);
  const features = Object.entries(FEATURES).map(([key, label]) => ({ key, label }));
  const name = (f: string) => FEATURES[f as FeatureKey] ?? f;
  const contact = [school.email, school.phone, [school.city, school.state].filter(Boolean).join(", ")].filter(Boolean);
  return (
    <>
      <Topbar
        title={school.name}
        context={school.slug}
        actions={
          <Link href="/admin/schools" className="fs-14.5 font-semibold text-muted hover:text-ink">
            All schools
          </Link>
        }
      />
      <PageBody>
        <StatGrid>
          <StatCard label="Plan" value={plan?.name ?? school.planKey} icon="layers" tone="brand" caption={school.pendingPlanKey ? `Moves to ${school.pendingPlanKey} next term` : school.trialEndsAt ? `Trial ends ${when(school.trialEndsAt)}` : "No change waiting"} />
          <StatCard label="Students" value={stats.students} icon="users" tone="blue" caption={plan?.limits.students ? `Plan allows ${plan.limits.students}` : "No limit"} />
          <StatCard label="Staff" value={stats.staff} icon="user" tone="violet" caption={plan?.limits.staff ? `Plan allows ${plan.limits.staff}` : "No limit"} />
          <StatCard label="Owing" value={formatNaira(stats.owed)} icon="banknote" tone={stats.owed ? "warning" : "success"} caption={school.readOnlySince ? `Read-only since ${when(school.readOnlySince)}` : "Bills waiting for payment"} />
        </StatGrid>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            title="Account"
            actions={
              <>
                <PlanControl schoolId={school.id} current={school.planKey} plans={d.plans.map((p) => ({ key: p.key, name: p.name }))} />
                {school.trialEndsAt ? <ExtendTrial schoolId={school.id} /> : null}
                <StatusControl schoolId={school.id} current={school.status} />
              </>
            }
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 fs-14.5">
              <dt className="text-muted">Status</dt>
              <dd>
                <SchoolStatus status={school.status} trialEndsAt={school.trialEndsAt} />
              </dd>
              <dt className="text-muted">Joined</dt>
              <dd className="text-ink">{when(school.createdAt)}</dd>
              <dt className="text-muted">Contact</dt>
              <dd className="text-ink">{contact.length ? contact.join(" · ") : "—"}</dd>
              <dt className="text-muted">Web address</dt>
              <dd className="flex flex-wrap items-center gap-2 text-ink">
                {school.customDomain ? (
                  <>
                    <span className="font-mono fs-13.5">{school.customDomain}</span>
                    {school.domainVerifiedAt ? <Badge tone="success">Live</Badge> : <><Badge tone="warning">Waiting</Badge><ConfirmDomain schoolId={school.id} /></>}
                  </>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted">Proprietor</dt>
              <dd className="text-ink">
                {d.owners.length
                  ? d.owners.map((o) => (
                      <span key={o.email} className="block">
                        {o.name} <span className="text-muted">· {[o.email, o.phone].filter(Boolean).join(" · ")}</span>
                      </span>
                    ))
                  : "—"}
              </dd>
            </dl>
          </Section>

          <Section title="Features" actions={<FeatureOverrides schoolId={school.id} features={features} planFeatures={plan?.features ?? []} grants={school.adminGrants} blocks={school.adminBlocks} />}>
            <p className="fs-14.5 text-body">
              Everything in {plan?.name ?? "the plan"}
              {school.extraFeatures.length || school.adminBlocks.length ? ", with these changes:" : ", nothing changed."}
            </p>
            {school.extraFeatures.length || school.adminBlocks.length ? (
              <div className="flex flex-wrap gap-1.5">
                {school.extraFeatures.map((f) => (
                  <Badge key={f} tone="success">
                    + {name(f)}
                    {school.adminGrants.includes(f) ? "" : " (add-on)"}
                  </Badge>
                ))}
                {school.adminBlocks.map((f) => (
                  <Badge key={f} tone="danger">
                    − {name(f)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Section>

          <Section title="Support access">
            {d.grant ? (
              <OpenAsSupport schoolId={school.id} until={whenTime(d.grant.expiresAt)} />
            ) : (
              <p className="fs-14.5 text-body">
                Closed. The proprietor can let Adalin support in for 24 or 72 hours under Settings, Plan &amp; billing. Until they do, nobody at Adalin can see inside the school.
              </p>
            )}
            {d.grants.length ? (
              <ul className="flex flex-col gap-1 fs-13.5 text-muted">
                {d.grants.map((g) => (
                  <li key={g.id}>
                    Opened {whenTime(g.createdAt)}
                    {g.reason ? ` (${g.reason})` : ""} · {g.revokedAt ? `closed ${whenTime(g.revokedAt)}` : g.expiresAt > new Date() ? `until ${whenTime(g.expiresAt)}` : `ended ${whenTime(g.expiresAt)}`}
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section title="Team note">
            <NoteForm schoolId={school.id} note={school.adminNote ?? ""} />
          </Section>
        </div>

        <TableCard title="Bills" toolbar={<ManualBill schoolId={school.id} />}>
          {d.bills.length === 0 ? (
            <EmptyState icon="receipt" title="No bills yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th>For</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th className="w-52">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {d.bills.map((b) => (
                  <tr key={b.id} className="hover:bg-paper">
                    <Td>
                      <span className="tabular font-medium text-ink">{b.number}</span>
                      <span className="block fs-13 text-muted">
                        {KIND_LABEL[b.kind]} · {when(b.issuedOn)}
                      </span>
                    </Td>
                    <Td className="text-body">{b.lines.map((l) => l.description).join("; ")}</Td>
                    <Td className="text-right tabular font-semibold text-ink">{formatNaira(b.totalKobo)}</Td>
                    <Td className="text-body">{when(b.dueOn)}</Td>
                    <Td>
                      <BillStatus status={b.status} dueOn={b.dueOn} today={today} />
                      {b.paidVia ? <span className="block fs-12.5 text-muted">{b.paidVia}</span> : null}
                    </Td>
                    <Td>{b.status === "open" ? <BillActions billId={b.id} number={b.number} /> : null}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <TableCard title="Add-ons">
            {d.addons.length === 0 ? (
              <EmptyState icon="sparkle" title="No add-ons bought" />
            ) : (
              <Table minWidth="min-w-[420px]">
                <thead>
                  <tr>
                    <Th>Add-on</Th>
                    <Th>Status</Th>
                    <Th>Bought</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.addons.map((a) => (
                    <tr key={a.id}>
                      <Td>
                        <span className="font-medium text-ink">{a.addon?.name ?? a.key}</span>
                        {a.note ? <span className="block fs-13 text-muted">{a.note}</span> : null}
                      </Td>
                      <Td>
                        <Badge tone={a.status === "active" ? "success" : a.status === "pending" ? "warning" : "neutral"}>{a.status === "active" ? (a.deliveredAt ? "Delivered" : "Paid") : a.status === "pending" ? "Awaiting payment" : "Stopped"}</Badge>
                      </Td>
                      <Td className="text-body">{when(a.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </TableCard>
          <TableCard title="Adalin activity">
            {d.activity.length === 0 ? (
              <EmptyState icon="history" title="Nothing yet">
                What the Adalin team does to this school shows here.
              </EmptyState>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {d.activity.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <p className="fs-14.5 text-ink">{a.summary}</p>
                    <p className="fs-13 text-muted">
                      {a.actorName} · {whenTime(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TableCard>
        </div>
      </PageBody>
    </>
  );
}
