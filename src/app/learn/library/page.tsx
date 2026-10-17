import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getStudentLibrary } from "@/lib/services/library";

export const metadata: Metadata = { title: "Library" };

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function StudentLibrary({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await requireUser();
  const d = await getStudentLibrary(getDb(), user.id, q);
  if (!d) notFound();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="fs-26 font-bold tracking-[-0.02em]">Library</h1>
      <section className="flex flex-col gap-2.5">
        <h2 className="fs-15 font-bold text-muted">Books you have</h2>
        {d.current.length === 0 ? (
          <Card className="p-5">
            <p className="fs-15 text-muted">No books out right now. Borrow one from the library.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {d.current.map((l) => (
              <li key={l.loan.id} className="flex items-center gap-3.5 rounded-chunk border-2 border-line bg-canvas p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-chunk bg-brand-wash text-brand">
                  <Icon name="library" size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate fs-16 font-bold text-ink">{l.title}</span>
                  <span className="block fs-13.5 text-muted">Due back {day(l.loan.dueOn)}</span>
                </span>
                {l.late ? <Badge tone="danger">{l.late} day{l.late === 1 ? "" : "s"} late</Badge> : <Badge tone="success">On time</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2.5">
        <h2 className="fs-15 font-bold text-muted">Find a book</h2>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Title or author"
            aria-label="Search the library"
            className="h-12 min-w-0 flex-1 rounded-chunk border-2 border-line-strong bg-canvas px-4 fs-15 text-ink focus:border-brand focus:outline-none"
          />
          <button className="h-12 rounded-chunk border-2 border-brand bg-brand px-5 fs-15 font-bold text-white shadow-[0_3px_0_var(--brand-deep)] active:translate-y-[2px] active:shadow-none">Search</button>
        </form>
        {q && q.trim().length >= 2 ? (
          d.results.length === 0 ? (
            <Card className="p-5">
              <EmptyState icon="library" title="Not in the library">
                Nothing matches &ldquo;{q}&rdquo;. Ask the librarian if they can get it.
              </EmptyState>
            </Card>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {d.results.map(({ b, out }) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate fs-15 font-semibold text-ink">{b.title}</span>
                      <span className="block truncate fs-13 text-muted">{[b.author, b.shelf ? `Shelf ${b.shelf}` : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    {b.copies - out > 0 ? <Badge tone="success">On the shelf</Badge> : <Badge tone="neutral">All out</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )
        ) : null}
      </section>
      {d.past.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="fs-15 font-bold text-muted">Read before</h2>
          <p className="fs-14.5 text-body">{d.past.map((p) => p.title).join(" · ")}</p>
        </section>
      ) : null}
    </div>
  );
}
