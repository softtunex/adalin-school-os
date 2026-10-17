import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, Topbar } from "@/components/topbar";
import { UpgradeCard } from "@/components/upgrade-card";
import { FilterSelect, Pagination, SearchInput } from "@/components/ui/data";
import { Badge, EmptyState, StatCard, StatGrid, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Tabs } from "@/components/ui/tabs";
import { requirePageAccess } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { getDb } from "@/lib/db/client";
import { formatNaira } from "@/lib/money";
import { hasFeature } from "@/lib/plans/entitlements";
import type { Access } from "@/lib/services/access";
import { lagosToday } from "@/lib/services/attendance";
import { BOOK_PAGE_SIZE, borrowers, librarySettings, listBooks, listLoans } from "@/lib/services/library";
import { BookActions, BookButton, IssueButton, LoanActions } from "./library-client";

export const metadata: Metadata = { title: "Library" };

type SP = { tab?: string; view?: string; q?: string; category?: string; available?: string; page?: string };

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" });
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function LibraryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requirePageAccess(slug, ["operations:library"]);
  if (!hasFeature(access.plan, "library")) {
    return (
      <>
        <Topbar title="Library" context={access.school.name} />
        <PageBody>
          <UpgradeCard slug={slug} feature="library" text="Catalogue every book with an ISBN scan, lend to students and staff, and let the system chase overdue books and fines." />
        </PageBody>
      </>
    );
  }
  const db = getDb();
  const tab = sp.tab === "loans" ? "loans" : "books";
  const base = `/s/${slug}/library`;
  const [catalogue, people] = await Promise.all([listBooks(db, access, { q: tab === "books" ? sp.q : undefined, category: sp.category, available: sp.available, page: Number(sp.page) || 1 }), borrowers(db, access)]);
  const s = librarySettings(access.school.librarySettings);
  return (
    <>
      <Topbar
        title="Library"
        context={access.school.name}
        actions={
          <div className="flex gap-2">
            <BookButton slug={slug} variant="secondary" />
            <IssueButton slug={slug} books={people.books} students={people.students} staff={people.staff} defaultDue={addDays(lagosToday(), s.loanDays)} maxLoans={s.maxLoans} />
          </div>
        }
      />
      <PageBody>
        <StatGrid>
          <StatCard label="Titles" value={catalogue.stats.titles} icon="library" tone="brand" caption={`${catalogue.stats.copies} copies`} />
          <StatCard label="On loan" value={catalogue.stats.onLoan} icon="send" tone="blue" caption={`${s.loanDays}-day loans, ${s.maxLoans} books each`} />
          <StatCard label="Overdue" value={catalogue.stats.overdue} icon="alert" tone={catalogue.stats.overdue ? "danger" : "success"} caption={catalogue.stats.overdue ? "Past the due date" : "Nothing overdue"} />
          <StatCard label="Fines owed" value={formatNaira(catalogue.stats.fines)} icon="banknote" tone={catalogue.stats.fines ? "warning" : "success"} caption={`${formatNaira(s.finePerDayKobo)} a day late`} />
        </StatGrid>
        <Tabs
          current={tab}
          tabs={[
            { key: "books", label: "Catalogue", href: base },
            { key: "loans", label: "Loans", href: `${base}?tab=loans`, count: catalogue.stats.onLoan },
          ]}
        />
        {tab === "loans" ? <Loans slug={slug} access={access} sp={sp} /> : <Books slug={slug} catalogue={catalogue} sp={sp} />}
      </PageBody>
    </>
  );
}

function Books({ slug, catalogue, sp }: { slug: string; catalogue: Awaited<ReturnType<typeof listBooks>>; sp: SP }) {
  const filtered = Boolean(sp.q || sp.category || sp.available);
  return (
    <TableCard
      title="Catalogue"
      toolbar={
        <>
          <SearchInput placeholder="Title, author or ISBN…" />
          <FilterSelect label="Category" param="category" options={catalogue.categories.map((c) => ({ value: c, label: c }))} />
          <FilterSelect label="Show" param="available" options={[{ value: "yes", label: "On the shelf" }]} />
        </>
      }
      footer={<Pagination page={Number(sp.page) || 1} pageSize={BOOK_PAGE_SIZE} total={catalogue.total} noun="books" />}
    >
      {catalogue.rows.length === 0 ? (
        <EmptyState icon="library" title={filtered ? "No books match" : "The catalogue is empty"}>
          {filtered ? "Try a different search or clear the filters." : "Add your first book. Type the ISBN and press Look up to fill in the details."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Book</Th>
              <Th>Category</Th>
              <Th>Shelf</Th>
              <Th className="text-right">Available</Th>
              <Th className="w-12">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {catalogue.rows.map(({ b, out }) => (
              <tr key={b.id} className="hover:bg-paper">
                <Td>
                  <span className="block font-medium text-ink">{b.title}</span>
                  <span className="block fs-13 text-muted">{[b.author, b.publisher, b.year, b.isbn].filter(Boolean).join(" · ")}</span>
                </Td>
                <Td className="text-body">{b.category ?? "—"}</Td>
                <Td className="text-body">{b.shelf ?? "—"}</Td>
                <Td className="text-right">
                  <span className={cn("tabular font-semibold", b.copies - out ? "text-success-deep" : "text-danger")}>{b.copies - out}</span>
                  <span className="tabular text-muted"> / {b.copies}</span>
                </Td>
                <Td className="text-right">
                  <BookActions
                    slug={slug}
                    book={{ id: b.id, title: b.title, author: b.author ?? "", isbn: b.isbn ?? "", publisher: b.publisher ?? "", year: b.year ? String(b.year) : "", category: b.category ?? "", shelf: b.shelf ?? "", copies: String(b.copies) }}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </TableCard>
  );
}

async function Loans({ slug, access, sp }: { slug: string; access: Access; sp: SP }) {
  const view = ["overdue", "fines", "returned"].includes(sp.view ?? "") ? sp.view! : "out";
  const { rows } = await listLoans(getDb(), access, { view, q: sp.q });
  const base = `/s/${slug}/library?tab=loans`;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {[
          ["out", "On loan"],
          ["overdue", "Overdue"],
          ["fines", "Fines owed"],
          ["returned", "Returned"],
        ].map(([k, l]) => (
          <Link
            key={k}
            href={k === "out" ? base : `${base}&view=${k}`}
            className={cn("inline-flex h-9 items-center rounded-full border px-3.5 fs-13.5 font-medium", view === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong bg-canvas text-body hover:bg-paper")}
          >
            {l}
          </Link>
        ))}
      </div>
      <TableCard title="Loans" toolbar={<SearchInput placeholder="Book or borrower…" />}>
        {rows.length === 0 ? (
          <EmptyState icon="library" title="Nothing here">
            {view === "out" ? "Books you lend show here until they come back." : "Try another filter."}
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Book</Th>
                <Th>Borrower</Th>
                <Th>Lent</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th className="w-36 text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.loan.id} className="hover:bg-paper">
                  <Td>
                    <span className="block font-medium text-ink">{r.title}</span>
                    {r.author ? <span className="block fs-13 text-muted">{r.author}</span> : null}
                  </Td>
                  <Td>
                    <span className="block text-ink">{r.studentName ?? r.staffName}</span>
                    <span className="block fs-13 text-muted">{r.studentName ? r.className : "Staff"}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-body">{day(r.loan.issuedOn)}</Td>
                  <Td className="whitespace-nowrap text-body">{day(r.loan.dueOn)}</Td>
                  <Td>
                    {r.loan.returnedOn ? (
                      r.loan.fineKobo ? (
                        <Badge tone={r.loan.finePaid ? "success" : "warning"}>{r.loan.finePaid ? `Fine paid (${formatNaira(r.loan.fineKobo)})` : `Fine ${formatNaira(r.loan.fineKobo)}`}</Badge>
                      ) : (
                        <span className="fs-13.5 text-muted">Returned {day(r.loan.returnedOn)}</span>
                      )
                    ) : r.late ? (
                      <Badge tone="danger" dot>
                        {r.late} day{r.late === 1 ? "" : "s"} late
                      </Badge>
                    ) : (
                      <Badge tone="blue" dot>
                        On loan
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <LoanActions
                      slug={slug}
                      id={r.loan.id}
                      returned={!!r.loan.returnedOn}
                      late={r.late}
                      fineSoFar={r.fineSoFar}
                      fineOwed={r.loan.fineKobo > 0 && !r.loan.finePaid}
                      fineLabel={formatNaira(r.fineSoFar)}
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
