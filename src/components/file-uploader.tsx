"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type UploadTicket = { fileId: string; url: string; headers: Record<string, string> } | { error: string };
export type ExistingFile = { id: string; name: string; size: number };

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt";
const MAX = 10 * 1024 * 1024;

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Item = { key: string; name: string; size: number; progress: number; fileId?: string; error?: string };

function put(url: string, headers: Record<string, string>, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

/**
 * Uploads straight to storage, then puts the file ids in hidden `fileIds` inputs for the form.
 * Existing files can be removed (their ids go in `removeFileIds`).
 */
export function FileUploader({
  request,
  existing = [],
  max = 5,
  label = "Attach files",
  onBusyChange,
}: {
  request: (name: string, size: number) => Promise<UploadTicket>;
  existing?: ExistingFile[];
  max?: number;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const kept = existing.filter((f) => !removed.includes(f.id));
  const room = max - kept.length - items.filter((i) => !i.error).length;

  function update(key: string, patch: Partial<Item>) {
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  async function add(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    const fresh = picked.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, name: f.name, size: f.size, progress: 0, file: f }));
    setItems((all) => [...all, ...fresh.map(({ file: _f, ...i }) => i)]);
    onBusyChange?.(true);
    await Promise.all(
      fresh.map(async ({ key, file }) => {
        if (file.size > MAX) return update(key, { error: "Too big (10 MB max)" });
        try {
          const ticket = await request(file.name, file.size);
          if ("error" in ticket) return update(key, { error: ticket.error });
          await put(ticket.url, ticket.headers, file, (p) => update(key, { progress: p }));
          update(key, { progress: 1, fileId: ticket.fileId });
        } catch {
          update(key, { error: "Upload failed. Check your connection and try again." });
        }
      }),
    );
    onBusyChange?.(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      {removed.map((id) => (
        <input key={id} type="hidden" name="removeFileIds" value={id} />
      ))}
      {items.map((i) => (i.fileId ? <input key={i.key} type="hidden" name="fileIds" value={i.fileId} /> : null))}
      {kept.length + items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {kept.map((f) => (
            <FileRow key={f.id} name={f.name} size={f.size} onRemove={() => setRemoved((r) => [...r, f.id])} />
          ))}
          {items.map((i) => (
            <FileRow key={i.key} name={i.name} size={i.size} progress={i.fileId ? undefined : i.progress} error={i.error} onRemove={() => setItems((all) => all.filter((x) => x.key !== i.key))} />
          ))}
        </ul>
      ) : null}
      {room > 0 ? (
        <label
          className="flex cursor-pointer items-center justify-center gap-2 rounded-chunk border-2 border-dashed border-line-strong px-4 py-4 fs-14 font-medium text-muted transition hover:border-brand hover:text-brand-ink"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
        >
          <Icon name="upload" size={18} />
          <span>
            {label} <span className="font-normal">· PDF, Word, Excel, slides or photos, 10 MB each</span>
          </span>
          <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => add(e.target.files)} />
        </label>
      ) : null}
    </div>
  );
}

function FileRow({ name, size, progress, error, onRemove }: { name: string; size: number; progress?: number; error?: string; onRemove: () => void }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-chunk border px-3 py-2", error ? "border-danger/40 bg-danger-wash" : "border-line bg-canvas")}>
      <Icon name="file" size={18} className={error ? "text-danger" : "text-muted"} />
      <div className="min-w-0 flex-1">
        <p className="truncate fs-14 font-medium text-ink">{name}</p>
        {error ? (
          <p className="fs-13 text-danger">{error}</p>
        ) : progress !== undefined ? (
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-sunken">
            <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        ) : (
          <p className="fs-13 text-muted">{formatSize(size)}</p>
        )}
      </div>
      <button type="button" onClick={onRemove} className="rounded-full p-1 text-muted hover:bg-sunken hover:text-ink" aria-label={`Remove ${name}`}>
        <Icon name="x" size={16} />
      </button>
    </li>
  );
}

/** Download links for attached files. */
export function FileLinks({ files, className }: { files: ExistingFile[]; className?: string }) {
  if (files.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={`/files/${f.id}`}
            target="_blank"
            rel="noopener"
            className="inline-flex max-w-full items-center gap-2 rounded-chunk border border-line bg-canvas px-3 py-2 fs-14 font-medium text-ink hover:border-brand hover:text-brand-ink"
          >
            <Icon name="file" size={16} className="shrink-0 text-brand" />
            <span className="truncate">{f.name}</span>
            <span className="shrink-0 fs-12.5 font-normal text-muted">{formatSize(f.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
