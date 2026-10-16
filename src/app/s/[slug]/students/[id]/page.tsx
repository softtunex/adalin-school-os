import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageBody, Topbar } from "@/components/topbar";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Avatar, Badge, Card, EmptyState, IconChip, type Tone } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import { can } from "@/lib/services/access";
import { describeScheme } from "@/lib/services/fees";
import { getStudentFees } from "@/lib/services/invoices";
import { fullName, getStudent } from "@/lib/services/students";
import { InvoiceStatusBadge } from "../../fees/shared";
import { OneOffInvoiceButton, StudentDiscounts } from "./fees-tab";
import { AddGuardianButton, GuardianActions, StudentStatusMenu } from "./profile-client";

export const metadata: Metadata = { title: "Student" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_TONE: Record<string, Tone> = { active: "success", graduated: "blue", withdrawn: "neutral", suspended: "danger" };
const OUTCOME_TONE: Record<string, Tone> = { current: "brand", promoted: "success", repeated: "warning", graduated: "blue", withdrawn: "neutral", transferred: "violet" };
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmt = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : null);

function phone(p: string | null) {
  if (!p) return null;
  return p.startsWith("+234") && p.length === 14 ? `0${p.slice(4, 7)} ${p.slice(7, 10)} ${p.slice(10)}` : p;
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="fs-13 text-muted">{label}</dt>
      <dd className="fs-15 text-ink">{value || <span className="text-muted">Not recorded</span>}</dd>
    </div>
  );
}

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ tab?: string; created?: string; saved?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const access = await requirePageAccess(slug, ["students:view"]);
  const profile = await getStudent(getDb(), access, id);
  if (!profile) notFound();
  const { student: s, guardians, history, siblings } = profile;
  const name = fullName(s);
  const base = `/s/${slug}/students/${id}`;
  const showFees = can(access, "fees:view") && hasFeature(access.plan, "fees_basic");
  const fees = showFees ? await getStudentFees(getDb(), access, id) : null;
  const tab = ["details", "parents", "history", ...(fees ? ["fees"] : [])].includes(sp.tab ?? "") ? sp.tab! : "details";
  const canUpdate = can(access, "students:update");
  const canMedical = can(access, "students:view_medical");

  return (
    <>
      <Topbar
        title={
          <span className="flex items-center gap-2">
            <Link href={`/s/${slug}/students`} className="text-muted hover:text-ink">
              Students
            </Link>
            <Icon name="chevronRight" size={18} className="text-muted" />
            <span className="truncate">{name}</span>
          </span>
        }
        actions={
          <>
            {can(access, "students:deactivate") ? <StudentStatusMenu slug={slug} student={{ id, name, status: s.status }} /> : null}
            {can(access, "comms:message") && hasFeature(access.plan, "messaging") && guardians.some((g) => g.guardian.userId) ? (
              <ButtonLink href={`/s/${slug}/messages/new?student=${id}`} variant="secondary">
                <Icon name="chat" size={17} /> <span className="hidden sm:inline">Message parents</span>
              </ButtonLink>
            ) : null}
            {canUpdate ? (
              <ButtonLink href={`${base}/edit`} variant="secondary">
                <Icon name="edit" size={17} /> Edit details
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <PageBody>
        {sp.created ? <Alert tone="success" title={`${s.firstName} has been added`}>Admission number {s.admissionNo}. Parents can be linked to the parent app once it&apos;s switched on.</Alert> : null}
        {sp.saved ? <Alert tone="success">Changes saved.</Alert> : null}

        <Card className="relative overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-brand-wash to-violet-wash" />
          <div className="flex flex-wrap items-end gap-5 px-6 pb-6">
            <Avatar name={`${s.firstName} ${s.lastName}`} size={88} className="-mt-11 border-4 border-canvas fs-30" />
            <div className="min-w-0 flex-1 pt-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="fs-24 font-semibold tracking-[-0.02em]">{name}</h2>
                <Badge tone={STATUS_TONE[s.status]} dot>
                  {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                </Badge>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 fs-14 text-body">
                <span className="font-mono">{s.admissionNo}</span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="layers" size={16} className="text-muted" />
                  {s.className ?? "No class"}
                </span>
                <span>{s.gender === "female" ? "Female" : "Male"}</span>
                {s.dateOfBirth ? <span>Born {fmt(s.dateOfBirth)}</span> : null}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Tabs
              current={tab}
              tabs={[
                { key: "details", label: "Details", href: base },
                { key: "parents", label: "Parents & guardians", href: `${base}?tab=parents`, count: guardians.length },
                { key: "history", label: "Class history", href: `${base}?tab=history`, count: history.length },
                ...(fees ? [{ key: "fees", label: "Fees", href: `${base}?tab=fees`, count: fees.invoices.length }] : []),
              ]}
            />

            {tab === "details" ? (
              <div className="flex flex-col gap-5">
                <Card className="p-6">
                  <h3 className="fs-15.5 font-semibold">Personal</h3>
                  <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <Detail label="First name" value={s.firstName} />
                    <Detail label="Middle name" value={s.middleName} />
                    <Detail label="Surname" value={s.lastName} />
                    <Detail label="Date of birth" value={fmt(s.dateOfBirth)} />
                    <Detail label="State of origin" value={s.stateOfOrigin} />
                    <Detail label="LGA" value={s.lga} />
                    <Detail label="Religion" value={s.religion} />
                    <Detail label="Date admitted" value={fmt(s.admittedOn)} />
                    <Detail label="Home address" value={s.address} />
                  </dl>
                </Card>
                {canMedical ? (
                  <Card className="p-6">
                    <div className="flex items-center gap-2">
                      <h3 className="fs-15.5 font-semibold">Health</h3>
                      <Badge tone="danger">Confidential</Badge>
                    </div>
                    <dl className="mt-4 grid gap-5 sm:grid-cols-3">
                      <Detail label="Blood group" value={s.bloodGroup} />
                      <Detail label="Genotype" value={s.genotype} />
                      <Detail label="Allergies and notes" value={s.medicalNotes} />
                    </dl>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {tab === "parents" ? (
              <div className="flex flex-col gap-4">
                {guardians.length === 0 ? (
                  <Card>
                    <EmptyState icon="users" title="No parent or guardian yet" action={canUpdate ? <AddGuardianButton slug={slug} studentId={id} /> : null}>
                      Add a parent so fee reminders, results and absence alerts can reach home.
                    </EmptyState>
                  </Card>
                ) : (
                  <>
                    {guardians.map(({ guardian: g, relationship, isPrimary }) => (
                      <Card key={g.id} className="flex flex-wrap items-start gap-4 p-5">
                        <Avatar name={g.name} size={44} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="fs-16 font-semibold text-ink">{g.name}</p>
                            <Badge>{relationship}</Badge>
                            {isPrimary ? <Badge tone="brand">Primary contact</Badge> : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 fs-14 text-body">
                            <span className="inline-flex items-center gap-1.5">
                              <Icon name="phone" size={16} className="text-muted" />
                              <span className="tabular select-all">{phone(g.phone) ?? "No phone"}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Icon name="mail" size={16} className="text-muted" />
                              <span className="select-all">{g.email ?? "No email"}</span>
                            </span>
                            {g.occupation ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Icon name="building" size={16} className="text-muted" />
                                {g.occupation}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {canUpdate ? <GuardianActions slug={slug} studentId={id} guardian={{ id: g.id, name: g.name }} isPrimary={isPrimary} /> : null}
                      </Card>
                    ))}
                    {canUpdate ? (
                      <div>
                        <AddGuardianButton slug={slug} studentId={id} />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {tab === "fees" && fees ? (
              <div className="flex flex-col gap-5">
                <Card className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="fs-15.5 font-semibold">Invoices</h3>
                      <p className="mt-0.5 fs-14 text-muted">
                        {fees.owing > 0 ? `${formatNaira(fees.owing)} outstanding` : "Nothing outstanding"} · {formatNaira(fees.paid)} paid in total
                      </p>
                    </div>
                    {can(access, "fees:invoice") && fees.term ? <OneOffInvoiceButton slug={slug} studentId={id} termId={fees.term.id} items={fees.items} /> : null}
                  </div>
                  {fees.invoices.length === 0 ? (
                    <p className="mt-4 fs-14.5 text-muted">No invoices yet. Term invoices are raised for the whole school from Fees.</p>
                  ) : (
                    <ul className="mt-3 flex flex-col divide-y divide-line">
                      {fees.invoices.map((inv) => (
                        <li key={inv.id}>
                          <Link href={`/s/${slug}/fees/invoices/${inv.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:text-blue">
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-ink">{inv.title}</span>
                              <span className="block font-mono fs-13 text-muted">{inv.number}</span>
                            </span>
                            <span className="tabular text-right">
                              <span className="block fs-14.5 font-semibold text-ink">{inv.status === "void" ? "—" : formatNaira(Math.max(0, inv.balance))}</span>
                              <span className="block fs-12.5 text-muted">of {formatNaira(inv.chargesKobo - inv.discountKobo)}</span>
                            </span>
                            <InvoiceStatusBadge status={inv.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                {hasFeature(access.plan, "debtors") ? (
                  <StudentDiscounts
                    slug={slug}
                    studentId={id}
                    editable={can(access, "fees:discount")}
                    assigned={fees.assigned}
                    schemes={fees.schemes.map((sc) => ({ id: sc.id, name: sc.name, description: describeScheme(sc, sc.itemId ? fees.items.find((i) => i.id === sc.itemId)?.name : null) }))}
                  />
                ) : null}
              </div>
            ) : null}

            {tab === "history" ? (
              <Card className="p-6">
                {history.length === 0 ? (
                  <p className="fs-14.5 text-muted">No class history yet. History starts once the student is placed in a class during a session.</p>
                ) : (
                  <ol className="relative flex flex-col gap-6 border-l-2 border-line pl-6">
                    {history.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[33px] top-0.5 size-4 rounded-full border-4 border-canvas bg-brand" />
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink">{h.className}</p>
                          <Badge tone={OUTCOME_TONE[h.outcome]}>{h.outcome.charAt(0).toUpperCase() + h.outcome.slice(1)}</Badge>
                        </div>
                        <p className="mt-0.5 fs-13.5 text-muted">
                          {h.sessionName} session · from {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(h.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            ) : null}
          </div>

          <div className="flex flex-col gap-5">
            <Card className="p-5">
              <h3 className="fs-15 font-semibold">At a glance</h3>
              <ul className="mt-4 flex flex-col gap-3.5 fs-14">
                <li className="flex items-center gap-3">
                  <IconChip icon="calendarCheck" tone="success" size={34} />
                  <span className="text-body">Attendance appears here once it&apos;s being taken.</span>
                </li>
                <li className="flex items-center gap-3">
                  <IconChip icon="results" tone="violet" size={34} />
                  <span className="text-body">Results appear once scores are entered.</span>
                </li>
                <li className="flex items-center gap-3">
                  <IconChip icon="wallet" tone={fees && fees.owing > 0 ? "warning" : "success"} size={34} />
                  {fees && fees.invoices.length ? (
                    <Link href={`${base}?tab=fees`} className="text-body hover:text-blue">
                      {fees.owing > 0 ? (
                        <>
                          Owes <span className="tabular font-semibold text-ink">{formatNaira(fees.owing)}</span>
                        </>
                      ) : (
                        "Fees fully paid"
                      )}
                    </Link>
                  ) : (
                    <span className="text-body">Fees appear once invoices are raised.</span>
                  )}
                </li>
              </ul>
            </Card>
            <Card className="p-5">
              <h3 className="fs-15 font-semibold">Siblings in this school</h3>
              {siblings.length === 0 ? (
                <p className="mt-2 fs-14 text-muted">None found. Siblings are linked automatically when they share a parent&apos;s phone number.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1">
                  {siblings.map((sib) => (
                    <li key={sib.id}>
                      <Link href={`/s/${slug}/students/${sib.id}`} className="flex items-center gap-3 rounded-chunk p-2 hover:bg-paper">
                        <Avatar name={`${sib.firstName} ${sib.lastName}`} size={34} />
                        <span>
                          <span className="block font-medium text-ink">
                            {sib.firstName} {sib.lastName}
                          </span>
                          <span className="block fs-13 text-muted">{sib.className ?? "No class"}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
