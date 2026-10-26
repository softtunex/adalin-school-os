"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { KOLA_SVG } from "@/lib/kola-svg";

type Msg = { role: "user" | "assistant"; content: string };

const KOLA_IMG = `data:image/svg+xml;utf8,${encodeURIComponent(KOLA_SVG)}`;
const STARTERS = ["What can I do on this page?", "How do I get started?", "What can my role do?"];

/** Turns Kola's reply into text with working links (only to pages inside SchoolHub) and bold. */
function rich(text: string, linkPrefix: string, onLink: () => void): ReactNode[] {
  // Raw addresses that slip through, like "(/p)" or "(e.g., `/p/children/…`)", are noise to people: drop them.
  const tidy = text.replace(/(?<!\])\s*\((?:e\.g\.,?\s*)?`?\/(?:p|s)(?:[/?][^)\s`]*)?`?\)/g, "").replace(/`([^`]+)`/g, "$1");
  return tidy.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return link[2] === linkPrefix || link[2].startsWith(`${linkPrefix}/`) || link[2].startsWith(`${linkPrefix}?`) ? (
        <Link key={i} href={link[2]} onClick={onLink} className="font-semibold text-brand underline underline-offset-2">
          {link[1]}
        </Link>
      ) : (
        <span key={i}>{link[1]}</span>
      );
    }
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    return bold ? <strong key={i}>{bold[1]}</strong> : part;
  });
}

type Ask = (input: { messages: Msg[]; page: string }) => Promise<{ reply?: string; error?: string }>;

/** linkPrefix: replies may only link inside this part of the app (the school, or the parent app). */
export function KolaChat({ ask, linkPrefix, firstName, starters = STARTERS, aboveTabs = false }: { ask: Ask; linkPrefix: string; firstName: string; starters?: string[]; aboveTabs?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setDraft("");
    setError(null);
    start(async () => {
      const r = await ask({ messages: next, page: pathname });
      if (r.reply) setMessages((m) => [...m, { role: "assistant", content: r.reply! }]);
      else setError(r.error ?? "Kola couldn't answer just now. Please try again.");
    });
  };
  const closeOnPhone = () => {
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  };

  return (
    <>
      {/* Room at the end of every page so the Kola button never covers the last row. */}
      <div aria-hidden className="h-16" />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close Kola" : "Ask Kola for help"}
        className={cn(
          "fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 z-40 flex items-center gap-2 rounded-full border border-line-strong bg-canvas py-1.5 pl-1.5 pr-4 shadow-lg transition-transform hover:-translate-y-0.5 sm:right-6",
          aboveTabs && "max-sm:bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]",
          open && "max-sm:hidden",
        )}
      >
        <span className="grid size-10 place-items-center rounded-full bg-brand-wash">
          <img src={KOLA_IMG} alt="" className="size-9" />
        </span>
        <span className="fs-14.5 font-semibold text-ink">{open ? "Close" : "Ask Kola"}</span>
      </button>

      {open ? (
        <section
          role="dialog"
          aria-label="Kola, your SchoolHub helper"
          className="fixed z-50 flex flex-col overflow-hidden border border-line bg-canvas shadow-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[85dvh] max-sm:rounded-t-[20px] sm:bottom-24 sm:right-6 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[400px] sm:rounded-[20px]"
        >
          <header className="flex items-center gap-3 border-b border-line bg-brand-wash px-4 py-3">
            <img src={KOLA_IMG} alt="" className="size-10" />
            <div className="min-w-0 flex-1">
              <h2 className="fs-15.5 font-semibold text-ink">Kola</h2>
              <p className="fs-13 text-muted">Your SchoolHub helper</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Kola" className="grid size-9 place-items-center rounded-chunk text-muted hover:bg-canvas hover:text-ink">
              <Icon name="x" size={18} />
            </button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
            <div className="max-w-[85%] self-start whitespace-pre-line rounded-[16px] rounded-tl-[4px] bg-paper px-3.5 py-2.5 fs-14.5 text-ink">
              Hi {firstName}! I&apos;m Kola. Ask me how to do anything in SchoolHub and I&apos;ll show you where to go.
            </div>
            {messages.length === 0 ? (
              <div className="flex flex-wrap gap-2">
                {starters.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-brand/40 bg-canvas px-3 py-1.5 fs-13.5 font-medium text-ink hover:bg-brand-wash">
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="max-w-[85%] self-end whitespace-pre-line rounded-[16px] rounded-tr-[4px] bg-brand px-3.5 py-2.5 fs-14.5 text-white">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="max-w-[90%] self-start whitespace-pre-line rounded-[16px] rounded-tl-[4px] bg-paper px-3.5 py-2.5 fs-14.5 text-ink">
                  {rich(m.content, linkPrefix, closeOnPhone)}
                </div>
              ),
            )}
            {pending ? (
              <div className="self-start rounded-[16px] bg-paper px-3.5 py-2.5 fs-14 text-muted" role="status">
                Kola is thinking…
              </div>
            ) : null}
            {error ? (
              <div className="self-start rounded-[12px] border border-danger/30 bg-danger-wash px-3.5 py-2.5 fs-14 text-danger" role="alert">
                {error}
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2 border-t border-line p-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              maxLength={1500}
              placeholder="Ask Kola a question…"
              aria-label="Your question for Kola"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-chunk border border-line-strong bg-canvas px-3.5 py-2.5 fs-15 text-ink placeholder:text-muted focus:border-blue focus:outline-none"
            />
            <button type="submit" disabled={pending || !draft.trim()} aria-label="Send" className="grid size-11 shrink-0 place-items-center rounded-chunk bg-brand text-white disabled:opacity-50">
              <Icon name="arrowRight" size={18} />
            </button>
          </form>
          <p className="px-4 pb-2 text-center fs-12 text-muted">Kola can make mistakes. It can&apos;t see or change your school&apos;s records.</p>
        </section>
      ) : null}
    </>
  );
}
