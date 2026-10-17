import type { Metadata } from "next";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/data";
import { Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { hasFeature } from "@/lib/plans/entitlements";
import { can, type Access } from "@/lib/services/access";
import { lagosToday } from "@/lib/services/attendance";
import { DOC_PAGE_SIZE, documentPeople, KIND_LABEL, listIssued, listTemplates } from "@/lib/services/documents";
import { IssuePanel, RevokeButton, TemplateActions, TemplateButton } from "./documents-client";

export const metadata: Metadata = { title: "Documents" };

type SP = { tab?: string; q?: string; kind?: string; page?: string };

export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["documents:issue"]);
  if (!hasFeature(access.plan, "documents")) {
    return (
      <>
        <Topbar title="Documents" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="documents" text="Print ID cards, testimonials, certificates, transcripts and letters, each with a QR code that proves it's genuine." />
        </PageBody>
      </>
    );
  }
  const tab = sp.tab === "issued" || sp.tab === "templates" ? sp.tab : "issue";
  const base = `/s/${slug}/documents`;
  const db = getDb();
  const register = await listIssued(db, access, tab === "issued" ? { q: sp.q, kind: sp.kind, page: Number(sp.page) || 1 } : {});
  const st = register.stats;
  return (
    <>
      <Topbar title="Documents" context={access.school.name} actions={tab === "templates" && can(access, "documents:templates") ? <TemplateButton slug={slug} /> : null} />
      <PageBody>
        <StatGrid>
          <StatCard label="ID cards" value={st.id_card ?? 0} icon="idCard" tone="brand" caption="Printed with QR codes" />
          <StatCard label="Testimonials" value={st.testimonial ?? 0} icon="file" tone="blue" caption="For leavers" />
          <StatCard label="Certificates and letters" value={(st.certificate ?? 0) + (st.letter ?? 0)} icon="star" tone="violet" caption="From your templates" />
          <StatCard label="Transcripts" value={st.transcript ?? 0} icon="results" tone="success" caption="Published results only" />
        </StatGrid>
        <Tabs
          current={tab}
          tabs={[
            { key: "issue", label: "Make a document", href: base },
            { key: "issued", label: "Register", href: `${base}?tab=issued`, count: register.total },
            { key: "templates", label: "Templates", href: `${base}?tab=templates` },
          ]}
        />
        {tab === "issued" ? <Register slug={slug} sp={sp} register={register} /> : tab === "templates" ? <Templates slug={slug} access={access} /> : <Issue slug={slug} access={access} />}
      </PageBody>
    </>
  );
}

async function Issue({ slug, access }: { slug: string; access: Access }) {
  const db = getDb();
  const [people, templates] = await Promise.all([documentPeople(db, access), listTemplates(db, access)]);
  return (
    <IssuePanel
      slug={slug}
      thisYear={lagosToday().slice(0, 4)}
      students={people.students.map((s) => ({ id: s.id, name: s.name, detail: [s.className, s.admissionNo].filter(Boolean).join(" · "), joined: s.admittedOn, className: s.className }))}
      staff={people.staff.map((s) => ({ id: s.id, name: s.name, detail: s.jobTitle ?? "" }))}
      classes={people.classes}
      templates={templates.map((t) => ({ id: t.id, kind: t.kind, name: t.name, title: t.title, body: t.body }))}
    />
  );
}

function Register({ slug, sp, register }: { slug: string; sp: SP; register: Awaited<ReturnType<typeof listIssued>> }) {
  const filtered = Boolean(sp.q || sp.kind);
  return (
    <TableCard
      title="Register of documents"
      toolbar={
        <>
          <SearchInput placeholder="Name, serial or title…" />
          <FilterSelect label="Kind" param="kind" options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
        </>
      }
      footer={<Pagination page={Number(sp.page) || 1} pageSize={DOC_PAGE_SIZE} total={register.total} noun="documents" />}
    >
      {register.rows.length === 0 ? (
        <EmptyState icon="file" title={filtered ? "Nothing matches" : "Nothing issued yet"}>
          {filtered ? "Try a different search." : "Every ID card, testimonial, certificate, transcript and letter you make is recorded here with its serial number."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Serial</Th>
              <Th>Document</Th>
              <Th>For</Th>
              <Th>Issued</Th>
              <Th>Status</Th>
              <Th className="w-40">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {register.rows.map(({ d, by }) => (
              <tr key={d.id} className="hover:bg-paper">
                <Td className="whitespace-nowrap font-mono fs-13 text-ink">{d.serial}</Td>
                <Td>
                  <span className="block text-ink">{KIND_LABEL[d.kind]}</span>
                  <span className="block max-w-72 truncate fs-13 text-muted">{d.title}</span>
                </Td>
                <Td className="text-ink">{d.holderName}</Td>
                <Td className="whitespace-nowrap text-body">
                  {d.issuedAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" })}
                  {by ? <span className="block fs-13 text-muted">{by}</span> : null}
                </Td>
                <Td>
                  {d.revokedAt ? (
                    <Badge tone="danger" title={d.revokeReason ?? undefined}>
                      Revoked
                    </Badge>
                  ) : (
                    <Badge tone="success">Valid</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    <a href={`/s/${slug}/documents/print?id=${d.id}`} target="_blank" rel="noreferrer" className="rounded-lg px-2.5 py-1.5 fs-13.5 font-semibold text-brand-ink hover:bg-brand-wash">
                      Reprint
                    </a>
                    <a href={`/verify/${slug}/${d.token}`} target="_blank" rel="noreferrer" className="rounded-lg px-2.5 py-1.5 fs-13.5 font-semibold text-body hover:bg-sunken" title="The page its QR code opens">
                      Check
                    </a>
                    {d.revokedAt ? null : <RevokeButton slug={slug} id={d.id} serial={d.serial} />}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}

async function Templates({ slug, access }: { slug: string; access: Access }) {
  const templates = await listTemplates(getDb(), access);
  const editable = can(access, "documents:templates");
  return (
    <TableCard title="Letter and certificate templates">
      <Table>
        <thead>
          <tr>
            <Th>Template</Th>
            <Th>Kind</Th>
            <Th>Heading</Th>
            <Th className="w-12">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className="hover:bg-paper">
              <Td>
                <span className="block font-medium text-ink">{t.name}</span>
                <span className="block max-w-96 truncate fs-13 text-muted">{t.body.replace(/\s+/g, " ")}</span>
              </Td>
              <Td className="text-body">{t.kind === "letter" ? "Letter" : "Certificate"}</Td>
              <Td className="text-body">{t.title}</Td>
              <Td className="text-right">{editable ? <TemplateActions slug={slug} tpl={{ id: t.id, kind: t.kind, name: t.name, title: t.title, body: t.body }} /> : null}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableCard>
  );
}
