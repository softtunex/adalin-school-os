"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Badge, Card, IconChip, Table, TableCard, Td, Th } from "@/components/ui/display";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { importAction, type ImportState } from "./actions";

function Step({ n, title, text, done, active }: { n: number; title: string; text: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full fs-14 font-bold",
          done ? "bg-success text-white shadow-[0_2px_0_var(--success-deep)]" : active ? "bg-brand text-white shadow-[0_2px_0_var(--brand-deep)]" : "bg-sunken text-muted",
        )}
      >
        {done ? <Icon name="check" size={17} strokeWidth={2.6} /> : n}
      </span>
      <div>
        <p className={cn("font-semibold", active || done ? "text-ink" : "text-muted")}>{title}</p>
        <p className="fs-13.5 text-muted">{text}</p>
      </div>
    </div>
  );
}

export function ImportFlow({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(importAction.bind(null, slug), {} as ImportState);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [intent, setIntent] = useState<"preview" | "commit">("preview");

  // React resets file inputs after a form action, so the chosen file lives in state and is sent explicitly.
  function submit(next: "preview" | "commit") {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("intent", next);
    setIntent(next);
    startTransition(() => action(fd));
  }
  const preview = state.preview && file?.name === state.preview.fileName ? state.preview : null;

  function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
  }

  if (state.imported) {
    return (
      <Card className="flex flex-col items-center px-6 py-14 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-success text-white shadow-[0_4px_0_var(--success-deep)]">
          <Icon name="check" size={32} strokeWidth={2.6} />
        </span>
        <h2 className="mt-5 font-display fs-30 font-black">{state.imported} students imported</h2>
        <p className="mt-2 max-w-[48ch] fs-15 text-muted">They&apos;re on your register with admission numbers, classes and parent contacts. Siblings were linked automatically.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <ButtonLink href={`/s/${slug}/students/import`} variant="secondary" onClick={() => window.location.reload()}>
            Import another file
          </ButtonLink>
          <ButtonLink href={`/s/${slug}/students`}>View students</ButtonLink>
        </div>
      </Card>
    );
  }

  const canCommit = preview && preview.errors.length === 0 && preview.valid.length > 0 && preview.overLimit === 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="flex h-fit flex-col gap-5 p-5">
        <Step n={1} title="Download the template" text="Your class names are listed inside it." done={Boolean(file)} active={!file} />
        <Step n={2} title="Fill it in" text="One student per row. Copy from your existing register." done={Boolean(file)} />
        <Step n={3} title="Upload and check" text="We check every row before anything is saved." done={Boolean(preview)} active={Boolean(file) && !preview} />
        <Step n={4} title="Import" text="All rows go in together, or none do." active={Boolean(preview)} />
        <a
          href={`/s/${slug}/students/import/template`}
          className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-chunk border-2 border-line-strong bg-canvas fs-14.5 font-bold text-ink shadow-[0_3px_0_var(--line-strong)] hover:bg-paper active:translate-y-[3px] active:shadow-none"
        >
          <Icon name="download" size={18} /> Download template
        </a>
      </Card>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-5">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-brand bg-brand-wash" : "border-line-strong bg-paper hover:border-brand/60",
            )}
          >
            <IconChip icon="upload" tone="brand" size={52} />
            {file ? (
              <>
                <p className="mt-4 font-semibold text-ink">{file.name}</p>
                <p className="fs-13.5 text-muted">{(file.size / 1024).toFixed(0)} KB · click to choose a different file</p>
              </>
            ) : (
              <>
                <p className="mt-4 font-semibold text-ink">Drop your spreadsheet here, or click to choose</p>
                <p className="fs-13.5 text-muted">Excel (.xlsx) or CSV, up to 2,000 students and 5 MB</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </label>
          {file && !preview ? (
            <div>
              <Button onClick={() => submit("preview")} disabled={pending}>
                {pending ? "Checking every row…" : "Check file"}
              </Button>
            </div>
          ) : null}

          {preview ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="flex items-center gap-3 p-4">
                  <IconChip icon="checkCircle" tone="success" />
                  <div>
                    <p className="tabular fs-22 font-semibold text-ink">{preview.valid.length}</p>
                    <p className="fs-13 text-muted">ready to import</p>
                  </div>
                </Card>
                <Card className="flex items-center gap-3 p-4">
                  <IconChip icon="alert" tone={preview.errors.length ? "danger" : "neutral"} />
                  <div>
                    <p className="tabular fs-22 font-semibold text-ink">{preview.errors.length}</p>
                    <p className="fs-13 text-muted">rows with problems</p>
                  </div>
                </Card>
                <Card className="flex items-center gap-3 p-4">
                  <IconChip icon="layers" tone="blue" />
                  <div>
                    <p className="tabular fs-22 font-semibold text-ink">{new Set(preview.valid.map((v) => v.className).filter(Boolean)).size}</p>
                    <p className="fs-13 text-muted">classes</p>
                  </div>
                </Card>
              </div>

              {preview.unknownHeaders.length ? (
                <Alert tone="warning" title="Some columns were ignored">
                  We didn&apos;t recognise: {preview.unknownHeaders.join(", ")}. Rename them to match the template if they matter.
                </Alert>
              ) : null}
              {preview.overLimit > 0 ? (
                <Alert tone="danger" title="This goes over your plan's student limit">
                  Your plan allows {preview.limit} active students. Remove {preview.overLimit} rows or upgrade your plan.
                </Alert>
              ) : null}

              {preview.errors.length ? (
                <TableCard title={<span className="text-danger">Fix these rows, then upload the file again</span>}>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Row</Th>
                        <Th>Student</Th>
                        <Th>Problem</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.errors.slice(0, 200).map((e) => (
                        <tr key={e.row}>
                          <Td className="tabular w-16 font-mono text-muted">{e.row}</Td>
                          <Td className="whitespace-nowrap font-medium">{e.name}</Td>
                          <Td>
                            <ul className="flex flex-col gap-1 fs-14 text-danger">
                              {e.messages.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableCard>
              ) : null}

              {preview.valid.length ? (
                <TableCard title="Ready to import" toolbar={<Badge tone="success">{preview.valid.length} students</Badge>}>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Row</Th>
                        <Th>Student</Th>
                        <Th>Class</Th>
                        <Th>Admission no</Th>
                        <Th>Parent</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.valid.slice(0, 100).map((r) => (
                        <tr key={r.row}>
                          <Td className="tabular w-16 font-mono text-muted">{r.row}</Td>
                          <Td className="font-medium">{r.name}</Td>
                          <Td>{r.className ?? <span className="text-muted">No class</span>}</Td>
                          <Td className="font-mono fs-13">{r.admissionNo ?? <span className="font-sans text-muted">Generated</span>}</Td>
                          <Td className="text-body">{r.parent ?? <Badge tone="warning">None</Badge>}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {preview.valid.length > 100 ? <p className="px-5 pb-4 fs-13.5 text-muted">And {preview.valid.length - 100} more.</p> : null}
                </TableCard>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  Start over
                </Button>
                <Button onClick={() => submit("commit")} disabled={!canCommit || pending}>
                  {pending && intent === "commit" ? "Importing…" : `Import ${preview.valid.length} students`}
                </Button>
              </div>
            </>
          ) : null}
        </div>
        <p className="fs-13.5 text-muted">
          Prefer to type them in? <Link href={`/s/${slug}/students/new`} className="font-semibold text-blue hover:underline">Add students one at a time</Link>.
        </p>
      </div>
    </div>
  );
}
