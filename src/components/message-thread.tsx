"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { FormState } from "@/lib/form-state";
import { initialFormState } from "@/lib/form-state";
import { SubmitButton } from "./ui/button";
import { Alert, Avatar } from "./ui/display";
import { Icon } from "./ui/icons";

type Msg = { id: string; senderId: string | null; senderName: string; body: string; createdAt: string };

function when(iso: string) {
  const d = new Date(iso);
  const lagos = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const today = lagos(new Date()) === lagos(d);
  return d.toLocaleString("en-NG", today ? { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" } : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
}

/** A conversation: bubbles, a reply box, and a quiet refresh so new replies show up without reloading. */
export function MessageThread({
  me,
  messages,
  reply,
  closedReason,
}: {
  me: string;
  messages: Msg[];
  reply: ((prev: FormState, fd: FormData) => Promise<FormState>) | null;
  closedReason?: string | null;
}) {
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(reply ?? (async () => initialFormState), initialFormState);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    if (state.success) form.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {messages.map((m, i) => {
          const mine = m.senderId === me;
          const showName = !mine && messages[i - 1]?.senderId !== m.senderId;
          return (
            <li key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
              {!mine ? <span className="w-8 shrink-0">{showName ? <Avatar name={m.senderName} size={32} /> : null}</span> : null}
              <div className={cn("flex max-w-[82%] flex-col gap-1", mine ? "items-end" : "items-start")}>
                {showName ? <span className="px-1 fs-12.5 font-semibold text-muted">{m.senderName}</span> : null}
                <div className={cn("whitespace-pre-line rounded-[18px] px-4 py-2.5 fs-15 leading-relaxed", mine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-line bg-canvas text-ink")}>{m.body}</div>
                <span className="px-1 fs-11.5 text-muted">{when(m.createdAt)}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={end} />
      {reply ? (
        closedReason ? (
          <Alert tone="blue">{closedReason}</Alert>
        ) : (
          <form ref={form} action={action} className="sticky bottom-20 flex flex-col gap-2 rounded-card border border-line bg-canvas p-3 shadow-card sm:bottom-4">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            <label htmlFor="reply" className="sr-only">
              Your reply
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="reply"
                name="body"
                required
                rows={2}
                maxLength={2000}
                defaultValue={state.error ? state.values?.body : undefined}
                placeholder="Write a reply…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
                }}
                className="min-h-12 flex-1 resize-none rounded-chunk border border-line-strong bg-canvas px-3.5 py-2.5 fs-15 text-ink placeholder:text-muted focus:border-blue focus:outline-none"
              />
              <SubmitButton aria-label="Send" pendingText={<Icon name="send" size={18} />} className="h-12 w-12 px-0">
                <Icon name="send" size={18} />
              </SubmitButton>
            </div>
          </form>
        )
      ) : null}
    </div>
  );
}
