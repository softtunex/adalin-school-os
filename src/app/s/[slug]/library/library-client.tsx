"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { RowMenu } from "@/components/ui/data";
import { Alert, Card } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { deleteBookAction, finePaidAction, issueAction, lookupIsbnAction, returnAction, saveBookAction, saveLibrarySettingsAction } from "./actions";

type Option = { id: string; label: string; detail?: string };

/** Type-to-search picker for long lists (books, students). */
function Picker({ label, id, options, value, onChange, placeholder }: { label: string; id: string; options: Option[]; value: Option | null; onChange: (o: Option | null) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => `${o.label} ${o.detail ?? ""}`.toLowerCase().includes(s)).slice(0, 6) : [];
  }, [q, options]);
  if (value) {
    return (
      <Field label={label} htmlFor={id}>
        <div className="flex items-center justify-between rounded-chunk border border-line bg-paper px-3 py-2.5">
          <span className="min-w-0">
            <span className="block truncate fs-14.5 font-semibold text-ink">{value.label}</span>
            {value.detail ? <span className="block truncate fs-13 text-muted">{value.detail}</span> : null}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Change
          </Button>
        </div>
      </Field>
    );
  }
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
        {matches.length ? (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-chunk border border-line bg-canvas shadow-card" role="listbox" aria-label={label}>
            {matches.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-paper"
                  onClick={() => {
                    onChange(o);
                    setQ("");
                  }}
                >
                  <span className="truncate fs-14.5 text-ink">{o.label}</span>
                  {o.detail ? <span className="shrink-0 fs-13 text-muted">{o.detail}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

export type BookDraft = { id?: string; title: string; author: string; isbn: string; publisher: string; year: string; category: string; shelf: string; copies: string };
const EMPTY: BookDraft = { title: "", author: "", isbn: "", publisher: "", year: "", category: "", shelf: "", copies: "1" };

export function BookButton({ slug, book, label = "Add book", variant = "primary" }: { slug: string; book?: BookDraft; label?: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {book ? null : <Icon name="plus" size={18} strokeWidth={2.4} />} {label}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setKey((k) => k + 1);
        }}
        title={book ? "Edit book" : "Add a book"}
      >
        <BookForm key={key} slug={slug} book={book ?? EMPTY} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function BookForm({ slug, book, onDone }: { slug: string; book: BookDraft; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [looking, startLook] = useTransition();
  const [b, setB] = useState(book);
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "blue"; text: string } | null>(null);
  const set = (k: keyof BookDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setB((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="flex flex-col gap-4">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Field label="ISBN" htmlFor="bk-isbn" hint="On the back cover or copyright page. Look it up to fill in the rest.">
        <div className="flex gap-2">
          <Input id="bk-isbn" value={b.isbn} onChange={set("isbn")} inputMode="numeric" placeholder="978…" />
          <Button
            variant="secondary"
            disabled={looking || b.isbn.replace(/\D/g, "").length < 10}
            onClick={() =>
              startLook(async () => {
                const r = await lookupIsbnAction(slug, b.isbn);
                if ("error" in r && r.error) return setMsg({ tone: "danger", text: r.error });
                if (!r.book) return setMsg({ tone: "blue", text: "No record found for that ISBN. Type the details in." });
                const found = r.book;
                setB((x) => ({ ...x, isbn: found.isbn, title: found.title, author: found.author, publisher: found.publisher, year: found.year ? String(found.year) : x.year, category: x.category || found.category }));
                setMsg({ tone: "success", text: "Found it. Check the details and save." });
              })
            }
          >
            {looking ? "Looking…" : "Look up"}
          </Button>
        </div>
      </Field>
      <Field label="Title" htmlFor="bk-title">
        <Input id="bk-title" value={b.title} onChange={set("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Author" htmlFor="bk-author">
          <Input id="bk-author" value={b.author} onChange={set("author")} />
        </Field>
        <Field label="Publisher" htmlFor="bk-pub">
          <Input id="bk-pub" value={b.publisher} onChange={set("publisher")} />
        </Field>
        <Field label="Category" htmlFor="bk-cat">
          <Input id="bk-cat" value={b.category} onChange={set("category")} placeholder="e.g. Literature, Textbook" list="bk-cats" />
          <datalist id="bk-cats">
            {["Literature", "Textbook", "Reference", "Science", "History", "Religion", "Children's fiction", "Biography"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Year" htmlFor="bk-year">
          <Input id="bk-year" value={b.year} onChange={set("year")} inputMode="numeric" />
        </Field>
        <Field label="Shelf" htmlFor="bk-shelf">
          <Input id="bk-shelf" value={b.shelf} onChange={set("shelf")} placeholder="e.g. B3" />
        </Field>
        <Field label="Copies" htmlFor="bk-copies">
          <Input id="bk-copies" value={b.copies} onChange={set("copies")} inputMode="numeric" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={pending || !b.title.trim()}
          onClick={() =>
            start(async () => {
              const r = await saveBookAction(slug, {
                id: b.id,
                title: b.title,
                author: b.author,
                isbn: b.isbn,
                publisher: b.publisher,
                year: b.year ? Number(b.year) : null,
                category: b.category,
                shelf: b.shelf,
                copies: Number(b.copies) || 1,
              });
              if (r.error) return setMsg({ tone: "danger", text: r.error });
              router.refresh();
              onDone();
            })
          }
        >
          {pending ? "Saving…" : "Save book"}
        </Button>
      </div>
    </div>
  );
}

export function BookActions({ slug, book }: { slug: string; book: BookDraft & { id: string } }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  return (
    <>
      <RowMenu
        items={[
          { label: "Edit", icon: "edit", onSelect: () => setMode("edit") },
          { label: "Remove", icon: "trash", danger: true, onSelect: () => setMode("delete") },
        ]}
      />
      <Modal open={mode === "edit"} onClose={() => setMode(null)} title="Edit book">
        <BookForm slug={slug} book={book} onDone={() => setMode(null)} />
      </Modal>
      <ConfirmDialog
        open={mode === "delete"}
        onClose={() => setMode(null)}
        title={`Remove "${book.title}"?`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          const r = await deleteBookAction(slug, book.id);
          if (!r.error) {
            setMode(null);
            router.refresh();
          }
          return r;
        }}
      >
        It comes out of the catalogue along with its loan history.
      </ConfirmDialog>
    </>
  );
}

export function IssueButton({
  slug,
  books,
  students,
  staff,
  defaultDue,
  maxLoans,
}: {
  slug: string;
  books: { id: string; title: string; author: string | null; copies: number; out: number }[];
  students: { id: string; name: string; detail: string }[];
  staff: { id: string; name: string }[];
  defaultDue: string;
  maxLoans: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Option[]>([]);
  const [who, setWho] = useState<"student" | "staff">("student");
  const [borrower, setBorrower] = useState<Option | null>(null);
  const [due, setDue] = useState(defaultDue);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const reset = () => {
    setPicked([]);
    setBorrower(null);
    setMsg(null);
    setDue(defaultDue);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icon name="send" size={17} /> Lend a book
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Lend a book"
      >
        <div className="flex flex-col gap-4">
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
          {picked.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-chunk border border-line bg-paper" aria-label="Books to lend">
              {picked.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate fs-14.5 font-semibold text-ink">{b.label}</span>
                    <span className="block fs-13 text-muted">{b.detail}</span>
                  </span>
                  <Button variant="ghost" size="sm" aria-label={`Remove ${b.label}`} onClick={() => setPicked((x) => x.filter((y) => y.id !== b.id))}>
                    <Icon name="x" size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {picked.length < maxLoans ? (
            <Picker
              label={picked.length ? "Add another book" : "Books"}
              id="ln-book"
              value={null}
              onChange={(o) => o && setPicked((x) => [...x, o])}
              placeholder="Type the title or author"
              options={books.filter((b) => !picked.some((p) => p.id === b.id)).map((b) => ({ id: b.id, label: b.title, detail: `${b.copies - b.out} of ${b.copies} in` }))}
            />
          ) : (
            <p className="fs-13.5 text-muted">That&apos;s the most one person can borrow ({maxLoans}).</p>
          )}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who is borrowing">
            {(["student", "staff"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={who === k}
                onClick={() => {
                  setWho(k);
                  setBorrower(null);
                }}
                className={cn("rounded-chunk border-2 px-3 py-2 fs-14 font-semibold", who === k ? "border-brand bg-brand-wash text-brand-ink" : "border-line-strong text-body hover:bg-paper")}
              >
                {k === "student" ? "A student" : "A member of staff"}
              </button>
            ))}
          </div>
          <Picker
            label="Borrower"
            id="ln-who"
            value={borrower}
            onChange={setBorrower}
            placeholder={who === "student" ? "Type a name or admission number" : "Type a name"}
            options={who === "student" ? students.map((s) => ({ id: s.id, label: s.name, detail: s.detail })) : staff.map((s) => ({ id: s.id, label: s.name }))}
          />
          <Field label="Due back" htmlFor="ln-due">
            <Input id="ln-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-56" />
          </Field>
          <div className="flex justify-end gap-2">
            {msg?.tone === "success" ? (
              <Button variant="secondary" onClick={reset}>
                Lend another
              </Button>
            ) : null}
            <Button
              disabled={pending || !picked.length || !borrower}
              onClick={() =>
                start(async () => {
                  const r = await issueAction(slug, { bookIds: picked.map((b) => b.id), studentId: who === "student" ? borrower!.id : null, membershipId: who === "staff" ? borrower!.id : null, dueOn: due });
                  setMsg(r.error ? { tone: "danger", text: r.error } : { tone: "success", text: r.success ?? "Lent." });
                  if (!r.error) router.refresh();
                })
              }
            >
              {pending ? "Saving…" : picked.length > 1 ? `Lend ${picked.length} books` : "Lend"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function LoanActions({ slug, id, returned, late, fineSoFar, fineOwed, fineLabel }: { slug: string; id: string; returned: boolean; late: number; fineSoFar: number; fineOwed: boolean; fineLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = (fn: () => Promise<{ error?: string; success?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ?? r.success ?? null);
      setAsk(false);
      if (!r.error) router.refresh();
    });
  if (returned) {
    return fineOwed ? (
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => go(() => finePaidAction(slug, id))}>
        Fine paid
      </Button>
    ) : null;
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => (late && fineSoFar ? setAsk(true) : go(() => returnAction(slug, id, false)))}>
        <Icon name="undo" size={15} /> Returned
      </Button>
      {msg ? <span className="fs-12.5 text-muted">{msg}</span> : null}
      <Modal open={ask} onClose={() => setAsk(false)} title="Returned late">
        <div className="flex flex-col gap-4">
          <p className="fs-15 text-body">
            {late} day{late === 1 ? "" : "s"} late. The fine is <strong className="text-ink">{fineLabel}</strong>.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => go(() => returnAction(slug, id, true))}>
              Waive the fine
            </Button>
            <Button disabled={pending} onClick={() => go(() => returnAction(slug, id, false))}>
              Charge {fineLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function LibrarySettingsForm({ slug, settings, editable }: { slug: string; settings: { loanDays: number; maxLoans: number; finePerDayKobo: number }; editable: boolean }) {
  const [state, action] = useActionState(saveLibrarySettingsAction.bind(null, slug), initialFormState);
  return (
    <Card className="flex max-w-2xl flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="fs-16 font-semibold">Library</h2>
        <p className="mt-0.5 fs-14 text-muted">Loan rules for students and staff.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-3">
          <Field label="Loan length (days)" htmlFor="lb-days">
            <Input id="lb-days" name="loanDays" type="number" min={1} max={120} defaultValue={settings.loanDays} />
          </Field>
          <Field label="Books per borrower" htmlFor="lb-max">
            <Input id="lb-max" name="maxLoans" type="number" min={1} max={20} defaultValue={settings.maxLoans} />
          </Field>
          <Field label="Fine per day late (₦)" htmlFor="lb-fine" hint="0 for no fines.">
            <Input id="lb-fine" name="fine" inputMode="decimal" defaultValue={settings.finePerDayKobo / 100} />
          </Field>
        </fieldset>
        {editable ? (
          <div>
            <SubmitButton>Save</SubmitButton>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
