"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { initialFormState } from "@/lib/form-state";
import { colleagueStartAction, staffStartAction } from "../actions";

export function StaffNewMessage({ slug, kids, defaultStudent, offApp }: { slug: string; kids: { id: string; label: string; group: string }[]; defaultStudent: string; offApp: number }) {
  const router = useRouter();
  const [state, action] = useActionState(staffStartAction.bind(null, slug), initialFormState);
  useEffect(() => {
    if (state.data?.conversationId) router.replace(`/s/${slug}/messages/${state.data.conversationId}`);
  }, [state.data?.conversationId, router, slug]);
  const groups = [...new Set(kids.map((k) => k.group))];
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Whose parents" htmlFor="sm-student" hint={offApp ? `${offApp} other ${offApp === 1 ? "child's parents aren't" : "children's parents aren't"} on the app yet.` : undefined}>
        <Select id="sm-student" name="studentId" required defaultValue={state.values?.studentId ?? defaultStudent}>
          <option value="" disabled>
            Choose a child…
          </option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {kids
                .filter((k) => k.group === g)
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <Field label="Subject" htmlFor="sm-subject">
        <Input id="sm-subject" name="subject" required maxLength={120} defaultValue={state.values?.subject} placeholder="e.g. Homework this week" />
      </Field>
      <Field label="Message" htmlFor="sm-body">
        <Textarea id="sm-body" name="body" required rows={6} maxLength={2000} defaultValue={state.values?.body} />
      </Field>
      <SubmitButton pendingText="Sending…">Send</SubmitButton>
    </form>
  );
}

export function ColleagueMessage({ slug, colleagues }: { slug: string; colleagues: { userId: string; name: string; jobTitle: string | null }[] }) {
  const router = useRouter();
  const [state, action] = useActionState(colleagueStartAction.bind(null, slug), initialFormState);
  useEffect(() => {
    if (state.data?.conversationId) router.replace(`/s/${slug}/messages/${state.data.conversationId}`);
  }, [state.data?.conversationId, router, slug]);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 fs-14 font-medium text-ink">To</legend>
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
          {colleagues.map((c) => (
            <label key={c.userId} className="flex items-center gap-2.5 rounded-chunk border border-line-strong px-3 py-2 fs-14 has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
              <input type="checkbox" name="userIds" value={c.userId} className="size-4 accent-[var(--brand)]" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{c.name}</span>
                {c.jobTitle ? <span className="block truncate fs-12.5 text-muted">{c.jobTitle}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Subject" htmlFor="cm-subject">
        <Input id="cm-subject" name="subject" required maxLength={120} defaultValue={state.values?.subject} />
      </Field>
      <Field label="Message" htmlFor="cm-body">
        <Textarea id="cm-body" name="body" required rows={6} maxLength={2000} defaultValue={state.values?.body} />
      </Field>
      <SubmitButton pendingText="Sending…">Send</SubmitButton>
    </form>
  );
}
